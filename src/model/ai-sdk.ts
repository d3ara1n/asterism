import { jsonSchema as sdkJsonSchema, streamText, tool, APICallError, StreamProviderError, JSONParseError, TypeValidationError, InvalidResponseDataError,
  type ModelMessage, type ToolResultPart, type ToolSet, type LanguageModel } from "ai";
import { jsonSchema, unauthenticatedApiKey, type Json, type ModelSettings } from "../shared/model.ts";
import { ModelFailure, type ModelAdapter, type ModelEvent, type ModelInput, type ResolvedInputPart, type PreparedModel, type ModelValidationInput } from "./contract.ts";
import { createProviderModel, validateProviderTransport } from "./provider.ts";
import { projectSystemPrompt } from "./system-prompt.ts";
import { requestOptions } from "./request-options.ts";
import { projectHistory, validateProjection } from "./projection.ts";
import { modelProtocol, type ModelProtocol } from "./protocols/index.ts";
import { validateRequestIdentity } from "./request-identity.ts";
import { measureModel, RequestTimer } from "./request-timing.ts";
import { describeError, type ModelResponse } from "@asterism-app/sdk/contracts";
import { ZodError } from "zod";

function json(value: unknown): Json { return jsonSchema.parse(JSON.parse(JSON.stringify(value))); }
function responseParsingFailure(error: unknown): boolean {
  return error instanceof SyntaxError || error instanceof ZodError
    || JSONParseError.isInstance(error) || TypeValidationError.isInstance(error) || InvalidResponseDataError.isInstance(error);
}
/** Transport and provider decoding boundaries identify upstream failures independently of status-code retry hints. */
function providerFailure(error: unknown, upstream = false): ModelFailure {
  if (error instanceof ModelFailure) return error;
  const details = describeError(error);
  const parsing = responseParsingFailure(error);
  const remote = upstream || APICallError.isInstance(error) || StreamProviderError.isInstance(error);
  return new ModelFailure(parsing ? "response_parsing" : remote ? "provider_error" : "processing_error",
    details.message, details, remote ? "model" : "software", remote);
}
export function sdkMessages(input: ModelInput): ModelMessage[] {
  const messages: ModelMessage[] = [];
  const protocol = modelProtocol(input.settings.provider.protocol);
  const filesInUserMessage = protocol.toolResultFiles(input.settings) === "user-message";
  const attachments: Extract<ResolvedInputPart, { kind: "file" }>[] = [];
  /** Protocol validation has admitted these files; files from the same batch merge into the subsequent user message. */
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
        // Projection has restored continuation through the target protocol's allowlist.
        const providerOptions = protocol.replay(p, p.continuation as Record<string, Json>);
        return p.kind === "toolcall" ? { type: "tool-call" as const, toolCallId: p.callId, toolName: p.name, input: p.arguments, providerOptions }
          : { type: p.kind === "text" ? "text" as const : "reasoning" as const, text: p.text, providerOptions };
      }) });
    }
    if (item.kind === "result") {
      const files = item.parts.filter(part => part.kind === "file");
      const text = item.parts.flatMap(part => part.kind === "text" ? [part.text] : []).join("\n");
      // Serialize text once; protocols that cannot carry files in results receive them in the subsequent user message.
      let output: ToolResultPart["output"];
      if (!files.length || filesInUserMessage) {
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
  constructor(private readonly readCredential: (providerId: string) => Promise<string | null>,
    private readonly languageModelFactory?: (input: ModelInput, key: string) => Exclude<LanguageModel, string>,
    private readonly transport: typeof fetch = fetch) {}
  format(settings: ModelSettings): string {
    return modelProtocol(settings.provider.protocol).continuationFormat;
  }
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
      let response: Response;
      try { response = await this.transport(url, init); }
      catch (error) { throw providerFailure(error, true); }
      responseMetadata = {
        connection: { id: provider.id }, endpoint: provider.baseUrl, model: model.modelId,
        status: response.status, receivedAt: Date.now(), headers: Object.fromEntries(response.headers),
      };
      if (response.body && response.headers.get("content-type")?.includes("text/event-stream")) {
        const reader = response.body.getReader();
        return new Response(new ReadableStream<Uint8Array>({
          async pull(output) {
            try {
              const { done, value } = await reader.read();
              if (done) {
                if (capturePrefix) responsePrefix += decoder.decode();
                output.close();
              } else {
                if (capturePrefix) responsePrefix += decoder.decode(value, { stream: true });
                output.enqueue(value);
              }
            } catch (error) { output.error(providerFailure(error, true)); }
          },
          cancel: reason => reader.cancel(reason),
        }), { status: response.status, statusText: response.statusText, headers: response.headers });
      }
      return response;
    };
    const languageModel = this.languageModelFactory?.(input, key) ?? createProviderModel(provider, model, key, transport, input);
    const tools: ToolSet = Object.fromEntries(input.tools.map(t => [t.name, tool({ description: t.description, inputSchema: sdkJsonSchema(t.parameters as Record<string, unknown>) })]));
    signal.throwIfAborted();
    const timing = new RequestTimer();
    const protocol = modelProtocol(provider.protocol);
    const measured = measureModel(languageModel, protocol, timing);
    const cancelled = () => { timing.end("cancelled"); };
    signal.addEventListener("abort", cancelled, { once: true });
    try {
      for await (const event of this.decode(measured, messages, tools, options, protocol, streamSignal, () => responseMetadata !== null)) {
        capturePrefix = false; responsePrefix = "";
        yield event.type === "finish" ? { ...event, response: responseMetadata } : event;
      }
    } catch (error) {
      // Model termination may precede connection close or user cancellation; acquired metering must still be delivered.
      if (measured.completion) yield { ...measured.completion, response: responseMetadata };
      const failure = providerFailure(error, responseMetadata !== null && responseParsingFailure(error));
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
      failure.usage = measured.usage;
      failure.providerResponseId = measured.responseId;
      if (!measured.completion) failure.timing = timing.end(signal.aborted ? "cancelled" : "failed");
      throw failure;
    } finally {
      capturePrefix = false;
      signal.removeEventListener("abort", cancelled);
      controller.abort();
    }
  }
  private async *decode(measured: ReturnType<typeof measureModel>, messages: ModelMessage[], tools: ToolSet,
    options: ReturnType<typeof requestOptions>, protocol: ModelProtocol,
    signal: AbortSignal, receivedResponse: () => boolean): AsyncIterable<ModelEvent> {
    const result = streamText({ model: measured.model, messages, tools,
      ...options, abortSignal: signal,
      include: { rawChunks: true },
      // The SDK does not execute tools; return single-step results to the Asterism loop without execute in tool registrations.
      onError: () => {},
    });
    // Use the SDK's consuming branch to receive continuously so waiting for caller progress handling does not slow sampling.
    void result.consumeStream();
    const calls = new Set<string>();
    const decodeRaw = protocol.decoder?.();
    const continuations = new Map<string, Record<string, Json>>();
    const collectContinuation = (id: string, metadata: unknown) => {
      const accumulated = { ...continuations.get(id), ...protocol.capture(metadata) };
      continuations.set(id, accumulated);
      return accumulated;
    };
    const rejectedBySdk = new Set<string>();
    let rawFailure: string | undefined;
    for await (const event of result.stream) {
      signal.throwIfAborted();
      switch (event.type) {
        case "text-start": case "reasoning-start": {
          if (event.type === "reasoning-start" && !protocol.sdkReasoning) break;
          const kind = event.type === "text-start" ? "text" : "thinking";
          const id = `${kind}:${event.id}`;
          collectContinuation(id, event.providerMetadata);
          yield { type: "part.start", part: { id, kind } };
          break;
        }
        case "raw": {
          if (!event.rawValue || typeof event.rawValue !== "object") break;
          const raw = event.rawValue as Record<string, unknown>;
          if (raw.type === "error" || raw.error != null || protocol.failureEvent?.(raw))
            rawFailure = JSON.stringify(raw);
          if (decodeRaw) yield* decodeRaw(raw);
          break;
        }
        case "text-delta": case "reasoning-delta": {
          if (event.type === "reasoning-delta" && !protocol.sdkReasoning) break;
          const partId = `${event.type === "text-delta" ? "text" : "thinking"}:${event.id}`;
          collectContinuation(partId, event.providerMetadata);
          yield { type: "part.delta", partId, delta: event.text };
          break;
        }
        case "text-end": case "reasoning-end": {
          if (event.type === "reasoning-end" && !protocol.sdkReasoning) break;
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
          yield { type: "part.end", partId: `tool:${event.toolCallId}`, arguments: json(event.input), continuation: protocol.capture(event.providerMetadata) }; break;
        case "error":
          // Server and transport errors retain original diagnostics; programmatic classification does not replace their messages or response bodies.
          {
            const failure = providerFailure(event.error, rawFailure !== undefined || (receivedResponse() && responseParsingFailure(event.error)));
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
        // the protocol meter collects usage and protocol capture filters continuation data through an allowlist, so no handling is needed here.
        case "custom": break;
        case "file": case "reasoning-file": case "tool-result":
          throw new ModelFailure("unsupported_content", "The provider returned unsupported response content.");
        case "finish": break;
      }
    }
    // Received terminal state must be delivered; ResponseBuffer retains metering before rejecting blocks that remain unclosed.
    if (!measured.completion) throw new ModelFailure("interrupted", "The provider stream ended without a finish event.", undefined, "model", true);
    yield measured.completion;
  }
}
