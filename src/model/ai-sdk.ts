import { jsonSchema as sdkJsonSchema, streamText, tool, type ModelMessage, type ToolSet, type AssistantModelMessage, type LanguageModel } from "ai";
import { jsonSchema, modelScope, unauthenticatedApiKey, type Json, type Usage } from "../shared/model.ts";
import { ModelFailure, type ModelAdapter, type ModelEvent, type ModelInput, type PreparedModel, type ModelValidationInput } from "./contract.ts";
import { createProviderModel, validateProviderTransport } from "./provider.ts";
import { projectSystemPrompt } from "../modules/agent/system-prompt.ts";

const adapterVersion = "ai-sdk-v7/3";
function validateContinuation(item: { adapter: string; scope: string }, scope: string): void {
  if (item.adapter !== adapterVersion) throw new ModelFailure("replay_version", "The saved response needs a compatible protocol adapter.");
  if (item.scope !== scope) throw new ModelFailure("model_switch", "Cross-model continuation is not supported yet. Start from a history position before the model output.");
}
function json(value: unknown): Json { return jsonSchema.parse(JSON.parse(JSON.stringify(value))); }
function usesPlainResponseReasoning(input: ModelValidationInput): boolean {
  const { provider } = input.settings;
  return provider.protocol === "openai-responses" && new URL(provider.baseUrl).hostname === "api.deepseek.com";
}
function reasoningFor(input: ModelValidationInput) {
  const thinking = input.settings.model.capabilities.reasoning ? input.settings.thinking : null;
  return thinking === "off" ? "none" as const : thinking ?? undefined;
}
function providerOptions(input: ModelValidationInput): Record<string, Record<string, Json>> {
  const { provider, thinking, model } = input.settings;
  if (thinking && thinking !== "off" && !model.capabilities.reasoning) throw new ModelFailure("unsupported_thinking", "This model does not support thinking.");
  if (provider.protocol === "anthropic") {
    // SDK 按模型能力把统一 reasoning 参数转换成 adaptive 或预算模式。
    return {};
  }
  return { openai: { ...(provider.protocol === "openai-responses" ? {
    store: false, include: ["reasoning.encrypted_content"],
    // 能力由工坊配置声明，兼容端点的模型名不必在 SDK 的 OpenAI 名单中。
    ...(model.capabilities.reasoning ? { forceReasoning: true } : {}),
    // DeepSeek 把 developer 视为 user，系统指令需保留 system 身份。
    ...(usesPlainResponseReasoning(input) ? { systemMessageMode: "system" } : {}),
    ...(model.capabilities.reasoning && thinking !== "off" ? { reasoningSummary: "auto" } : {}),
  } : {}),
    ...(reasoningFor(input) ? { reasoningEffort: reasoningFor(input)! } : {}) } };
}
/** 只保留白名单续接资料，不持久化原始 HTTP、响应头或未筛选的 provider metadata。 */
export function pickContinuation(metadata: unknown): Record<string, Record<string, Json>> {
  const options: Record<string, Record<string, Json>> = {};
  if (!metadata || typeof metadata !== "object") return options;
  for (const [provider, keys] of Object.entries({ anthropic: ["signature", "redactedData"], openai: ["itemId", "reasoningEncryptedContent", "phase"] })) {
    const source = (metadata as Record<string, unknown>)[provider];
    if (!source || typeof source !== "object" || Array.isArray(source)) continue;
    const picked: Record<string, Json> = {};
    for (const key of keys) { const v = (source as Record<string, unknown>)[key]; if (v !== undefined) picked[key] = json(v); }
    if (Object.keys(picked).length) options[provider] = picked;
  }
  return options;
}
export function sdkMessages(input: ModelInput): ModelMessage[] {
  const messages: ModelMessage[] = [];
  const scope = modelScope(input.settings);
  const plainReasoning = usesPlainResponseReasoning(input);
  for (const item of input.messages) {
    if (item.kind === "input" || item.kind === "context") messages.push({ role: "user", content: item.parts.map(part =>
      part.kind === "text" ? { type: "text" as const, text: part.text }
        // 各模态统一按 AI SDK 文件部件发送，mediaType 为编码标签；端点是否接受由服务端反馈。
        : { type: "file" as const, data: part.data, mediaType: part.mediaType, ...(part.filename ? { filename: part.filename } : {}) }) });
    if (item.kind === "output") {
      validateContinuation(item, scope);
      messages.push({ role: "assistant", content: item.parts.map(p => {
        // DeepSeek 将 reasoning.content 合入相邻 assistant 正文，不支持 summary/encrypted_content 输入。
        const plainThinking = plainReasoning && p.kind === "thinking";
        const providerOptions = (plainThinking ? {} : p.continuation ?? {}) as Record<string, Record<string, never>>;
        return p.kind === "toolcall" ? { type: "tool-call" as const, toolCallId: p.callId, toolName: p.name, input: p.arguments, providerOptions }
          : { type: p.kind === "text" || plainThinking ? "text" as const : "reasoning" as const, text: p.text, providerOptions };
      }) } as AssistantModelMessage);
    }
    if (item.kind === "result") {
      const outcome = item.outcome;
      const output = outcome.kind === "succeeded" || outcome.kind === "partial"
        ? { type: "json" as const, value: outcome.model }
        : { type: "error-json" as const, value: outcome.model };
      const part = { type: "tool-result" as const, toolCallId: item.callId, toolName: item.name, output };
      const previous = messages.at(-1);
      if (previous?.role === "tool") previous.content.push(part);
      else messages.push({ role: "tool", content: [part] });
    }
  }
  return messages;
}
export class AiSdkAdapter implements ModelAdapter {
  readonly version = adapterVersion;
  constructor(private readonly readCredential: (providerId: string) => Promise<string | null>,
    private readonly languageModelFactory?: (input: ModelInput, key: string) => LanguageModel) {}
  validate(input: ModelValidationInput): void {
    validateProviderTransport(input.settings.provider);
    providerOptions(input);
    const scope = modelScope(input.settings);
    for (const item of input.messages) if (item.kind === "output") validateContinuation(item, scope);
  }
  prepare(input: ModelInput): PreparedModel {
    this.validate(input);
    const messages = sdkMessages(input);
    const system = projectSystemPrompt(input.system);
    const options = providerOptions(input);
    return { stream: signal => this.stream(input, system, messages, options, signal) };
  }
  private async *stream(input: ModelInput, system: string, messages: ModelMessage[], providerOptions: Record<string, Record<string, Json>>, signal: AbortSignal): AsyncIterable<ModelEvent> {
    const { provider, model } = input.settings;
    const key = provider.auth === "none" ? unauthenticatedApiKey : await this.readCredential(provider.id);
    if (!key) throw new ModelFailure("missing_credential", "Provider credentials are unavailable.");
    const languageModel = this.languageModelFactory?.(input, key) ?? createProviderModel(provider, model, key);
    const plainReasoning = usesPlainResponseReasoning(input);
    const tools: ToolSet = Object.fromEntries(input.tools.map(t => [t.name, tool({ description: t.description, inputSchema: sdkJsonSchema(t.parameters as Record<string, unknown>) })]));
    const result = streamText({ model: languageModel, system, messages, tools,
      providerOptions, maxOutputTokens: model.generation.maxOutputTokens ?? undefined, maxRetries: 0, abortSignal: signal,
      temperature: model.generation.temperature ?? undefined, topP: model.generation.topP ?? undefined,
      reasoning: reasoningFor(input),
      include: { rawChunks: plainReasoning },
      // SDK 不执行工具；单步结果交还工坊循环，工具注册中不提供 execute。
      onError: () => {},
    });
    const calls = new Set<string>();
    const plainThinkingParts = new Map<string, string>();
    const continuations = new Map<string, ReturnType<typeof pickContinuation>>();
    const collectContinuation = (id: string, metadata: unknown) => {
      const accumulated = continuations.get(id) ?? {};
      for (const [provider, values] of Object.entries(pickContinuation(metadata))) {
        accumulated[provider] = { ...accumulated[provider], ...values };
      }
      continuations.set(id, accumulated);
      return accumulated;
    };
    const rejectedBySdk = new Set<string>();
    let finish: { reason: string; rawFinishReason?: string; usage: Usage } | null = null;
    for await (const event of result.stream) {
      switch (event.type) {
        case "text-start": case "reasoning-start": {
          const kind = event.type === "text-start" ? "text" : "thinking";
          const id = `${kind}:${event.id}`;
          const metadata = collectContinuation(id, event.providerMetadata);
          if (plainReasoning && kind === "thinking" && typeof metadata.openai?.itemId === "string") {
            plainThinkingParts.set(metadata.openai.itemId, id);
          }
          yield { type: "part.start", part: { id, kind } };
          break;
        }
        case "raw": {
          if (!plainReasoning || !event.rawValue || typeof event.rawValue !== "object") break;
          const raw = event.rawValue as Record<string, unknown>;
          // SDK 尚未解码 DeepSeek 的 reasoning_text；只取已知正文增量，不保存原始帧。
          if (raw.type !== "response.reasoning_text.delta") break;
          if (typeof raw.item_id !== "string" || typeof raw.delta !== "string") {
            throw new ModelFailure("protocol", "The provider returned an invalid reasoning text delta.");
          }
          const partId = plainThinkingParts.get(raw.item_id);
          if (!partId) throw new ModelFailure("protocol", "The provider updated an inactive reasoning item.");
          yield { type: "part.delta", partId, delta: raw.delta };
          break;
        }
        case "text-delta": case "reasoning-delta": {
          const partId = `${event.type === "text-delta" ? "text" : "thinking"}:${event.id}`;
          collectContinuation(partId, event.providerMetadata);
          yield { type: "part.delta", partId, delta: event.text };
          break;
        }
        case "text-end": case "reasoning-end": {
          const partId = `${event.type === "text-end" ? "text" : "thinking"}:${event.id}`;
          const metadata = collectContinuation(partId, event.providerMetadata);
          if (typeof metadata.openai?.itemId === "string") plainThinkingParts.delete(metadata.openai.itemId);
          yield { type: "part.end", partId, continuation: metadata };
          continuations.delete(partId);
          break;
        }
        case "tool-input-start":
          if (event.providerExecuted) throw new ModelFailure("server_tool", "Provider-executed tools are not supported.");
          calls.add(event.id);
          yield { type: "part.start", part: { id: `tool:${event.id}`, kind: "toolcall", callId: event.id, name: event.toolName } }; break;
        case "tool-input-delta": yield { type: "part.delta", partId: `tool:${event.id}`, delta: event.delta }; break;
        case "tool-call":
          if (event.providerExecuted) throw new ModelFailure("invalid_tool_call", "Provider-executed tools are not supported.");
          if (event.invalid) rejectedBySdk.add(event.toolCallId);
          if (!calls.has(event.toolCallId)) {
            calls.add(event.toolCallId);
            yield { type: "part.start", part: { id: `tool:${event.toolCallId}`, kind: "toolcall", callId: event.toolCallId, name: event.toolName } };
          }
          yield { type: "part.end", partId: `tool:${event.toolCallId}`, arguments: json(event.input), continuation: pickContinuation(event.providerMetadata) }; break;
        case "error": throw new ModelFailure("provider_error", "The provider request failed. Check provider configuration and connectivity.");
        case "abort": throw new ModelFailure("cancelled", "The provider stream was cancelled.");
        case "tool-error":
          // SDK 会为解析/目录错误合成结果；正式拒绝由工坊记录，避免保存 SDK 错误对象。
          if (!event.providerExecuted && rejectedBySdk.has(event.toolCallId)) break;
          throw new ModelFailure("unsupported_content", "The provider returned an unexpected tool result.");
        // custom 是 provider 扩展元数据（如 Anthropic message_start 的早期用量），非正文内容；
        // 用量与续接已在 finish 与 pickContinuation 白名单收束，无需处理。
        case "custom": break;
        case "file": case "reasoning-file": case "tool-result":
          throw new ModelFailure("unsupported_content", "The provider returned unsupported response content.");
        case "finish": {
          const u = event.totalUsage;
          finish = { reason: event.finishReason, rawFinishReason: event.rawFinishReason, usage: { input: u.inputTokens ?? null, output: u.outputTokens ?? null, total: u.totalTokens ?? null,
            reasoning: u.outputTokenDetails.reasoningTokens ?? null, cacheRead: u.inputTokenDetails.cacheReadTokens ?? null, cacheWrite: u.inputTokenDetails.cacheWriteTokens ?? null } };
          break;
        }
      }
    }
    if (!finish) throw new ModelFailure("interrupted", "The provider stream ended without a finish event.");
    const response = await result.response;
    yield { type: "finish", ...finish, responseId: response.id };
  }
}
