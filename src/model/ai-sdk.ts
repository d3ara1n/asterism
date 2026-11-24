import { jsonSchema as sdkJsonSchema, streamText, tool,
  type ModelMessage, type ToolResultPart, type ToolSet, type LanguageModel } from "ai";
import { z } from "zod";
import { jsonSchema, unauthenticatedApiKey, type Json, type ModelSettings } from "../shared/model.ts";
import { ModelFailure, type ModelAdapter, type ModelEvent, type ModelInput, type ResolvedInputPart, type PreparedModel, type ModelValidationInput } from "./contract.ts";
import { createProviderModel, validateProviderTransport } from "./provider.ts";
import { projectSystemPrompt } from "./system-prompt.ts";
import { requestOptions } from "./request-options.ts";
import { projectHistory } from "./projection.ts";
import { modelProtocol, type ModelProtocol } from "./protocols/index.ts";
import { validateRequestIdentity } from "./request-identity.ts";
import { measureModel, RequestTimer } from "./request-timing.ts";
import { describeError, type ModelResponse, type ToolCallInput } from "@asterism-app/sdk/contracts";
import { providerFailure } from "./provider-failure.ts";

function json(value: unknown): Json { return jsonSchema.parse(JSON.parse(JSON.stringify(value))); }
export function sdkMessages(input: ModelInput): ModelMessage[] {
  const messages: ModelMessage[] = [];
  const protocol = modelProtocol(input.settings.provider.protocol);
  const filesInUserMessage = protocol.toolResultFiles(input.settings) === "user-message";
  const attachments: Extract<ResolvedInputPart, { kind: "file" }>[] = [];
  /** Files from the same batch merge into the subsequent user message when the protocol selects that representation. */
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
        if (p.kind !== "toolcall") return { type: p.kind === "text" ? "text" as const : "reasoning" as const, text: p.text, providerOptions };
        const input = p.input.kind === "structured" ? p.input.value
          : protocol.declareFreeformTool ? p.input.text : { input: p.input.text };
        return { type: "tool-call" as const, toolCallId: p.callId, toolName: p.name, input, providerOptions };
      }) });
    }
    if (item.kind === "result") {
      const files = item.parts.filter(part => part.kind === "file");
      const text = item.parts.flatMap(part => part.kind === "text" ? [part.text] : []).join("\n");
      // Serialize text once; the user-message representation keeps a reference in the tool result.
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
const freeformEnvelope = z.strictObject({ input: z.string() });

type WireInput = "structured" | "native-text" | "text-envelope";

function toolCallInput(wire: WireInput, value: unknown): ToolCallInput {
  switch (wire) {
    case "structured": return { kind: "structured", value: json(value) };
    case "native-text":
      if (typeof value === "string") return { kind: "freeform", text: value };
      break;
    case "text-envelope": {
      const envelope = freeformEnvelope.safeParse(value);
      if (envelope.success) return { kind: "freeform", text: envelope.data.input };
      break;
    }
  }
  throw new ModelFailure("invalid_tool_input", "The provider returned invalid freeform tool input.", undefined, "model");
}

type RequestTools = { tools: ToolSet; textEnvelopes: ReadonlySet<string> };

function requestTools(input: ModelInput, protocol: ModelProtocol): RequestTools {
  const textEnvelopes = new Set<string>();
  const tools: ToolSet = Object.fromEntries(input.tools.map(declaration => {
    if (declaration.kind === "structured") return [declaration.name, tool({
      description: declaration.description, inputSchema: sdkJsonSchema(declaration.parameters as Record<string, unknown>),
    })];
    if (protocol.declareFreeformTool) return [declaration.name, protocol.declareFreeformTool(declaration)];
    textEnvelopes.add(declaration.name);
    return [declaration.name, tool({ description: declaration.description, inputSchema: freeformEnvelope })];
  }));
  return { tools, textEnvelopes };
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
    const protocol = modelProtocol(input.settings.provider.protocol);
    const tools = requestTools(input, protocol);
    return { stream: signal => this.stream(input, messages, tools, options, protocol, signal) };
  }
  private async *stream(input: ModelInput, messages: ModelMessage[], tools: RequestTools,
    options: ReturnType<typeof requestOptions>, protocol: ModelProtocol, signal: AbortSignal): AsyncIterable<ModelEvent> {
    const { provider, model } = input.settings;
    const key = provider.auth === "none" ? unauthenticatedApiKey : await this.readCredential(provider.id);
    if (!key) throw new ModelFailure("missing_credential", "Provider credentials are unavailable.");
    const controller = new AbortController();
    const streamSignal = AbortSignal.any([signal, controller.signal]);
    let responseMetadata: ModelResponse | null = null;
    let readFailure: { error: unknown } | undefined;
    // The SDK may consume the first SSE error before doStream returns; retain the received prefix and release it on first-block delivery.
    let capturePrefix = true, responsePrefix = "";
    const decoder = new TextDecoder();
    const transport: typeof fetch = async (url, init) => {
      let response: Response;
      try {
        response = await this.transport(url, init);
      } catch (error) { throw providerFailure(error, { upstream: true }); }
      responseMetadata = {
        connection: { id: provider.id }, endpoint: provider.baseUrl, model: model.modelId,
        status: response.status, receivedAt: Date.now(), headers: Object.fromEntries(response.headers),
      };
      if (response.body && response.headers.get("content-type")?.includes("text/event-stream")) {
        const reader = response.body.getReader();
        return new Response(new ReadableStream<Uint8Array>({
          async pull(output) {
            const { done, value } = await reader.read().catch((error: unknown) => {
              // Preserve the original cause so the classifier can recognize it through any SDK wrapper.
              readFailure = { error };
              throw error;
            });
            if (done) {
              if (capturePrefix) responsePrefix += decoder.decode();
              output.close();
            } else {
              if (capturePrefix) responsePrefix += decoder.decode(value, { stream: true });
              output.enqueue(value);
            }
          },
          cancel: reason => reader.cancel(reason),
        }), { status: response.status, statusText: response.statusText, headers: response.headers });
      }
      return response;
    };
    const languageModel = this.languageModelFactory?.(input, key) ?? createProviderModel(provider, model, key, transport, input);
    signal.throwIfAborted();
    const timing = new RequestTimer();
    const measured = measureModel(languageModel, protocol, timing);
    let outputStarted = false;
    const classifyFailure = (error: unknown, upstream = false) => providerFailure(error, {
      upstream, httpStatus: responseMetadata?.status, readFailure,
      allowReadRetry: !streamSignal.aborted && !outputStarted && !timing.hasOutput && !measured.completion,
    });
    const cancelled = () => { timing.end("cancelled"); };
    signal.addEventListener("abort", cancelled, { once: true });
    try {
      for await (const event of this.decode(measured, messages, tools, options, protocol, streamSignal, classifyFailure)) {
        if (event.type !== "finish") outputStarted = true;
        capturePrefix = false; responsePrefix = "";
        yield event.type === "finish" ? { ...event, response: responseMetadata } : event;
      }
    } catch (error) {
      // Model termination may precede connection close or user cancellation; acquired metering must still be delivered.
      if (measured.completion) yield { ...measured.completion, response: responseMetadata };
      // An asynchronous transport callback assigns the response; narrow to the actual value obtained after the callback.
      const received = responseMetadata as ModelResponse | null;
      const failure = classifyFailure(error);
      failure.details ??= describeError(error);
      if (responsePrefix) failure.details.rawResponse = responsePrefix;
      if (received) {
        failure.details = { ...failure.details,
          httpStatus: received.status,
          responseHeaders: failure.details.responseHeaders
            ?? describeError({ message: "", responseHeaders: received.headers }).responseHeaders! };
      }
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
  private async *decode(measured: ReturnType<typeof measureModel>, messages: ModelMessage[], { tools, textEnvelopes }: RequestTools,
    options: ReturnType<typeof requestOptions>, protocol: ModelProtocol,
    signal: AbortSignal, classifyFailure: (error: unknown, upstream: boolean) => ModelFailure): AsyncIterable<ModelEvent> {
    const result = streamText({ model: measured.model, messages, tools,
      ...options, abortSignal: signal,
      include: { rawChunks: true },
      // The SDK does not execute tools; return single-step results to the Asterism loop without execute in tool registrations.
      onError: () => {},
    });
    // Use the SDK's consuming branch to receive continuously so waiting for caller progress handling does not slow sampling.
    void result.consumeStream();
    const calls = new Map<string, WireInput>();
    const startCall = (callId: string, name: string, wire: WireInput): ModelEvent => {
      calls.set(callId, wire);
      return { type: "part.start", part: { id: `tool:${callId}`, kind: "toolcall", callId, name, inputKind: wire === "structured" ? "structured" : "freeform" } };
    };
    const functionInput = (name: string): WireInput => textEnvelopes.has(name) ? "text-envelope" : "structured";
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
        case "tool-input-start": {
          if (event.providerExecuted) throw new ModelFailure("server_tool", "Provider-executed tools are not supported.");
          const wire = event.inputEncoding === "text" ? "native-text" : functionInput(event.toolName);
          yield startCall(event.id, event.toolName, wire);
          break;
        }
        case "tool-input-delta":
          // The SDK forwards native text deltas unchanged. A JSON envelope is not a public freeform draft.
          if (calls.get(event.id) !== "text-envelope") yield { type: "part.delta", partId: `tool:${event.id}`, delta: event.delta };
          break;
        case "tool-call": {
          if (event.providerExecuted) throw new ModelFailure("invalid_tool_call", "Provider-executed tools are not supported.");
          if (event.invalid) rejectedBySdk.add(event.toolCallId);
          const wire = calls.get(event.toolCallId) ?? functionInput(event.toolName);
          if (!calls.has(event.toolCallId)) yield startCall(event.toolCallId, event.toolName, wire);
          const input = toolCallInput(wire, event.input);
          const partId = `tool:${event.toolCallId}`;
          if (wire === "text-envelope" && input.kind === "freeform" && input.text) yield { type: "part.delta", partId, delta: input.text };
          yield { type: "part.end", partId, input, continuation: protocol.capture(event.providerMetadata) };
          break;
        }
        case "error":
          // Server and transport errors retain raw diagnostics separately from the failure summary.
          {
            const failure = classifyFailure(event.error, rawFailure !== undefined);
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
    if (!measured.completion) throw new ModelFailure("interrupted", "The provider stream ended without a finish event.", undefined, "model");
    yield measured.completion;
  }
}
