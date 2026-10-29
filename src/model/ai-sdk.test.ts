import { thinkingLevels } from "@asterism-app/sdk/contracts";
import { describe, expect, it, vi } from "vitest";
import { MockLanguageModelV4, simulateReadableStream } from "ai/test";
import { AiSdkAdapter, sdkMessages } from "./ai-sdk.ts";
import { modelScope } from "../shared/model.ts";
import { ModelFailure, type ModelInput, type ModelEvent } from "./contract.ts";
import { createProviderModel } from "./provider.ts";
import { projectSystemPrompt } from "./system-prompt.ts";

const input: ModelInput = {
  settings: { provider: { id: "p", name: "Provider", enabled: true, baseUrl: "https://example.invalid", protocol: "anthropic", auth: "api_key", compatibility: [] },
    model: { name: "Model", modelId: "test", providerId: "p", enabled: true, contextWindow: null, cost: null, compatibility: [],
      capabilities: { reasoning: true, tools: true, thinkingLevels: [...thinkingLevels] }, generation: { temperature: 0.2, topP: null, maxOutputTokens: 1000 } }, thinking: "low" },
  system: { blocks: [{ id: "test", text: "System" }] }, messages: [{ kind: "input", parts: [{ kind: "text", text: "Read" }] }],
  tools: [{ name: "read", description: "Read", parameters: { type: "object", properties: { resource_id: { type: "string" } }, required: ["resource_id"] } }],
};
async function consume(events: AsyncIterable<ModelEvent>) { for await (const _event of events) { /* Consume through terminal state or error. */ } }
const transportInput: ModelInput = { ...input, settings: { ...input.settings, thinking: "off" } };

