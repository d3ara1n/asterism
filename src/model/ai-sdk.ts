import { jsonSchema as sdkJsonSchema, streamText, tool, type ModelMessage, type ToolSet, type AssistantModelMessage, type LanguageModel } from "ai";
import { jsonSchema, type Json, type Usage } from "../shared/conversation.ts";
import { modelScope } from "../conversation/projection.ts";
import { ModelFailure, type ModelAdapter, type ModelEvent, type ModelInput, type PreparedModel } from "./contract.ts";
import { createProviderModel, validateProviderTransport } from "./provider.ts";
import { projectSystemPrompt } from "./system-prompt.ts";

function json(value: unknown): Json { return jsonSchema.parse(JSON.parse(JSON.stringify(value))); }
function reasoningFor(input: ModelInput) {
  const thinking = input.settings.model.capabilities.reasoning ? input.settings.thinking : null;
  return thinking === "off" ? "none" as const : thinking ?? undefined;
}
function providerOptions(input: ModelInput): Record<string, Record<string, Json>> {
  const { provider, thinking, model } = input.settings;
  if (thinking && thinking !== "off" && !model.capabilities.reasoning) throw new ModelFailure("unsupported_thinking", "This model does not support thinking.");
  if (provider.protocol === "anthropic") {
    // SDK 按模型能力把统一 reasoning 参数转换成 adaptive 或预算模式。
    return {};
  }
  return { openai: { ...(provider.protocol === "openai-responses" ? { store: false, include: ["reasoning.encrypted_content"] } : {}),
    ...(reasoningFor(input) ? { reasoningEffort: reasoningFor(input)! } : {}) } };
}
/** 只保留白名单续接资料，不持久化原始 HTTP 请求、响应头或错误对象。 */
function replayMessage(message: AssistantModelMessage): Json {
  if (typeof message.content === "string") return json(message);
  return json({ role: "assistant", content: message.content.map(part => {
    if (part.type !== "text" && part.type !== "reasoning" && part.type !== "tool-call") throw new ModelFailure("unsupported_content", "This response contains unsupported content and cannot be continued safely.");
    const options: Record<string, Record<string, Json>> = {};
    for (const [provider, keys] of Object.entries({ anthropic: ["signature", "redactedData"], openai: ["itemId", "reasoningEncryptedContent", "phase"] })) {
      const source = part.providerOptions?.[provider];
      if (!source || typeof source !== "object" || Array.isArray(source)) continue;
      const picked: Record<string, Json> = {};
      for (const key of keys) if (source[key] !== undefined) picked[key] = json(source[key]);
      if (Object.keys(picked).length) options[provider] = picked;
    }
    return { ...part, providerOptions: options };
  }) });
}
export function sdkMessages(input: ModelInput): ModelMessage[] {
  const messages: ModelMessage[] = [];
  const scope = modelScope(input.settings);
  for (const item of input.messages) {
    if (item.kind === "input" || item.kind === "context") messages.push({ role: "user", content: item.text });
    if (item.kind === "output") {
      if (item.adapter !== "ai-sdk-v7/1") throw new ModelFailure("replay_version", "The saved response needs a compatible protocol adapter.");
      if (item.scope !== scope) throw new ModelFailure("model_switch", "Cross-model continuation is not supported yet. Start from a history position before the model output.");
      if (!item.replay) throw new ModelFailure("missing_replay", "The response is missing protocol continuation data.");
      messages.push(item.replay as unknown as AssistantModelMessage);
    }
    if (item.kind === "result") {
      const outcome = item.outcome;
      const output = outcome.kind === "succeeded" || outcome.kind === "partial"
        ? { type: "json" as const, value: outcome.model }
        : { type: "error-json" as const, value: json(outcome) };
      const part = { type: "tool-result" as const, toolCallId: item.callId, toolName: item.name, output };
      const previous = messages.at(-1);
      if (previous?.role === "tool") previous.content.push(part);
      else messages.push({ role: "tool", content: [part] });
    }
  }
  return messages;
}
export class AiSdkAdapter implements ModelAdapter {
  readonly version = "ai-sdk-v7/1";
  constructor(private readonly readCredential: (providerId: string) => Promise<string | null>,
    private readonly languageModelFactory?: (input: ModelInput, key: string) => LanguageModel) {}
  prepare(input: ModelInput): PreparedModel {
    validateProviderTransport(input.settings.provider);
    const messages = sdkMessages(input);
    const system = projectSystemPrompt(input.system);
    const options = providerOptions(input);
    return { stream: signal => this.stream(input, system, messages, options, signal) };
  }
  private async *stream(input: ModelInput, system: string, messages: ModelMessage[], providerOptions: Record<string, Record<string, Json>>, signal: AbortSignal): AsyncIterable<ModelEvent> {
    const { provider, model } = input.settings;
    const key = provider.auth === "none" ? "weft-no-auth" : await this.readCredential(provider.id);
    if (!key) throw new ModelFailure("missing_credential", "Provider credentials are unavailable.");
    const languageModel = this.languageModelFactory?.(input, key) ?? createProviderModel(provider, model, key);
    const tools: ToolSet = Object.fromEntries(input.tools.map(t => [t.name, tool({ description: t.description, inputSchema: sdkJsonSchema(t.parameters as Record<string, unknown>) })]));
    const result = streamText({ model: languageModel, system, messages, tools,
      providerOptions, maxOutputTokens: model.generation.maxOutputTokens ?? undefined, maxRetries: 0, abortSignal: signal,
      temperature: model.generation.temperature ?? undefined, topP: model.generation.topP ?? undefined,
      reasoning: reasoningFor(input),
      // SDK 不执行工具；单步结果交还织台循环，工具注册中不提供 execute。
      onError: () => {},
    });
    const calls = new Set<string>();
    const rejectedBySdk = new Set<string>();
    let finish: { reason: string; rawFinishReason?: string; usage: Usage } | null = null;
    for await (const event of result.stream) {
      switch (event.type) {
        case "text-start": case "reasoning-start":
          yield { type: "part.start", part: { id: `${event.type === "text-start" ? "text" : "thinking"}:${event.id}`, kind: event.type === "text-start" ? "text" : "thinking", text: "", complete: false } }; break;
        case "text-delta": case "reasoning-delta":
          yield { type: "part.delta", partId: `${event.type === "text-delta" ? "text" : "thinking"}:${event.id}`, delta: event.text }; break;
        case "text-end": case "reasoning-end":
          yield { type: "part.end", partId: `${event.type === "text-end" ? "text" : "thinking"}:${event.id}` }; break;
        case "tool-input-start":
          if (event.providerExecuted) throw new ModelFailure("server_tool", "Provider-executed tools are not supported.");
          calls.add(event.id);
          yield { type: "part.start", part: { id: `tool:${event.id}`, kind: "tool", callId: event.id, name: event.toolName, argumentsText: "", arguments: null, complete: false, execution: "proposed", outcome: null } }; break;
        case "tool-input-delta": yield { type: "part.delta", partId: `tool:${event.id}`, delta: event.delta }; break;
        case "tool-call":
          if (event.providerExecuted) throw new ModelFailure("invalid_tool_call", "Provider-executed tools are not supported.");
          if (event.invalid) rejectedBySdk.add(event.toolCallId);
          if (!calls.has(event.toolCallId)) {
            calls.add(event.toolCallId);
            yield { type: "part.start", part: { id: `tool:${event.toolCallId}`, kind: "tool", callId: event.toolCallId, name: event.toolName, argumentsText: JSON.stringify(event.input), arguments: null, complete: false, execution: "proposed", outcome: null } };
          }
          yield { type: "part.end", partId: `tool:${event.toolCallId}`, arguments: json(event.input) }; break;
        case "error": throw new ModelFailure("provider_error", "The provider request failed. Check provider configuration and connectivity.");
        case "abort": throw new ModelFailure("cancelled", "The provider stream was cancelled.");
        case "tool-error":
          // SDK 会为解析/目录错误合成结果；正式拒绝由织台记录，避免保存 SDK 错误对象。
          if (!event.providerExecuted && rejectedBySdk.has(event.toolCallId)) break;
          throw new ModelFailure("unsupported_content", "The provider returned an unexpected tool result.");
        case "file": case "reasoning-file": case "custom": case "tool-result":
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
    const assistants = response.messages.filter((m): m is AssistantModelMessage => m.role === "assistant");
    if (assistants.length !== 1) throw new ModelFailure("response_shape", "Expected exactly one assistant response.");
    yield { type: "finish", ...finish, responseId: response.id, replay: replayMessage(assistants[0]!) };
  }
}
