import { jsonSchema as sdkJsonSchema, streamText, tool, JSONParseError, TypeValidationError, InvalidResponseDataError,
  type ModelMessage, type ToolResultPart, type ToolSet, type LanguageModel } from "ai";
import { jsonSchema, unauthenticatedApiKey, type Json } from "../shared/model.ts";
import { ModelFailure, type ModelAdapter, type ModelEvent, type ModelInput, type ResolvedInputPart, type PreparedModel, type ModelValidationInput } from "./contract.ts";
import { createProviderModel, validateProviderTransport } from "./provider.ts";
import { projectSystemPrompt } from "./system-prompt.ts";
import { requestOptions } from "./request-options.ts";
import { aiSdkAdapterVersion, pickContinuation } from "./continuation.ts";
import { projectHistory, validateProjection } from "./projection.ts";
import { validateRequestIdentity } from "./request-identity.ts";
import { measureModel, RequestTimer } from "./request-timing.ts";
import { describeError, type ModelResponse } from "@atelier/sdk/contracts";
import { ZodError } from "zod";

function json(value: unknown): Json { return jsonSchema.parse(JSON.parse(JSON.stringify(value))); }
/** SDK 解码失败属于软件处理错误；服务端拒绝和传输失败属于模型请求结果。 */
function providerFailure(error: unknown): ModelFailure {
  if (error instanceof ModelFailure) return error;
  const details = describeError(error);
  const parsing = error instanceof SyntaxError || error instanceof ZodError
    || JSONParseError.isInstance(error) || TypeValidationError.isInstance(error) || InvalidResponseDataError.isInstance(error);
  return new ModelFailure(parsing ? "response_parsing" : "provider_error", details.message, details, parsing ? "software" : "model");
}
export function sdkMessages(input: ModelInput): ModelMessage[] {
  const messages: ModelMessage[] = [];
  const chat = input.settings.provider.protocol === "openai-chat";
  const attachments: Extract<ResolvedInputPart, { kind: "file" }>[] = [];
  /** 工具文件已由目标投影检查显式标签；获准搬运的同批文件合入后续 user 消息。 */
  const flushAttachments = () => {
    if (!attachments.length) return;
    messages.push({ role: "user", content: [{ type: "text", text: "Files attached from the preceding tool results:" },
      ...attachments.map(file => ({ type: "file" as const, data: file.data, mediaType: file.mediaType, ...(file.filename ? { filename: file.filename } : {}) }))] });
    attachments.length = 0;
  };
  for (const item of projectHistory(input)) {
    if (item.kind !== "result") flushAttachments();
    if (item.kind === "input" || item.kind === "context") messages.push({ role: "user", content: item.parts.map(part =>
      part.kind === "text" ? { type: "text" as const, text: part.text }
        // 各模态统一按 AI SDK 文件部件发送，mediaType 为编码标签；端点是否接受由服务端反馈。
        : { type: "file" as const, data: part.data, mediaType: part.mediaType, ...(part.filename ? { filename: part.filename } : {}) }) });
    if (item.kind === "output") {
      const parts = item.parts;
      if (parts.length) messages.push({ role: "assistant", content: parts.map(p => {
        const providerOptions = {
          ...p.continuation as Record<string, Record<string, Json>>,
          ...(p.kind === "thinking" ? { atelier: { summary: p.summary } } : {}),
        };
        return p.kind === "toolcall" ? { type: "tool-call" as const, toolCallId: p.callId, toolName: p.name, input: p.arguments, providerOptions }
          : { type: p.kind === "text" ? "text" as const : "reasoning" as const, text: p.text, providerOptions };
      }) });
    }
    if (item.kind === "result") {
      const files = item.parts.filter(part => part.kind === "file");
      const text = item.parts.flatMap(part => part.kind === "text" ? [part.text] : []).join("\n");
      // 文字只序列化一次；Chat 工具文件已通过显式兼容门禁，才能搬运到后续 user 消息。
      let output: ToolResultPart["output"];
      if (!files.length || chat) {
        const notice = files.length ? `[${files.length} file(s) attached in the following user message: ${files.map(file => file.filename ?? file.mediaType).join(", ")}]` : "";
        const value = [text, notice].filter(Boolean).join("\n");
        output = item.error ? { type: "error-text", value } : { type: "text", value };
        attachments.push(...files);
      } else output = { type: "content", value: item.parts.map(part => part.kind === "text" ? { type: "text" as const, text: part.text }
        : { type: "file" as const, data: { type: "data" as const, data: part.data }, mediaType: part.mediaType, ...(part.filename ? { filename: part.filename } : {}) }) };
      const part = { type: "tool-result" as const, toolCallId: item.callId, toolName: item.name, output };
      const previous = messages.at(-1);
      if (previous?.role === "tool") previous.content.push(part);
      else messages.push({ role: "tool", content: [part] });
    }
  }
  flushAttachments();
  return messages;
}
export class AiSdkAdapter implements ModelAdapter {
  readonly version = aiSdkAdapterVersion;
  constructor(private readonly readCredential: (providerId: string) => Promise<string | null>,
    private readonly languageModelFactory?: (input: ModelInput, key: string) => Exclude<LanguageModel, string>,
    private readonly transport: typeof fetch = fetch) {}
  validate(input: ModelValidationInput): void {
    validateProviderTransport(input.settings.provider);
    validateRequestIdentity(input.settings, input);
    requestOptions(input.settings.provider, input.settings.model, { purpose: "execution", thinking: input.settings.thinking, maxOutputTokens: input.maxOutputTokens });
    validateProjection(input);
  }
  prepare(input: ModelInput): PreparedModel {
    // 固定顶层请求身份，避免等待凭据时读到调用方后续替换的值。
    input = { ...input };
    this.validate(input);
    const messages = sdkMessages(input);
    const system = projectSystemPrompt(input.system);
    const options = requestOptions(input.settings.provider, input.settings.model, {
      purpose: "execution", thinking: input.settings.thinking, system, maxOutputTokens: input.maxOutputTokens,
    });
    return { stream: signal => this.stream(input, messages, options, signal) };
  }
  private async *stream(input: ModelInput, messages: ModelMessage[], options: ReturnType<typeof requestOptions>, signal: AbortSignal): AsyncIterable<ModelEvent> {
    const { provider, model } = input.settings;
    const key = provider.auth === "none" ? unauthenticatedApiKey : await this.readCredential(provider.id);
    if (!key) throw new ModelFailure("missing_credential", "Provider credentials are unavailable.");
    const controller = new AbortController();
    const streamSignal = AbortSignal.any([signal, controller.signal]);
    let responseMetadata: ModelResponse | null = null;
    // SDK 可在 doStream 返回前消费首个 SSE 错误；保留已收到的前缀，首块交付即释放。
    let capturePrefix = true, responsePrefix = "";
    const decoder = new TextDecoder();
    const transport: typeof fetch = async (url, init) => {
      const response = await this.transport(url, init);
      responseMetadata = {
        connection: { id: provider.id }, endpoint: provider.baseUrl, model: model.modelId,
        status: response.status, receivedAt: Date.now(), headers: Object.fromEntries(response.headers),
      };
      if (response.body && response.headers.get("content-type")?.includes("text/event-stream")) {
        return new Response(response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
          transform(chunk, output) {
            if (capturePrefix) responsePrefix += decoder.decode(chunk, { stream: true });
            output.enqueue(chunk);
          },
          flush() { if (capturePrefix) responsePrefix += decoder.decode(); },
        })), { status: response.status, statusText: response.statusText, headers: response.headers });
      }
      return response;
    };
    const languageModel = this.languageModelFactory?.(input, key) ?? createProviderModel(provider, model, key, transport, input);
    const tools: ToolSet = Object.fromEntries(input.tools.map(t => [t.name, tool({ description: t.description, inputSchema: sdkJsonSchema(t.parameters as Record<string, unknown>) })]));
    signal.throwIfAborted();
    const timing = new RequestTimer();
    const measured = measureModel(languageModel, provider.protocol, timing);
    const cancelled = () => { timing.end("cancelled"); };
    signal.addEventListener("abort", cancelled, { once: true });
    try {
      for await (const event of this.decode(measured, messages, tools, options, provider.protocol, streamSignal)) {
        capturePrefix = false; responsePrefix = "";
        yield event.type === "finish" ? { ...event, response: responseMetadata } : event;
      }
    } catch (error) {
      // 模型终态可能早于连接关闭或用户取消；已取得的计量仍须交付。
      if (measured.completion) yield { ...measured.completion, response: responseMetadata };
      const failure = providerFailure(error);
      failure.details ??= describeError(error);
      if (responsePrefix) failure.details.rawResponse = responsePrefix;
      // 响应由异步 transport 回调赋值，类型收窄以回调之后实际取得的值为准。
      const received = responseMetadata as ModelResponse | null;
      if (received) {
        failure.details = { ...failure.details,
          httpStatus: received.status,
          responseHeaders: failure.details.responseHeaders
            ?? describeError({ message: "", responseHeaders: received.headers }).responseHeaders! };
      }
      if (!failure.message) failure.message = received ? `HTTP ${received.status}` : failure.details.name ?? "Error";
      failure.response = responseMetadata;
      if (!measured.completion) failure.timing = timing.end(signal.aborted ? "cancelled" : "failed");
      throw failure;
    } finally {
      capturePrefix = false;
      signal.removeEventListener("abort", cancelled);
      controller.abort();
    }
  }
  private async *decode(measured: ReturnType<typeof measureModel>, messages: ModelMessage[], tools: ToolSet,
    options: ReturnType<typeof requestOptions>, protocol: ModelInput["settings"]["provider"]["protocol"],
    signal: AbortSignal): AsyncIterable<ModelEvent> {
    const result = streamText({ model: measured.model, messages, tools,
      ...options, abortSignal: signal,
      include: { rawChunks: true },
      // SDK 不执行工具；单步结果交还工坊循环，工具注册中不提供 execute。
      onError: () => {},
    });
    // 使用 SDK 自带消费分支持续接收，避免调用方等待进度处理时拖慢采样。
    void result.consumeStream();
    const calls = new Set<string>();
    const thinkingItems = new Map<number, { partId: string; itemId: string; summaryIndex: number | null; hasSummary: boolean }>();
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
    let rawFailure: string | undefined;
    for await (const event of result.stream) {
      signal.throwIfAborted();
      switch (event.type) {
        case "text-start": case "reasoning-start": {
          if (event.type === "reasoning-start" && protocol === "openai-responses") break;
          const kind = event.type === "text-start" ? "text" : "thinking";
          const id = `${kind}:${event.id}`;
          collectContinuation(id, event.providerMetadata);
          yield { type: "part.start", part: { id, kind } };
          break;
        }
        case "raw": {
          if (!event.rawValue || typeof event.rawValue !== "object") break;
          const raw = event.rawValue as Record<string, unknown>;
          if (raw.type === "error" || raw.type === "response.failed" || raw.error != null)
            rawFailure = JSON.stringify(raw);
          if (protocol !== "openai-responses") break;
          // 按 Responses item 收束，全文与摘要分别接收；SDK 的摘要分段不另建思考块。
          if (raw.type === "response.output_item.added" || raw.type === "response.output_item.done") {
            const item = raw.item as Record<string, unknown> | undefined;
            if (item?.type !== "reasoning") break;
            if (typeof item.id !== "string" || !Number.isInteger(raw.output_index) || (raw.output_index as number) < 0)
              throw new ModelFailure("protocol", "The provider returned an invalid reasoning item.");
            const index = raw.output_index as number;
            if (raw.type === "response.output_item.added") {
              if (thinkingItems.has(index)) throw new ModelFailure("protocol", "The provider started a duplicate reasoning item.");
              const partId = `thinking:${item.id}`;
              thinkingItems.set(index, { partId, itemId: item.id, summaryIndex: null, hasSummary: false });
              yield { type: "part.start", part: { id: partId, kind: "thinking" } };
            } else {
              const thinking = thinkingItems.get(index);
              if (!thinking) throw new ModelFailure("protocol", "The provider ended an inactive reasoning item.");
              const continuation = pickContinuation({ openai: {
                itemId: thinking.itemId,
                ...(typeof item.encrypted_content === "string" ? { reasoningEncryptedContent: item.encrypted_content } : {}),
              } });
              yield { type: "part.end", partId: thinking.partId, continuation };
              thinkingItems.delete(index);
            }
            break;
          }
          const summary = raw.type === "response.reasoning_summary_text.delta";
          if (!summary && raw.type !== "response.reasoning_text.delta") break;
          if (typeof raw.item_id !== "string" || typeof raw.delta !== "string" || !Number.isInteger(raw.output_index))
            throw new ModelFailure("protocol", "The provider returned an invalid reasoning delta.");
          const thinking = thinkingItems.get(raw.output_index as number);
          if (!thinking) throw new ModelFailure("protocol", "The provider updated an inactive reasoning item.");
          if (summary) {
            const index = typeof raw.summary_index === "number" ? raw.summary_index : 0;
            if (thinking.hasSummary && thinking.summaryIndex !== index)
              yield { type: "part.delta", partId: thinking.partId, delta: "\n\n", channel: "summary" };
            thinking.summaryIndex = index;
            thinking.hasSummary ||= raw.delta.length > 0;
          }
          yield { type: "part.delta", partId: thinking.partId, delta: raw.delta, ...(summary ? { channel: "summary" as const } : {}) };
          break;
        }
        case "text-delta": case "reasoning-delta": {
          if (event.type === "reasoning-delta" && protocol === "openai-responses") break;
          const partId = `${event.type === "text-delta" ? "text" : "thinking"}:${event.id}`;
          collectContinuation(partId, event.providerMetadata);
          yield { type: "part.delta", partId, delta: event.text };
          break;
        }
        case "text-end": case "reasoning-end": {
          if (event.type === "reasoning-end" && protocol === "openai-responses") break;
          const partId = `${event.type === "text-end" ? "text" : "thinking"}:${event.id}`;
          const metadata = collectContinuation(partId, event.providerMetadata);
          yield { type: "part.end", partId, continuation: metadata };
          continuations.delete(partId);
          break;
        }
        case "tool-input-start":
          if (event.providerExecuted) throw new ModelFailure("server_tool", "Provider-executed tools are not supported.");
          calls.add(event.id);
          yield { type: "part.start", part: { id: `tool:${event.id}`, kind: "toolcall", callId: event.id, name: event.toolName } }; break;
        case "tool-input-delta":
          yield { type: "part.delta", partId: `tool:${event.id}`, delta: event.delta }; break;
        case "tool-call":
          if (event.providerExecuted) throw new ModelFailure("invalid_tool_call", "Provider-executed tools are not supported.");
          if (event.invalid) rejectedBySdk.add(event.toolCallId);
          if (!calls.has(event.toolCallId)) {
            calls.add(event.toolCallId);
            yield { type: "part.start", part: { id: `tool:${event.toolCallId}`, kind: "toolcall", callId: event.toolCallId, name: event.toolName } };
          }
          yield { type: "part.end", partId: `tool:${event.toolCallId}`, arguments: json(event.input), continuation: pickContinuation(event.providerMetadata) }; break;
        case "error":
          // 服务端与传输错误保留原始诊断；程序分类不替换其消息与响应正文。
          {
            const failure = providerFailure(event.error);
            failure.details ??= describeError(event.error);
            if (rawFailure !== undefined) failure.details.rawEvent = rawFailure;
            throw failure;
          }
        case "abort": throw new ModelFailure("cancelled", "The provider stream was cancelled.");
        case "tool-error":
          // SDK 会为解析/目录错误合成结果；正式拒绝由工坊记录，避免保存 SDK 错误对象。
          if (!event.providerExecuted && rejectedBySdk.has(event.toolCallId)) break;
          throw new ModelFailure("unsupported_content", "The provider returned an unexpected tool result.");
        // custom 是 provider 扩展元数据（如 Anthropic message_start 的早期用量），非正文内容；
        // 用量由接收端计量采集，续接由 pickContinuation 白名单收束，无需处理。
        case "custom": break;
        case "file": case "reasoning-file": case "tool-result":
          throw new ModelFailure("unsupported_content", "The provider returned unsupported response content.");
        case "finish": break;
      }
    }
    // 已收到的终态必须交付；ResponseBuffer 先保留计量，再拒绝仍未闭合的块。
    if (!measured.completion) throw new ModelFailure("interrupted", "The provider stream ended without a finish event.", undefined, "model");
    yield measured.completion;
  }
}
