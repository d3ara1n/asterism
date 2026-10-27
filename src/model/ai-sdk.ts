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
import { describeError, type ModelResponse } from "@asterism-app/sdk/contracts";
import { ZodError } from "zod";

function json(value: unknown): Json { return jsonSchema.parse(JSON.parse(JSON.stringify(value))); }
/** SDK decoding failures are software processing errors; server rejection and transport failure are model request outcomes. */
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
  /** Target projection has checked explicit tool-file tags; permitted files from the same batch merge into subsequent user messages. */
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
        // All modalities use AI SDK file parts with mediaType as the encoding tag; server feedback determines endpoint acceptance.
        : { type: "file" as const, data: part.data, mediaType: part.mediaType, ...(part.filename ? { filename: part.filename } : {}) }) });
    if (item.kind === "output") {
      const parts = item.parts;
      if (parts.length) messages.push({ role: "assistant", content: parts.map(p => {
        const providerOptions = {
          ...p.continuation as Record<string, Record<string, Json>>,
          ...(p.kind === "thinking" ? { asterism: { summary: p.summary } } : {}),
        };
        return p.kind === "toolcall" ? { type: "tool-call" as const, toolCallId: p.callId, toolName: p.name, input: p.arguments, providerOptions }
          : { type: p.kind === "text" ? "text" as const : "reasoning" as const, text: p.text, providerOptions };
      }) });
    }
    if (item.kind === "result") {
      const files = item.parts.filter(part => part.kind === "file");
      const text = item.parts.flatMap(part => part.kind === "text" ? [part.text] : []).join("\n");
      // Serialize text once; Chat tool files must pass the explicit compatibility gate before moving to subsequent user messages.
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
    // Capture top-level request identity so waiting for credentials cannot observe values later replaced by the caller.
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
    // The SDK may consume the first SSE error before doStream returns; retain the received prefix and release it on first-block delivery.
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
      // Model termination may precede connection close or user cancellation; acquired metering must still be delivered.
      if (measured.completion) yield { ...measured.completion, response: responseMetadata };
      const failure = providerFailure(error);
      failure.details ??= describeError(error);
      if (responsePrefix) failure.details.rawResponse = responsePrefix;
      // An asynchronous transport callback assigns the response; narrow to the actual value obtained after the callback.
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
      // The SDK does not execute tools; return single-step results to the Asterism loop without execute in tool registrations.
      onError: () => {},
    });
    // Use the SDK's consuming branch to receive continuously so waiting for caller progress handling does not slow sampling.
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
          // Finalize by Responses item and receive full text and summaries separately; SDK summary segments do not create separate reasoning blocks.
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
          // Server and transport errors retain original diagnostics; programmatic classification does not replace their messages or response bodies.
          {
            const failure = providerFailure(event.error);
            failure.details ??= describeError(event.error);
            if (rawFailure !== undefined) failure.details.rawEvent = rawFailure;
            throw failure;
          }
        case "abort": throw new ModelFailure("cancelled", "The provider stream was cancelled.");
        case "tool-error":
          // The SDK synthesizes results for parsing/catalog errors; Asterism records formal rejections without saving SDK error objects.
          if (!event.providerExecuted && rejectedBySdk.has(event.toolCallId)) break;
          throw new ModelFailure("unsupported_content", "The provider returned an unexpected tool result.");
        // custom is provider extension metadata, such as early Anthropic message_start usage, rather than body content;
        // the receiver collects usage and pickContinuation filters continuation data through an allowlist, so no handling is needed here.
        case "custom": break;
        case "file": case "reasoning-file": case "tool-result":
          throw new ModelFailure("unsupported_content", "The provider returned unsupported response content.");
        case "finish": break;
      }
    }
    // Received terminal state must be delivered; ResponseBuffer retains metering before rejecting blocks that remain unclosed.
    if (!measured.completion) throw new ModelFailure("interrupted", "The provider stream ended without a finish event.", undefined, "model");
    yield measured.completion;
  }
}