describe("AI SDK adaptation contract", () => {
  // Upstream status and original text support diagnosis; HTTP 429 and 500 must not collapse into the same configuration/network guess.
  it.each([429, 500])("HTTP %s preserves original error bodies and response identities without request credentials", async status => {
    const body = '{"type":"error","error":{"type":"upstream_error","message":"Original provider message","request_id":"req-1","extra":{"limit":12}}}';
    const response = new Response(body, {
      status, headers: { "content-type": "application/json", "X-Request-Id": "req-1" },
    });
    const transport = vi.fn<typeof fetch>(async () => response);
    const adapter = new AiSdkAdapter(async () => "synthetic-key", undefined, transport);
    const failure = await consume(adapter.prepare(transportInput).stream(new AbortController().signal)).catch(error => error);
    expect(failure).toBeInstanceOf(ModelFailure);
    expect(failure.response).toMatchObject({ connection: { id: "p" }, endpoint: input.settings.provider.baseUrl,
      model: "test", status, headers: { "x-request-id": "req-1" } });
    expect(failure).toMatchObject({ origin: "model", message: "Original provider message", details: {
      message: "Original provider message", statusCode: status, httpStatus: status, responseBody: body,
      responseHeaders: { "x-request-id": "req-1" },
    } });
    expect(JSON.stringify(failure.details)).not.toContain("synthetic-key");
    expect(failure.details).not.toHaveProperty("requestBodyValues");
    expect(failure.response.headers).not.toHaveProperty("x-api-key");
    expect(transport).toHaveBeenCalledTimes(1);
  });
  // Proxy gateways may return HTML directly; preserve the complete body even when it is not JSON.
  it("preserves response bodies for non-JSON HTTP errors", async () => {
    const body = "<html><body>upstream unavailable</body></html>";
    const adapter = new AiSdkAdapter(async () => "synthetic-key", undefined, async () => new Response(body, { status: 502 }));
    await expect(consume(adapter.prepare(transportInput).stream(new AbortController().signal)))
      .rejects.toMatchObject({ details: { statusCode: 502, httpStatus: 502, responseBody: body } });
  });
  // Server rejection is a model outcome; SDK failure to parse response JSON or structure is a software processing failure.
  it.each(["not JSON", '{"choices":"invalid"}'])("response parsing failures explicitly identify software origin: %s", async chunk => {
    const current = structuredClone(transportInput);
    current.settings.provider.protocol = "openai-chat";
    const adapter = new AiSdkAdapter(async () => "synthetic-key", undefined, async () => new Response(
      `data: ${chunk}\n\n`, { headers: { "content-type": "text/event-stream" } }));
    await expect(consume(adapter.prepare(current).stream(new AbortController().signal)))
      .rejects.toMatchObject({ origin: "software", code: "response_parsing", details: { httpStatus: 200 } });
  });
  // The Anthropic SDK consumes the first error in doStream and trims fields; the transport prefix retains data actually received.
  it("preserves the original response when the first SSE event fails and distinguishes actual HTTP from SDK-inferred status", async () => {
    const raw = 'event: error\ndata: {"type":"error","error":{"type":"overloaded_error","message":"Server busy","extra":{"retry_after":5}}}\n\n';
    const adapter = new AiSdkAdapter(async () => "synthetic-key", undefined, async () =>
      new Response(raw, { headers: { "content-type": "text/event-stream" } }));
    await expect(consume(adapter.prepare(transportInput).stream(new AbortController().signal)))
      .rejects.toMatchObject({ details: { message: "Server busy", statusCode: 529, httpStatus: 200, rawResponse: raw } });
  });
  // SSE may report errors after HTTP 200; SDK decoding trims unknown fields, so raw error remains authoritative.
  it("stream errors preserve HTTP status and complete server events", async () => {
    const raw = { type: "error", error: { type: "overloaded_error", message: "Server busy", extra: { retry_after: 5 } } };
    const start = { type: "message_start", message: { id: "m1", type: "message", role: "assistant", model: "test",
      content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 2, output_tokens: 0 } } };
    const adapter = new AiSdkAdapter(async () => "synthetic-key", undefined, async () => new Response(
      `event: message_start\ndata: ${JSON.stringify(start)}\n\nevent: error\ndata: ${JSON.stringify(raw)}\n\n`,
      { headers: { "content-type": "text/event-stream", "x-request-id": "stream-1" } }));
    await expect(consume(adapter.prepare(transportInput).stream(new AbortController().signal)))
      .rejects.toMatchObject({ details: { statusCode: 529, httpStatus: 200, rawEvent: JSON.stringify(raw), responseHeaders: { "x-request-id": "stream-1" } } });
  });

  // SDK streams must deliver the caller's limit to the provider without expanding the configured output limit.
  it.each([{ requested: 400, expected: 400 }, { requested: 2000, expected: 1000 }])(
    "uses the smaller of the single-completion limit $requested and model configuration", async ({ requested, expected }) => {
      const model = new MockLanguageModelV4({ doStream: async () => ({ stream: simulateReadableStream({
        initialDelayInMs: null, chunkDelayInMs: null, chunks: [
          { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage: {
            inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
            outputTokens: { total: 1, text: 1, reasoning: undefined },
          } },
        ],
      }) }) });
      const adapter = new AiSdkAdapter(async () => "synthetic-key", () => model);
      for await (const _event of adapter.prepare({ ...input, maxOutputTokens: requested }).stream(new AbortController().signal)) { /* Consume terminal state. */ }
      expect(model.doStreamCalls[0]!.maxOutputTokens).toBe(expected);
      expect(() => adapter.prepare({ ...input, maxOutputTokens: 0 })).toThrow("positive safe integer");
    });
  it.each([
    { modelId: "o3", thinking: "low", reasoning: true },
    { modelId: "deepseek-flash", thinking: "off", reasoning: true },
    { modelId: "o3", thinking: "high", reasoning: false },
    { modelId: "deepseek-flash", thinking: null, reasoning: false },
  ] as const)("Responses $modelId reasoning=$reasoning level=$thinking: the toggle controls requests and all returned reasoning is received normally", async ({ modelId, thinking, reasoning }) => {
    const current = structuredClone(input);
    current.settings.provider.protocol = "openai-responses";
    current.settings.model.modelId = modelId;
    current.settings.model.generation.temperature = null;
    current.settings.thinking = thinking;
    current.settings.model.capabilities.reasoning = reasoning;
    if (!reasoning) current.settings.model.capabilities.thinkingLevels = [];
    const response = { id: "response-thinking", model: modelId, created_at: 0 };
    const frames = [
      { type: "response.created", response: { ...response, status: "in_progress" } },
      { type: "response.output_item.added", output_index: 0, item: { id: "reasoning-1", type: "reasoning", summary: [] } },
      { type: "response.reasoning_summary_part.added", item_id: "reasoning-1", output_index: 0, summary_index: 0,
        part: { type: "summary_text", text: "" } },
      { type: "response.reasoning_summary_text.delta", item_id: "reasoning-1", output_index: 0, summary_index: 0, delta: "Visible summary" },
      { type: "response.reasoning_summary_part.done", item_id: "reasoning-1", output_index: 0, summary_index: 0,
        part: { type: "summary_text", text: "Visible summary" } },
      { type: "response.output_item.done", output_index: 0, item: { id: "reasoning-1", type: "reasoning",
        summary: [{ type: "summary_text", text: "Visible summary" }], encrypted_content: "encrypted-continuation" } },
      { type: "response.completed", response: { ...response, status: "completed", usage: { input_tokens: 3, output_tokens: 2, total_tokens: 5 } } },
    ];
    let request: Record<string, unknown> | undefined;
    const transport: typeof fetch = async (_url, init) => {
      request = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(frames.map(frame => `data: ${JSON.stringify(frame)}\n\n`).join(""),
        { headers: { "content-type": "text/event-stream" } });
    };
    const adapter = new AiSdkAdapter(async () => "synthetic-key",
      (value, key) => createProviderModel(value.settings.provider, value.settings.model, key, transport));
    const events: ModelEvent[] = [];
    for await (const event of adapter.prepare(current).stream(new AbortController().signal)) events.push(event);
    // off encodes only a level; false omits reasoning options. Both still accept reasoning actually returned by the server.
    if (reasoning) {
      expect(request?.reasoning).toMatchObject({ summary: "auto", effort: thinking === "off" ? "none" : thinking });
      expect(request).toMatchObject({ store: false, include: ["reasoning.encrypted_content"] });
    } else {
      expect(request).not.toHaveProperty("reasoning");
      expect(request).not.toHaveProperty("include");
    }
    expect(events.find(event => event.type === "part.delta")).toMatchObject({ partId: "thinking:reasoning-1", delta: "Visible summary", channel: "summary" });
    expect(events.find(event => event.type === "part.end")).toMatchObject({
      continuation: { openai: { itemId: "reasoning-1", reasoningEncryptedContent: "encrypted-continuation" } },
    });
  });

  // Request projection contract: toggles do not alter history; off does not delete reasoning; filtering must not send empty assistants or lose tool calls.
  it("only the current request reasoning toggle controls historical reasoning and reenabling sends it back completely", () => {
    const current = structuredClone(input);
    const adapter = new AiSdkAdapter(async () => "unused");
    current.settings.thinking = "off";
    current.messages = [
      { kind: "output", adapter: adapter.version, scope: modelScope(current.settings),
        parts: [{ kind: "thinking", summary: "", text: "Only thought", continuation: { anthropic: { signature: "only-signature" } } }] },
      { kind: "output", adapter: adapter.version, scope: modelScope(current.settings), parts: [
        { kind: "thinking", summary: "", text: "Saved thought", continuation: { anthropic: { signature: "saved-signature" } } },
        { kind: "text", text: "Saved answer", continuation: null },
        { kind: "toolcall", callId: "call", name: "read", arguments: {}, continuation: null },
      ] },
      { kind: "result", callId: "call", name: "read", error: false, parts: [{ kind: "text", text: "Tool answer" }] },
    ];
    const original = structuredClone(current.messages);
    const enabled = sdkMessages(current);
    expect(JSON.stringify(enabled)).toContain("saved-signature");
    current.settings.model.capabilities.reasoning = false;
    const disabled = sdkMessages(current);
    expect(disabled.map(message => message.role)).toEqual(["assistant", "tool"]);
    expect(disabled[0]).toMatchObject({ content: [{ type: "text", text: "Saved answer" }, { type: "tool-call", toolCallId: "call" }] });
    expect(JSON.stringify(disabled)).not.toMatch(/thought|signature/);
    expect(current.messages).toEqual(original);
    current.settings.model.capabilities.reasoning = true;
    expect(sdkMessages(current)).toEqual(enabled);
  });

  // Plaintext reasoning is a protocol baseline; unknown domains and empty compatibility lists still preserve and resend it unchanged.
  it("decodes native Responses reasoning normally and continues with plaintext without compatibility packages", async () => {
    const current = structuredClone(input);
    current.settings.provider.protocol = "openai-responses";
    current.settings.provider.baseUrl = "https://example.invalid/v1";
    current.settings.model.modelId = "deepseek-flash";
    current.settings.thinking = "medium";
    current.settings.model.generation.temperature = null;
    const response = { id: "response-plain", model: "deepseek-flash", created_at: 0 };
    // DeepSeek's official Responses example uses reasoning_text; an empty summary produces no summary events.
    const frames = [
      { type: "response.created", response: { ...response, status: "in_progress" } },
      { type: "response.output_item.added", output_index: 0, item: { id: "rs_1", type: "reasoning", summary: [] } },
      { type: "response.content_part.added", item_id: "rs_1", output_index: 0, content_index: 0, part: { type: "reasoning_text", text: "" } },
      { type: "response.reasoning_text.delta", item_id: "rs_1", output_index: 0, content_index: 0, delta: "Assess " },
      { type: "response.reasoning_text.delta", item_id: "rs_1", output_index: 0, content_index: 0, delta: "the plan." },
      { type: "response.reasoning_text.done", item_id: "rs_1", output_index: 0, content_index: 0, text: "Assess the plan." },
      { type: "response.output_item.done", output_index: 0, item: { id: "rs_1", type: "reasoning", summary: [],
        content: [{ type: "reasoning_text", text: "Assess the plan." }] } },
      { type: "response.completed", response: { ...response, status: "completed", usage: { input_tokens: 3, output_tokens: 2, total_tokens: 5 } } },
    ];
    const requests: Record<string, unknown>[] = [];
    const transport: typeof fetch = async (_url, init) => {
      requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return new Response(frames.map(frame => `data: ${JSON.stringify(frame)}\n\n`).join(""),
        { headers: { "content-type": "text/event-stream" } });
    };
    const adapter = new AiSdkAdapter(async () => "synthetic-key",
      (value, key) => createProviderModel(value.settings.provider, value.settings.model, key, transport));
    const events: ModelEvent[] = [];
    for await (const event of adapter.prepare(current).stream(new AbortController().signal)) events.push(event);
    expect(events.filter(event => event.type === "part.delta").map(event => event.delta)).toEqual(["Assess ", "the plan."]);
    const thought = events.find(event => event.type === "part.end");
    if (thought?.type !== "part.end") throw new Error("Missing thinking completion.");
    const next: ModelInput = { ...current, messages: [...current.messages, {
      kind: "output", adapter: adapter.version, scope: modelScope(current.settings),
      parts: [{ kind: "thinking", summary: "", text: "Assess the plan.", continuation: thought.continuation ?? null }, { kind: "text", text: "Answer", continuation: null }],
    }] };
    for await (const _event of adapter.prepare(next).stream(new AbortController().signal)) { /* Check the actual serialized request. */ }
    expect(requests[0]?.reasoning).toMatchObject({ effort: "medium" });
    expect(requests[0]?.instructions).toBe(projectSystemPrompt(current.system));
    expect((requests[0]?.input as Array<{ role?: string }>)[0]?.role).toBe("user");
    const replay = requests[1]?.input as Array<{ type?: string; role?: string; content?: unknown }>;
    const assistant = replay.filter(item => item.role === "assistant");
    expect(JSON.stringify(assistant)).not.toContain("Assess the plan.");
    expect(JSON.stringify(assistant)).toContain("Answer");
    const reasoning = replay.find(item => item.type === "reasoning");
    expect(reasoning).toEqual({ type: "reasoning", content: [{ type: "reasoning_text", text: "Assess the plan." }] });
  });

  // Responses summary segments and full text can coexist; SDK summary events must neither duplicate delivery nor end the entire item early.
  it("real Responses decoding preserves full text, multiple summary paragraphs, and ciphertext in one reasoning block", async () => {
    const response = { id: "response", model: "test", created_at: 0 };
    const frames = [
      { type: "response.created", response: { ...response, status: "in_progress" } },
      { type: "response.output_item.added", output_index: 0, item: { type: "reasoning", id: "rs", summary: [] } },
      { type: "response.reasoning_text.delta", item_id: "rs", output_index: 0, content_index: 0, delta: "Full thought" },
      ...[0, 1].flatMap(summary_index => [
        { type: "response.reasoning_summary_part.added", item_id: "rs", output_index: 0, summary_index, part: { type: "summary_text", text: "" } },
        { type: "response.reasoning_summary_text.delta", item_id: `rs-alias-${summary_index}`, output_index: 0, summary_index, delta: `Summary ${summary_index}` },
        { type: "response.reasoning_summary_text.done", item_id: "rs", output_index: 0, summary_index, text: `Summary ${summary_index}` },
        { type: "response.reasoning_summary_part.done", item_id: "rs", output_index: 0, summary_index, part: { type: "summary_text", text: `Summary ${summary_index}` } },
      ]),
      { type: "response.output_item.done", output_index: 0, item: { type: "reasoning", id: "rs-final-alias",
        summary: [{ type: "summary_text", text: "Summary 0" }, { type: "summary_text", text: "Summary 1" }], encrypted_content: "opaque" } },
      { type: "response.completed", response: { ...response, status: "completed", usage: { input_tokens: 1, output_tokens: 3, total_tokens: 4 } } },
    ];
    const transport: typeof fetch = async () => new Response(frames.map(frame => `data: ${JSON.stringify(frame)}\n\n`).join(""),
      { headers: { "content-type": "text/event-stream" } });
    const current = structuredClone(input);
    current.settings.provider.protocol = "openai-responses";
    const adapter = new AiSdkAdapter(async () => "synthetic-key",
      (value, key) => createProviderModel(value.settings.provider, value.settings.model, key, transport));
    const events: ModelEvent[] = [];
    for await (const event of adapter.prepare(current).stream(new AbortController().signal)) events.push(event);
    expect(events.filter(event => event.type === "part.start")).toHaveLength(1);
    expect(events.filter(event => event.type === "part.end")).toHaveLength(1);
    expect(events.filter(event => event.type === "part.delta")).toEqual([
      { type: "part.delta", partId: "thinking:rs", delta: "Full thought" },
      { type: "part.delta", partId: "thinking:rs", delta: "Summary 0", channel: "summary" },
      { type: "part.delta", partId: "thinking:rs", delta: "\n\n", channel: "summary" },
      { type: "part.delta", partId: "thinking:rs", delta: "Summary 1", channel: "summary" },
    ]);
    expect(events.find(event => event.type === "part.end")).toMatchObject({ continuation: { openai: { itemId: "rs", reasoningEncryptedContent: "opaque" } } });
  });

  // An incomplete block does not invalidate terminal state: the execution state machine retains server metering before rejecting unclosed blocks.
  it("Responses reasoning without done still delivers received incomplete terminal state and usage", async () => {
    const response = { id: "response", model: "test", created_at: 0 };
    const frames = [
      { type: "response.created", response: { ...response, status: "in_progress" } },
      { type: "response.output_item.added", output_index: 0, item: { type: "reasoning", id: "rs", summary: [] } },
      { type: "response.reasoning_text.delta", item_id: "rs", output_index: 0, content_index: 0, delta: "Partial" },
      { type: "response.incomplete", response: { ...response, status: "incomplete", incomplete_details: { reason: "max_output_tokens" },
        usage: { input_tokens: 2, output_tokens: 3, total_tokens: 5 } } },
    ];
    const transport: typeof fetch = async () => new Response(frames.map(frame => `data: ${JSON.stringify(frame)}\n\n`).join(""),
      { headers: { "content-type": "text/event-stream" } });
    const current = structuredClone(input);
    current.settings.provider.protocol = "openai-responses";
    const adapter = new AiSdkAdapter(async () => "synthetic-key",
      (value, key) => createProviderModel(value.settings.provider, value.settings.model, key, transport));
    const events: ModelEvent[] = [];
    for await (const event of adapter.prepare(current).stream(new AbortController().signal)) events.push(event);
    expect(events.filter(event => event.type === "part.end")).toEqual([]);
    expect(events.at(-1)).toMatchObject({ type: "finish", reason: "length", usage: { input: 2, output: 3, total: 5 } });
  });

  it("real Anthropic decoding preserves start redactedData and delta signatures", async () => {
    const frames = [
      { type: "message_start", message: { id: "response-thinking", type: "message", role: "assistant", model: "test", content: [],
        stop_reason: null, stop_sequence: null, usage: { input_tokens: 3, output_tokens: 0 } } },
      { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "", signature: "" } },
      { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "Reasoning" } },
      { type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: "signed-thinking" } },
      { type: "content_block_stop", index: 0 },
      { type: "content_block_start", index: 1, content_block: { type: "redacted_thinking", data: "redacted-thinking" } },
      { type: "content_block_stop", index: 1 },
      { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 2 } },
      { type: "message_stop" },
    ];
    const transport: typeof fetch = async () => new Response(frames.map(frame => `data: ${JSON.stringify(frame)}\n\n`).join(""),
      { headers: { "content-type": "text/event-stream" } });
    const adapter = new AiSdkAdapter(async () => "synthetic-key",
      (value, key) => createProviderModel(value.settings.provider, value.settings.model, key, transport));
    const events: ModelEvent[] = [];
    const current = structuredClone(input);
    current.settings.model.generation.maxOutputTokens = 4096;
    for await (const event of adapter.prepare(current).stream(new AbortController().signal)) events.push(event);
    expect(events.find(event => event.type === "part.delta")).toMatchObject({ partId: "thinking:0", delta: "Reasoning" });
    expect(events.filter(event => event.type === "part.end")).toEqual([
      expect.objectContaining({ continuation: { anthropic: { signature: "signed-thinking" } } }),
      expect.objectContaining({ continuation: { anthropic: { redactedData: "redacted-thinking" } } }),
    ]);
  });

  it.each(["openai-chat", "openai-responses", "anthropic"] as const)("real %s providers encode text and images and decode streams without auth headers or redirects", async protocol => {
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jX1kAAAAASUVORK5CYII=", "base64");
    const response = { id: "response-1", model: "test", created_at: 0 };
    const frames = protocol === "openai-chat" ? [
      { id: "response-1", created: 0, model: "test", choices: [{ index: 0, delta: { role: "assistant", content: "Hello" }, finish_reason: null }] },
      { id: "response-1", created: 0, model: "test", choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 } },
    ] : protocol === "anthropic" ? [
      { type: "message_start", message: { id: "response-1", type: "message", role: "assistant", model: "test", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 3, output_tokens: 0 } } },
      { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
      { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hello" } },
      { type: "content_block_stop", index: 0 },
      { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 1 } },
      { type: "message_stop" },
    ] : [
      { type: "response.created", response: { ...response, status: "in_progress" } },
      { type: "response.output_item.added", output_index: 0, item: { id: "message-1", type: "message", role: "assistant", status: "in_progress", content: [] } },
      { type: "response.content_part.added", item_id: "message-1", output_index: 0, content_index: 0, part: { type: "output_text", text: "", annotations: [] } },
      { type: "response.output_text.delta", item_id: "message-1", output_index: 0, content_index: 0, delta: "Hello", logprobs: [] },
      { type: "response.output_item.done", output_index: 0, item: { id: "message-1", type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: "Hello", annotations: [] }] } },
      { type: "response.completed", response: { ...response, status: "completed", usage: { input_tokens: 3, output_tokens: 1, total_tokens: 4 } } },
    ];
    let sent = 0;
    const transport: typeof fetch = async (_url, init) => {
      sent++;
      expect(new Headers(init?.headers).has("authorization")).toBe(false);
      expect(new Headers(init?.headers).has("x-api-key")).toBe(false);
      expect(init?.redirect).toBe("error");
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(body).not.toHaveProperty("reasoning_effort");
      expect(body).not.toHaveProperty("reasoning");
      expect(body).not.toHaveProperty("thinking");
      const messages = (protocol === "openai-responses" ? body.input : body.messages) as { role: string; content: unknown }[];
      const content = messages.find(message => message.role === "user")!.content;
      if (protocol === "anthropic") expect(content).toMatchObject([
        { type: "text", text: "Read" },
        { type: "image", source: { type: "base64", media_type: "image/png", data: png.toString("base64") } }
      ]);
      else if (protocol === "openai-responses") expect(content).toMatchObject([
        { type: "input_text", text: "Read" },
        { type: "input_image", image_url: `data:image/png;base64,${png.toString("base64")}` },
      ]);
      else expect(content).toMatchObject([
        { type: "text", text: "Read" },
        { type: "image_url", image_url: { url: `data:image/png;base64,${png.toString("base64")}` } }
      ]);
      return new Response(frames.map(frame => `data: ${JSON.stringify(frame)}\n\n`).join("") + (protocol === "openai-chat" ? "data: [DONE]\n\n" : ""), { headers: { "content-type": "text/event-stream" } });
    };
    const current = structuredClone(input);
    current.settings.provider.protocol = protocol; current.settings.provider.auth = "none"; current.settings.thinking = "off";
    current.settings.model.capabilities.reasoning = false;
    current.messages = [{ kind: "input", parts: [
      { kind: "text", text: "Read" },
      { kind: "file", mediaType: "image/png", data: png },
    ] }];
    const adapter = new AiSdkAdapter(async () => { throw new Error("Anonymous execution must not read credentials"); },
      (value, key) => createProviderModel(value.settings.provider, value.settings.model, key, transport));
    const events: ModelEvent[] = [];
    for await (const event of adapter.prepare(current).stream(new AbortController().signal)) events.push(event);
    expect(sent).toBe(1);
    expect(events.find(e => e.type === "part.delta")).toMatchObject({ delta: "Hello" });
    expect(events.at(-1)).toMatchObject({ type: "finish", reason: "stop", usage: { input: 3, output: 1, total: 4 } });
  });

  it("rejects remote plaintext authentication during preparation without reading credentials", () => {
    const current = structuredClone(input); current.settings.provider.baseUrl = "http://example.invalid/v1";
    const adapter = new AiSdkAdapter(async () => { throw new Error("Must not read credentials"); });
    expect(() => adapter.prepare(current)).toThrow();
  });

  it("complete unknown-tool calls reach execution without SDK execution or conversion into stream failures", async () => {
    const model = new MockLanguageModelV4({ doStream: async () => ({ stream: simulateReadableStream({ initialDelayInMs: null, chunkDelayInMs: null, chunks: [
      { type: "stream-start", warnings: [] },
      { type: "tool-call", toolCallId: "unknown-1", toolName: "unavailable", input: '{"resource_id":"note"}' },
      { type: "finish", finishReason: { unified: "tool-calls", raw: "tool_use" }, usage: {
        inputTokens: { total: 3, noCache: 3, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 1, text: 1, reasoning: undefined } } },
    ] }) }) });
    const adapter = new AiSdkAdapter(async () => "synthetic-key", () => model);
    const events: ModelEvent[] = [];
    for await (const event of adapter.prepare(input).stream(new AbortController().signal)) events.push(event);
    expect(events.find(e => e.type === "part.end")).toMatchObject({ arguments: { resource_id: "note" } });
    expect(events.at(-1)).toMatchObject({ type: "finish", reason: "tool-calls" });
    expect(JSON.stringify(events)).not.toContain("NoSuchToolError");
  });

  it("one stream retains reasoning signatures and tool arguments, finalizes metering per response, and projects subsequent assistant/tool messages", async () => {
    const model = new MockLanguageModelV4({ doStream: async () => ({ stream: simulateReadableStream({ initialDelayInMs: null, chunkDelayInMs: null, chunks: [
      { type: "stream-start", warnings: [] },
      { type: "response-metadata", id: "response-1", modelId: "test", timestamp: new Date(0) },
      { type: "reasoning-start", id: "r" },
      { type: "reasoning-delta", id: "r", delta: "Think", providerMetadata: { anthropic: { signature: "signature-value", ignored: "secret-metadata" } } },
      { type: "reasoning-end", id: "r", providerMetadata: { anthropic: { signature: "signature-value" } } },
      { type: "tool-input-start", id: "call-1", toolName: "read" },
      { type: "tool-input-delta", id: "call-1", delta: '{"resource_id":"note"}' },
      { type: "tool-input-end", id: "call-1" },
      { type: "tool-call", toolCallId: "call-1", toolName: "read", input: '{"resource_id":"note"}' },
      { type: "finish", finishReason: { unified: "tool-calls", raw: "tool_use" }, usage: {
        inputTokens: { total: 10, noCache: 8, cacheRead: 2, cacheWrite: undefined }, outputTokens: { total: 5, text: 3, reasoning: 2 } } },
    ] }) }) });
    const adapter = new AiSdkAdapter(async () => "credential-not-for-history", () => model);
    const prepared = adapter.prepare(input);
    const events: ModelEvent[] = [];
    for await (const event of prepared.stream(new AbortController().signal)) events.push(event);
    expect(model.doStreamCalls).toHaveLength(1);
    expect(model.doStreamCalls[0]).toMatchObject({ reasoning: "low", temperature: 0.2, maxOutputTokens: 1000 });
    expect(model.doStreamCalls[0]?.prompt[0]).toEqual({ role: "system", content: projectSystemPrompt(input.system) });
    expect(events.find(e => e.type === "part.end" && e.partId === "tool:call-1")).toMatchObject({ arguments: { resource_id: "note" } });
    const end = events.at(-1)!;
    expect(end).toMatchObject({ type: "finish", reason: "tool-calls", responseId: "response-1", rawFinishReason: "tool_use", usage: { input: 10, output: 5, total: 15, reasoning: 2, cacheRead: 2 } });
    if (end.type !== "finish") throw new Error();
    const serialized = JSON.stringify(events);
    expect(serialized).toContain("signature-value"); expect(serialized).not.toContain("credential-not-for-history"); expect(serialized).not.toContain("secret-metadata");
    const thinking = events.find(e => e.type === "part.end" && e.partId === "thinking:r");
    if (thinking?.type !== "part.end") throw new Error("Missing thinking completion.");
    const next = sdkMessages({ ...input, messages: [...input.messages, { kind: "output", parts: [{ kind: "thinking", summary: "", text: "Think", continuation: thinking.continuation ?? null }, { kind: "toolcall", callId: "call-1", name: "read", arguments: { resource_id: "note" }, continuation: null }], scope: modelScope(input.settings), adapter: adapter.version },
      { kind: "result", callId: "call-1", name: "read", error: false, parts: [{ kind: "text", text: "Note text" }] }] });
    expect(next.map(m => m.role)).toEqual(["user", "assistant", "tool"]);
    expect(JSON.stringify(next)).toContain("signature-value");
  });

  it("failed tools send only text projections without serializing text twice", () => {
    const text = 'cancelled: Stopped.\n{"partial":"Captured output"}';
    const messages = sdkMessages({ ...input, messages: [{ kind: "result", callId: "cancelled", name: "resource_call", error: true, parts: [{ kind: "text", text }] }] });
    expect(messages).toEqual([{ role: "tool", content: [{ type: "tool-result", toolCallId: "cancelled", toolName: "resource_call",
      output: { type: "error-text", value: text } }] }]);
  });

  it.each(["anthropic", "openai-responses", "openai-chat"] as const)("%s tool result files are delivered faithfully; Chat moves them to user messages only with an explicit compatibility package", protocol => {
    const png = new Uint8Array([1, 2, 3]);
    const current = structuredClone(input); current.settings.provider.protocol = protocol;
    current.settings.model.compatibility = [{ id: "toolFilesAsUserMessage" }];
    const messages = sdkMessages({ ...current, messages: [{ kind: "result", callId: "see", name: "resource_call", error: false,
      parts: [{ kind: "text", text: "a.png (image/png, 3 bytes)" }, { kind: "file", data: png, mediaType: "image/png", filename: "a.png" }] }] });
    if (protocol !== "openai-chat") {
      expect(messages).toEqual([{ role: "tool", content: [{ type: "tool-result", toolCallId: "see", toolName: "resource_call", output: { type: "content", value: [
        { type: "text", text: "a.png (image/png, 3 bytes)" }, { type: "file", data: { type: "data", data: png }, mediaType: "image/png", filename: "a.png" }] } }] }]);
      return;
    }
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ role: "tool", content: [{ output: { type: "text", value: expect.stringContaining("attached in the following user message: a.png") } }] });
    expect(messages[1]).toMatchObject({ role: "user", content: [{ type: "text" }, { type: "file", data: png, mediaType: "image/png", filename: "a.png" }] });
  });

  // Network errors have no HTTP response; the original cause distinguishes DNS, connection, and other transport failures.
  it("transport failures preserve original messages and cause without automatic retries", async () => {
    const cause = Object.assign(new Error("getaddrinfo ENOTFOUND example.invalid"), { code: "ENOTFOUND" });
    const model = new MockLanguageModelV4({ doStream: async () => { throw new Error("fetch failed", { cause }); } });
    const adapter = new AiSdkAdapter(async () => "credential", () => model);
    let failure: unknown;
    try { for await (const _event of adapter.prepare(input).stream(new AbortController().signal)) { /* Consume the stream. */ } }
    catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(Error);
    expect(failure).toMatchObject({ message: "fetch failed", details: {
      message: "fetch failed", causes: [{ message: "getaddrinfo ENOTFOUND example.invalid", code: "ENOTFOUND" }],
    } });
    expect(model.doStreamCalls).toHaveLength(1);
  });

  it("model or adapter version changes do not block public text, and native data never crosses origins", () => {
    const adapter = new AiSdkAdapter(async () => "credential");
    const current: ModelInput = { ...input, messages: [{
      kind: "output", adapter: "older-adapter", scope: "different-provider",
      parts: [
        { kind: "thinking", summary: "", text: "Foreign thought", continuation: { anthropic: { signature: "foreign-signature" } } },
        { kind: "text", text: "Portable answer", continuation: { openai: { itemId: "foreign-message" } } },
      ],
    }] };
    expect(() => adapter.prepare(current)).not.toThrow();
    expect(sdkMessages(current)).toEqual([{ role: "assistant", content: [
      { type: "reasoning", text: "Foreign thought", providerOptions: { asterism: { summary: "" } } },
      { type: "text", text: "Portable answer", providerOptions: {} },
    ] }]);
  });
});
