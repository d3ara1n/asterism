import { describe, expect, it } from "vitest";
import { generateText } from "ai";
import { thinkingLevels } from "@asterism-app/sdk/contracts";
import { AiSdkAdapter } from "./ai-sdk.ts";
import { createProviderModel } from "./provider.ts";
import { modelProtocol } from "./protocols/index.ts";
import { modelScope, type Json } from "../shared/model.ts";
import { projectSystemPrompt } from "./system-prompt.ts";

import type { ModelEvent, ModelInput } from "./contract.ts";
import { mergeModelCompatibility, type ModelCompatibility } from "../shared/model-compatibility.ts";
import { requestOptions } from "./request-options.ts";
import { modelInputSchema } from "../shared/configuration.ts";

function input(protocol: ModelInput["settings"]["provider"]["protocol"] = "openai-responses"): ModelInput {
  return {
    settings: {
      provider: { id: "p", name: "Test", protocol, baseUrl: "https://example.invalid/v1", enabled: true, auth: "none", compatibility: [] },
      model: { providerId: "p", modelId: "test", name: "Test", enabled: true, contextWindow: null, cost: null,
        capabilities: { reasoning: true, thinkingLevels: [...thinkingLevels], tools: true },
        generation: { temperature: null, topP: null, maxOutputTokens: 4096 }, compatibility: [] }, thinking: "low",
    },
    system: { blocks: [{ id: "system", text: "System instruction" }] },
    messages: [{ kind: "input", parts: [{ kind: "text", text: "Question" }] }], tools: [],
  };
}

// Use the real SDK streaming interface and replace only transport; capture final HTTP bodies instead of checking intermediate options alone.
async function request(value: ModelInput, inspectHeaders?: (headers: Headers) => void): Promise<Record<string, unknown>> {
  const frames = value.settings.provider.protocol === "anthropic" ? [
    { type: "message_start", message: { id: "response", type: "message", role: "assistant", model: "test", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 0 } } },
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "OK" } },
    { type: "content_block_stop", index: 0 },
    { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 1 } },
    { type: "message_stop" },
  ] : value.settings.provider.protocol === "openai-chat" ? [
    { id: "response", object: "chat.completion.chunk", model: "test", created: 0,
      choices: [{ index: 0, delta: { role: "assistant", content: "OK" }, finish_reason: null }] },
    { id: "response", object: "chat.completion.chunk", model: "test", created: 0,
      choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } },
  ] : [
    { type: "response.created", response: { id: "response", model: "test", created_at: 0, status: "in_progress" } },
    { type: "response.output_item.added", output_index: 0, item: { id: "message", type: "message", role: "assistant", status: "in_progress", content: [] } },
    { type: "response.output_text.delta", item_id: "message", output_index: 0, content_index: 0, delta: "OK", logprobs: [] },
    { type: "response.output_item.done", output_index: 0, item: { id: "message", type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: "OK", annotations: [] }] } },
    { type: "response.completed", response: { id: "response", model: "test", created_at: 0, status: "completed", usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } },
  ];
  return (await wireRequest(value, frames, inspectHeaders)).body;
}

async function wireRequest(value: ModelInput, frames: readonly unknown[], inspectHeaders?: (headers: Headers) => void) {
  let body: Record<string, unknown> | undefined;
  const transport: typeof fetch = async (_url, init) => {
    body = JSON.parse(String(init?.body));
    inspectHeaders?.(new Headers(init?.headers));
    return new Response(frames.map(frame => `data: ${JSON.stringify(frame)}\n\n`).join(""), { headers: { "content-type": "text/event-stream" } });
  };
  const adapter = new AiSdkAdapter(async () => "unused", undefined, transport);
  const events: ModelEvent[] = [];
  for await (const event of adapter.prepare(value).stream(new AbortController().signal)) events.push(event);
  return { body: body!, events };
}

const freeformTool = { name: "format_note", kind: "freeform", description: "Format a note" } as const;
const noteDeltas = ['  { "label": ', '"☃" }\n'];
const noteText = noteDeltas.join("");
const fallbackCall = (protocol: "anthropic" | "openai-chat", argumentsChunks: string[]) => {
  if (protocol === "anthropic") return [
    { type: "message_start", message: { id: "response", type: "message", role: "assistant", model: "test",
      content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 0 } } },
    { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "call_note", name: freeformTool.name, input: {} } },
    ...argumentsChunks.map(partial_json => ({ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json } })),
    { type: "content_block_stop", index: 0 },
    { type: "message_delta", delta: { stop_reason: "tool_use", stop_sequence: null }, usage: { output_tokens: 1 } },
    { type: "message_stop" },
  ];
  const chunk = (delta: unknown, finish_reason: string | null = null) => ({
    id: "response", object: "chat.completion.chunk", model: "test", created: 0, choices: [{ index: 0, delta, finish_reason }],
  });
  return [
    ...argumentsChunks.map((args, index) => chunk({ tool_calls: [{ index: 0,
      ...(index === 0 ? { id: "call_note", type: "function" } : {}), function: { ...(index === 0 ? { name: freeformTool.name } : {}), arguments: args },
    }] })),
    chunk({}, "tool_calls"),
  ];
};

describe("Freeform tools on the provider wire", () => {
  it("declares a native Responses custom tool and streams text unchanged, even if it looks like JSON", async () => {
    const current = input();
    current.tools = [freeformTool];
    const item = { type: "custom_tool_call", id: "ctc_note", call_id: "call_note", name: freeformTool.name };
    const { body, events } = await wireRequest(current, [
      { type: "response.created", response: { id: "response", model: "test", created_at: 0, status: "in_progress" } },
      { type: "response.output_item.added", output_index: 0, item: { ...item, input: "" } },
      ...noteDeltas.map(delta => ({ type: "response.custom_tool_call_input.delta", item_id: item.id, output_index: 0, delta })),
      { type: "response.custom_tool_call_input.done", item_id: item.id, output_index: 0, input: noteText },
      { type: "response.output_item.done", output_index: 0, item: { ...item, input: noteText, status: "completed" } },
      { type: "response.completed", response: { id: "response", model: "test", created_at: 0, status: "completed", usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } },
    ]);
    expect(body.tools).toEqual([{ type: "custom", name: freeformTool.name, description: freeformTool.description }]);
    expect(events).toEqual([
      { type: "part.start", part: { id: "tool:call_note", kind: "toolcall", callId: "call_note", name: freeformTool.name, inputKind: "freeform" } },
      ...noteDeltas.map(delta => ({ type: "part.delta", partId: "tool:call_note", delta })),
      { type: "part.end", partId: "tool:call_note", input: { kind: "freeform", text: noteText }, continuation: { itemId: "ctc_note" } },
      expect.objectContaining({ type: "finish", reason: "tool-calls" }),
    ]);
    const end = events.find(event => event.type === "part.end" && event.partId === "tool:call_note");
    if (end?.type !== "part.end" || !end.input) throw new Error("Expected completed tool input.");
    current.messages.push(
      { kind: "output", scope: modelScope(current.settings), adapter: modelProtocol("openai-responses").continuationFormat, parts: [
        { kind: "toolcall", callId: item.call_id, name: item.name, input: end.input, continuation: end.continuation ?? null },
      ] },
      { kind: "result", callId: item.call_id, name: item.name, error: false, parts: [{ kind: "text", text: "Formatted" }] },
    );
    expect(((await request(current)).input as unknown[]).slice(-2)).toEqual([
      { ...item, input: noteText },
      { type: "custom_tool_call_output", call_id: item.call_id, output: "Formatted" },
    ]);
  });

  it.each(["anthropic", "openai-chat"] as const)("%s uses a JSON envelope without exposing its syntax as a draft", async protocol => {
    const current = input(protocol);
    current.tools = [freeformTool];
    const { body, events } = await wireRequest(current, fallbackCall(protocol, ['{"in', `put":${JSON.stringify(noteText)}}`]));
    const schema = { type: "object", properties: { input: { type: "string" } }, required: ["input"], additionalProperties: false };
    expect(body.tools).toMatchObject(protocol === "anthropic" ? [{ name: freeformTool.name, input_schema: schema }]
      : [{ type: "function", function: { name: freeformTool.name, parameters: schema } }]);
    expect(events).toEqual([
      { type: "part.start", part: { id: "tool:call_note", kind: "toolcall", callId: "call_note", name: freeformTool.name, inputKind: "freeform" } },
      { type: "part.delta", partId: "tool:call_note", delta: noteText },
      { type: "part.end", partId: "tool:call_note", input: { kind: "freeform", text: noteText }, continuation: {} },
      expect.objectContaining({ type: "finish", reason: "tool-calls" }),
    ]);
  });

  it("does not promote an invalid fallback envelope to executable freeform input", async () => {
    const current = input("anthropic");
    current.tools = [freeformTool];
    await expect(wireRequest(current, fallbackCall("anthropic", ['{"input":"note","unexpected":true}'])))
      .rejects.toMatchObject({ code: "invalid_tool_input", origin: "model" });
  });

  const history = (target: ModelInput, itemId = "foreign_id"): ModelInput["messages"] => [...target.messages,
    { kind: "output", scope: "foreign", adapter: "foreign/1", parts: [
      { kind: "toolcall", callId: "call_note", name: freeformTool.name, input: { kind: "freeform", text: noteText }, continuation: { itemId } },
    ] },
    { kind: "result", callId: "call_note", name: freeformTool.name, error: false, parts: [{ kind: "text", text: "Formatted" }] },
  ];

  it.each(["openai-responses", "anthropic", "openai-chat"] as const)("%s replays an undeclared, foreign freeform call together with its result", async protocol => {
    const current = input(protocol);
    current.messages = history(current);
    const body = await request(current);
    expect(body.tools ?? []).toEqual([]);
    if (protocol === "openai-responses") expect((body.input as unknown[]).slice(-2)).toEqual([
      { type: "custom_tool_call", call_id: "call_note", name: freeformTool.name, input: noteText },
      { type: "custom_tool_call_output", call_id: "call_note", output: "Formatted" },
    ]);
    if (protocol === "anthropic") expect((body.messages as unknown[]).slice(-2)).toMatchObject([
      { role: "assistant", content: [{ type: "tool_use", id: "call_note", name: freeformTool.name, input: { input: noteText } }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "call_note", content: "Formatted" }] },
    ]);
    if (protocol === "openai-chat") expect((body.messages as unknown[]).slice(-2)).toMatchObject([
      { role: "assistant", tool_calls: [{ type: "function", id: "call_note", function: { name: freeformTool.name, arguments: JSON.stringify({ input: noteText }) } }] },
      { role: "tool", tool_call_id: "call_note", content: "Formatted" },
    ]);
  });

  it("keeps Responses replay in model order and uses each stored call kind, not a same-name declaration", async () => {
    const current = input();
    current.messages = history(current, "ctc_note");
    const output = current.messages.at(-2);
    if (output?.kind !== "output") throw new Error("Expected model output.");
    output.scope = modelScope(current.settings);
    output.adapter = modelProtocol("openai-responses").continuationFormat;
    output.parts.unshift({ kind: "thinking", text: "Think", summary: "", continuation: null });
    output.parts.push({ kind: "toolcall", callId: "call_old", name: "label", input: { kind: "structured", value: { text: "note" } }, continuation: null });
    current.messages.push({ kind: "result", callId: "call_old", name: "label", error: false, parts: [{ kind: "text", text: "Labeled" }] });
    current.tools = [
      { name: freeformTool.name, description: freeformTool.description, kind: "structured", parameters: { type: "object" } },
      { name: "label", description: "Label text", kind: "freeform" },
    ];
    const body = await request(current);
    expect((body.input as unknown[]).slice(-5)).toEqual([
      { type: "reasoning", content: [{ type: "reasoning_text", text: "Think" }] },
      { type: "custom_tool_call", id: "ctc_note", call_id: "call_note", name: freeformTool.name, input: noteText },
      { type: "function_call", call_id: "call_old", name: "label", arguments: '{"text":"note"}' },
      { type: "custom_tool_call_output", call_id: "call_note", output: "Formatted" },
      { type: "function_call_output", call_id: "call_old", output: "Labeled" },
    ]);
  });
});

describe("Reasoning level and budget mappings", () => {
  // Transmitted values follow explicit mappings rather than SDK enums or model-name defaults; history retains standard levels.
  it.each(["openai-responses", "openai-chat", "anthropic"] as const)("%s sends custom effort unchanged and supports explicit omission and protocol defaults", async protocol => {
    const current = input(protocol);
    current.settings.model.modelId = protocol === "anthropic" ? "claude-opus-4-7" : "gpt-5.1";
    current.settings.provider.compatibility = [{ id: "customThinkingLevels", value: { low: "upstream-low" } }];
    const original = structuredClone(current);
    const effort = (body: Record<string, unknown>) => protocol === "openai-chat" ? body.reasoning_effort
      : (body[protocol === "anthropic" ? "output_config" : "reasoning"] as Record<string, unknown> | undefined)?.effort;
    expect(effort(await request(current))).toBe("upstream-low");
    expect(current).toEqual(original);
    current.settings.model.compatibility = [{ id: "customThinkingLevels", value: { low: null } }];
    const omitted = await request(current);
    expect(effort(omitted)).toBeUndefined();
    if (protocol === "openai-responses") expect(omitted.reasoning).toMatchObject({ summary: "auto" });
    if (protocol === "anthropic") expect(omitted.thinking).toMatchObject({ type: "adaptive" });
    current.settings.model.compatibility = [{ id: "customThinkingLevels", value: { high: "upstream-high" } }];
    expect(effort(await request(current))).toBe("low");
    current.settings.model.compatibility = [];
    expect(effort(await request(current))).toBe("upstream-low");
    current.settings.model.capabilities.reasoning = false;
    expect(effort(await request(current))).toBeUndefined();
  });

  // An empty budget pack selects manual thinking; model overrides replace the whole provider mapping.
  it("Anthropic default budgets use the final output limit and budget packages override only specified levels", async () => {
    const current = input("anthropic");
    current.settings.model.modelId = "claude-sonnet-4-5";
    current.settings.provider.compatibility = [{ id: "customThinkingBudgets", value: {} }];
    current.settings.model.generation.maxOutputTokens = 20000;
    current.maxOutputTokens = 10000;
    current.settings.thinking = "medium";
    const defaults = await request(current);
    expect(defaults).toMatchObject({ thinking: { type: "enabled", budget_tokens: 3000 }, max_tokens: 10000 });
    expect(defaults).not.toHaveProperty("output_config");
    current.settings.provider.compatibility = [{ id: "customThinkingBudgets", value: { medium: 5000, low: 2048 } }];
    expect(await request(current)).toMatchObject({ thinking: { type: "enabled", budget_tokens: 5000 }, max_tokens: 10000 });
    current.settings.model.compatibility = [{ id: "customThinkingBudgets", value: { high: 6000 } }];
    expect(await request(current)).toMatchObject({ thinking: { type: "enabled", budget_tokens: 3000 }, max_tokens: 10000 });
    current.settings.thinking = "low";
    expect(await request(current)).toMatchObject({ thinking: { type: "enabled", budget_tokens: 1024 }, max_tokens: 10000 });
    current.settings.model.compatibility = [];
    expect(await request(current)).toMatchObject({ thinking: { type: "enabled", budget_tokens: 2048 }, max_tokens: 10000 });
  });

  // Unknown relay IDs, old manual models, adaptive models, and always-thinking models must obey the same explicit mode choice.
  it.each(["relay-claude", "claude-sonnet-4-5", "claude-opus-4-7", "claude-sonnet-5-5"])(
    "Messages thinking mode follows the budget pack rather than SDK heuristics for %s", async modelId => {
      const current = input("anthropic");
      current.settings.model.modelId = modelId;
      current.settings.model.generation.maxOutputTokens = 20000;
      current.settings.provider.compatibility = [{ id: "customThinkingLevels", value: { low: "custom-low" } }];
      const adaptive = await request(current);
      expect(adaptive.thinking).toEqual({ type: "adaptive", display: "summarized" });
      expect(adaptive.output_config).toMatchObject({ effort: "custom-low" });
      current.settings.model.compatibility = [{ id: "customThinkingBudgets", value: {} }];
      const manual = await request(current);
      expect(manual).toMatchObject({ thinking: { type: "enabled", budget_tokens: 2000 }, max_tokens: 20000,
        output_config: { effort: "custom-low" } });
      current.settings.model.compatibility = [{ id: "customThinkingBudgets", value: { low: 4096 } }];
      expect((await request(current)).thinking).toEqual({ type: "enabled", budget_tokens: 4096 });
      current.settings.model.compatibility = [];
      expect((await request(current)).thinking).toEqual(adaptive.thinking);
      current.settings.model.capabilities.thinkingLevels = ["low"];
      current.settings.thinking = "off";
      const disabled = await request(current);
      expect(disabled.thinking).toEqual({ type: "disabled" });
      expect(disabled.output_config).toBeUndefined();
      current.settings.model.compatibility = [{ id: "customThinkingBudgets", value: {} }];
      expect((await request(current)).thinking).toEqual({ type: "disabled" });
    });

  // Budget packs cannot enable thinking when the caller leaves the level unset or disables reasoning capability.
  it.each(["unset", "disabled"])("Messages omits thinking with a budget pack and reasoning %s", async mode => {
    const current = input("anthropic");
    current.settings.model.compatibility = [{ id: "customThinkingBudgets", value: { low: 2048 } }];
    if (mode === "unset") current.settings.thinking = null;
    else current.settings.model.capabilities.reasoning = false;
    const body = await request(current);
    expect(body).not.toHaveProperty("thinking");
    expect(body).not.toHaveProperty("output_config");
  });

  // SDK output defaults differ for unknown and known models; manual budgets use the host total cap instead.
  it("manual budgets without output limits use a fixed total cap of 4096 without SDK or level expansion", async () => {
    const current = input("anthropic");
    current.settings.model.generation.maxOutputTokens = null;
    current.settings.model.compatibility = [{ id: "customThinkingBudgets", value: {} }];
    for (const modelId of ["test", "claude-sonnet-4-5"]) {
      current.settings.model.modelId = modelId;
      current.settings.thinking = "low";
      expect(await request(current)).toMatchObject({ max_tokens: 4096, thinking: { type: "enabled", budget_tokens: 1024 } });
      current.settings.thinking = "max";
      expect(await request(current)).toMatchObject({ max_tokens: 4096, thinking: { type: "enabled", budget_tokens: 3891 } });
    }
  });

  // Endpoint acceptance is not inferred from Anthropic's public budget rules, including on compatible services.
  it.each([{ limit: 8192, budget: 8192, expected: 8192 }, { limit: 1000, budget: undefined, expected: 1024 }, { limit: 1000, budget: 128, expected: 128 }])(
    "sends the manual budget unchanged with output limit $limit and budget $budget", async ({ limit, budget, expected }) => {
      const current = input("anthropic");
      current.settings.model.generation.maxOutputTokens = limit;
      current.settings.model.compatibility = [{ id: "customThinkingBudgets", value: budget === undefined ? {} : { low: budget } }];
      current.settings.model = modelInputSchema.parse(current.settings.model);
      expect(await request(current)).toMatchObject({ max_tokens: limit, thinking: { type: "enabled", budget_tokens: expected } });
    });

  // Exercise configuration validation and SDK serialization: neither may substitute common provider limits for explicit values.
  it.each((["openai-responses", "openai-chat", "anthropic"] as const).flatMap(protocol =>
    ([null, "off", "low"] as const).map(thinking => ({ protocol, thinking }))))(
    "$protocol transmits configured sampling and million-token output limits with thinking=$thinking", async ({ protocol, thinking }) => {
      const current = input(protocol);
      current.settings.model.modelId = protocol === "anthropic" ? "claude-sonnet-4-5" : "gpt-5.1";
      current.settings.model.generation = { temperature: 3, topP: 2, maxOutputTokens: 1_000_000 };
      current.settings.model = modelInputSchema.parse(current.settings.model);
      current.settings.thinking = thinking;
      const body = await request(current);
      expect(body).toMatchObject({ temperature: 3, top_p: 2 });
      expect(body.max_output_tokens ?? body.max_completion_tokens ?? body.max_tokens).toBe(1_000_000);
    });

  // Streaming and non-streaming SDK calls share the budget contract; minimal connection probes do not enable reasoning.
  it.each([false, true])("non-streaming execution shares thinking mode with streaming while probes omit it (manual=%s)", async manual => {
    const current = input("anthropic");
    current.settings.model.generation.maxOutputTokens = 10000;
    current.settings.model.modelId = "claude-sonnet-5-5";
    if (manual) current.settings.model.compatibility = [{ id: "customThinkingBudgets", value: { low: 2048 } }];
    const bodies: Record<string, unknown>[] = [];
    const transport: typeof fetch = async (_url, init) => {
      bodies.push(JSON.parse(String(init?.body)));
      return Response.json({ id: "response", type: "message", role: "assistant", model: "test",
        content: [{ type: "text", text: "OK" }], stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } });
    };
    const { provider, model } = current.settings;
    const languageModel = createProviderModel(provider, model, "unused", transport);
    await generateText({ model: languageModel, prompt: "Question", ...requestOptions(provider, model, { purpose: "execution", thinking: "low" }) });
    await generateText({ model: languageModel, prompt: "Question", ...requestOptions(provider, model, { purpose: "probe" }) });
    expect(bodies[0]).toMatchObject({ thinking: manual ? { type: "enabled", budget_tokens: 2048 } : { type: "adaptive" }, max_tokens: 10000 });
    expect(bodies[1]).not.toHaveProperty("thinking");
    expect(bodies[1]).not.toHaveProperty("output_config");
    expect(bodies[1]).toMatchObject({ max_tokens: 10000 });
  });
});

describe("Explicit compatibility and target projection", () => {
  // Request identity contract: final HTTP headers follow model > provider > caller precedence, and the SDK must not append UA;
  // explicit compatibility settings enable session headers, which remain stable across requests in a session; identity stays outside model text.
  it.each(["openai-responses", "openai-chat", "anthropic"] as const)("%s request identity takes effect at the final transport boundary", async protocol => {
    const current = input(protocol);
    current.userAgent = "ExampleAgent/1.0";
    current.sessionId = "session-a";
    const headers: Headers[] = [];
    const send = () => request(current, value => headers.push(value));
    await send();
    expect(headers[0]!.get("user-agent")).toBe("ExampleAgent/1.0");
    expect(headers[0]!.has("x-opencode-session")).toBe(false);
    current.settings.provider.compatibility = [
      { id: "opencodeSession" }, { id: "customUserAgent", value: { userAgent: "ConnectionAgent/2.0" } },
    ];
    await send();
    expect(headers[1]!.get("user-agent")).toBe("ConnectionAgent/2.0");
    current.settings.model.compatibility = [{ id: "customUserAgent", value: { userAgent: "ModelAgent/3.0" } }];
    const body = await send();
    expect(headers[2]!.get("user-agent")).toBe("ModelAgent/3.0");
    expect(headers[1]!.get("x-opencode-session")).toBe("session-a");
    expect(headers[2]!.get("x-opencode-session")).toBe("session-a");
    expect(JSON.stringify(body)).not.toMatch(/session-a|ExampleAgent|ConnectionAgent|ModelAgent/);
    current.sessionId = "session-b";
    current.settings.model.compatibility = [];
    await send();
    expect(headers[3]!.get("x-opencode-session")).toBe("session-b");
    expect(headers[3]!.get("user-agent")).toBe("ConnectionAgent/2.0");
  });

  // Public contract: summaries cannot fill full text; reusable origin ciphertext takes precedence and ciphertext with empty text must survive.
  it("Responses encodes plaintext, summaries, and native ciphertext separately without changing history", async () => {
    const current = input();
    current.messages = [{ kind: "output", adapter: modelProtocol(current.settings.provider.protocol).continuationFormat, scope: modelScope(current.settings), parts: [
      { kind: "thinking", text: "Plain", summary: "Summary", continuation: null },
      { kind: "thinking", text: "", summary: "Summary only", continuation: null },
      { kind: "thinking", text: "Visible full text", summary: "Opaque summary",
        continuation: { itemId: "rs_native", reasoningEncryptedContent: "cipher" } },
      { kind: "thinking", text: "", summary: "", continuation: { reasoningEncryptedContent: "cipher-only" } },
      { kind: "text", text: "Answer", continuation: null },
    ] }];
    const original = structuredClone(current);
    expect((await request(current)).input).toEqual([
      { type: "reasoning", content: [{ type: "reasoning_text", text: "Plain" }], summary: [{ type: "summary_text", text: "Summary" }] },
      { type: "reasoning", summary: [{ type: "summary_text", text: "Summary only" }] },
      { type: "reasoning", id: "rs_native", encrypted_content: "cipher", summary: [{ type: "summary_text", text: "Opaque summary" }] },
      { type: "reasoning", encrypted_content: "cipher-only", summary: [] },
      { role: "assistant", content: "Answer" },
    ]);
    expect(current).toEqual(original);
    current.settings.model.capabilities.reasoning = false;
    expect((await request(current)).input).toEqual([{ role: "assistant", content: "Answer" }]);
  });

  // Kimi's include enum lacks encrypted_content; GLM's schema requires a single content object rather than an array.
  it("endpoint compatibility adjusts only field shapes and unsupported request parameters, including the first request", async () => {
    const current = input();
    current.settings.provider.compatibility = [{ id: "responsesReasoning", value: { content: "object", encryptedContent: false, summary: false } }];
    const first = await request(current);
    expect(first).not.toHaveProperty("include");
    expect(first.reasoning).toEqual({ effort: "low" });
    current.messages.push({ kind: "output", adapter: "foreign", scope: "foreign", parts: [
      { kind: "thinking", text: "Plain", summary: "", continuation: null },
      { kind: "text", text: "Answer", continuation: null },
    ] });
    expect((await request(current)).input).toContainEqual({ type: "reasoning", content: { type: "reasoning_text", text: "Plain" } });
  });

  it("includes the required empty input summary without requesting a summary from the Mistral endpoint", async () => {
    const current = input();
    current.settings.provider.compatibility = [
      { id: "responsesReasoning", value: { content: "object", encryptedContent: false, summary: false, requireInputSummary: true } },
    ];
    current.messages.push({ kind: "output", adapter: "foreign", scope: "foreign", parts: [
      { kind: "thinking", text: "Plain", summary: "", continuation: null },
      { kind: "thinking", text: "", summary: "", continuation: null },
      { kind: "text", text: "Answer", continuation: null },
    ] });
    const encoded = await request(current);
    expect(encoded.reasoning).toEqual({ effort: "low" });
    expect((encoded.input as Array<{ type?: string }>).filter(item => item.type === "reasoning"))
      .toEqual([{ type: "reasoning", content: { type: "reasoning_text", text: "Plain" }, summary: [] }]);
  });

  it("omits stored item IDs from a stateless gateway request without losing its reasoning or tool call IDs", async () => {
    const current = input();
    current.settings.provider.compatibility = [{ id: "responsesOmitStoredItems" }];
    current.messages = [{ kind: "output", adapter: modelProtocol(current.settings.provider.protocol).continuationFormat, scope: modelScope(current.settings), parts: [
      { kind: "thinking", text: "", summary: "", continuation: { itemId: "rs_native", reasoningEncryptedContent: "cipher" } },
      { kind: "toolcall", callId: "call", name: "read", input: { kind: "structured", value: {} }, continuation: { itemId: "fc_native" } },
    ] }, { kind: "result", callId: "call", name: "read", error: false, parts: [{ kind: "text", text: "Result" }] }];
    const encoded = await request(current);
    expect(encoded.input).toEqual([
      { type: "reasoning", encrypted_content: "cipher", summary: [] },
      expect.objectContaining({ type: "function_call", call_id: "call" }),
      expect.objectContaining({ type: "function_call_output", call_id: "call" }),
    ]);
    expect((encoded.input as unknown[])[1]).not.toHaveProperty("id");
  });

  // Messages signatures must match original text; unsigned text encodes unchanged, summaries are not disguised as thinking, and redacted-only blocks continue normally.
  it("Messages natively supports unsigned plaintext, signatures, and redacted reasoning while preserving relative tool order", async () => {
    const current = input("anthropic");
    current.messages = [{ kind: "output", adapter: modelProtocol(current.settings.provider.protocol).continuationFormat, scope: modelScope(current.settings), parts: [
      { kind: "thinking", text: "  Signed\n", summary: "Display only", continuation: { signature: "signed" } },
      { kind: "thinking", text: "", summary: "", continuation: { signature: "empty-signed" } },
      { kind: "toolcall", callId: "call", name: "read", input: { kind: "structured", value: {} }, continuation: null },
      { kind: "thinking", text: "Unsigned", summary: "", continuation: null },
      { kind: "thinking", text: "", summary: "Not a full thought", continuation: null },
      { kind: "thinking", text: "", summary: "", continuation: { redactedData: "opaque" } },
    ] }];
    current.messages.push({ kind: "result", callId: "call", name: "read", error: false, parts: [{ kind: "text", text: "Result" }] });
    expect(((await request(current)).messages as unknown[])[0]).toEqual({ role: "assistant", content: [
      { type: "thinking", thinking: "  Signed\n", signature: "signed" },
      { type: "thinking", thinking: "", signature: "empty-signed" },
      { type: "tool_use", id: "call", name: "read", input: {} },
      { type: "thinking", thinking: "Unsigned" },
      { type: "redacted_thinking", data: "opaque" },
    ] });
    current.messages = [{ kind: "output", adapter: "foreign", scope: "foreign", parts: [
      { kind: "thinking", text: "Only thinking", summary: "", continuation: null },
    ] }, { kind: "input", parts: [{ kind: "text", text: "Continue" }] }];
    expect((await request(current)).messages).toEqual([
      { role: "assistant", content: [{ type: "thinking", thinking: "Only thinking" }] },
      { role: "user", content: [{ type: "text", text: "Continue" }] },
    ]);
  });

  // The SDK trims the last assistant's final text segment; valid leading whitespace must not invalidate reasoning insertion plans or affect original signed text.
  it("Messages accounts for SDK trimming of final text while signed reasoning retains original whitespace", async () => {
    const current = input("anthropic");
    current.messages = [{ kind: "output", adapter: modelProtocol(current.settings.provider.protocol).continuationFormat, scope: modelScope(current.settings), parts: [
      { kind: "thinking", text: "  Thought\n", summary: "", continuation: { signature: "signed" } },
      { kind: "text", text: "  Indented answer\n", continuation: null },
    ] }];
    expect((await request(current)).messages).toEqual([{ role: "assistant", content: [
      { type: "thinking", thinking: "  Thought\n", signature: "signed" },
      { type: "text", text: "Indented answer" },
    ] }]);
  });

  // Utility and conversation share encoding; level lists must not reject or clamp max/xhigh, and upstream chooses omitted levels.
  it.each(["openai-responses", "openai-chat", "anthropic"] as const)("%s encodes unlisted levels unchanged and omits effort when unset", async protocol => {
    const current = input(protocol);
    current.settings.model.modelId = protocol === "anthropic" ? "claude-opus-4-7" : "gpt-5.1";
    current.settings.model.capabilities.thinkingLevels = ["low"];
    const effort = (body: Record<string, unknown>) => protocol === "openai-chat" ? body.reasoning_effort
      : (body[protocol === "anthropic" ? "output_config" : "reasoning"] as Record<string, unknown> | undefined)?.effort;
    for (const level of ["xhigh", "max"] as const) {
      current.settings.thinking = level;
      expect(effort(await request(current))).toBe(level);
    }
    current.settings.model.capabilities.thinkingLevels = [];
    current.settings.thinking = null;
    expect(effort(await request(current))).toBeUndefined();
  });

  // Two-layer merging must not deep-merge parameters, treat empty lists as disabling, or write effective entries back into either source.
  it("deduplicates by id, prefers whole model parameter entries, and restores provider entries when overrides are removed", () => {
    const provider: ModelCompatibility[] = [{ id: "tag" }, { id: "options", value: { count: 3, enabled: true } }];
    const model: ModelCompatibility[] = [{ id: "tag" }, { id: "options", value: { enabled: false } }, { id: "modelOnly" }];
    const original = structuredClone({ provider, model });
    expect(mergeModelCompatibility(provider, model)).toEqual([
      { id: "tag" }, { id: "options", value: { enabled: false } }, { id: "modelOnly" },
    ]);
    expect(mergeModelCompatibility(provider, model.filter(entry => entry.id !== "options"))).toEqual([
      ...provider, { id: "modelOnly" },
    ]);
    expect(mergeModelCompatibility(provider, [])).toEqual(provider);
    expect(mergeModelCompatibility([], model)).toEqual(model);
    expect({ provider, model }).toEqual(original);
  });

  // Send one system prompt: instructions by default, or the first system message only with an explicit tag.
  it.each(["none", "provider", "model", "both"])("Responses system prompt placement follows tags from both layers: %s", async source => {
    const current = input();
    current.settings.provider.compatibility = source === "provider" || source === "both" ? [{ id: "systemMessageInMessages" }] : [];
    current.settings.model.compatibility = source === "model" || source === "both" ? [{ id: "systemMessageInMessages" }] : [];
    const body = await request(current);
    const messages = body.input as Record<string, unknown>[];
    if (source !== "none") {
      expect(body).not.toHaveProperty("instructions");
      expect(messages[0]).toMatchObject({ role: "system", content: projectSystemPrompt(current.system) });
      expect(messages.filter(message => message.role === "system")).toHaveLength(1);
    } else {
      expect(body.instructions).toBe(projectSystemPrompt(current.system));
      expect(messages.some(message => message.role === "system" || message.role === "developer")).toBe(false);
    }
  });

  // Reference protocols do not restrict additions; protocols unaware of these behaviors continue encoding normally.
  it("Responses tags do not change Anthropic requests", async () => {
    const current = input("anthropic");
    current.settings.provider.compatibility = [{ id: "systemMessageInMessages" }, { id: "responsesReasoning", value: {} }];
    const body = await request(current);
    expect(body).not.toHaveProperty("instructions");
    expect(body.system).toEqual([{ type: "text", text: projectSystemPrompt(current.system) }]);
    expect(body.messages).toEqual([{ role: "user", content: [{ type: "text", text: "Question" }] }]);
  });

  it("Messages omits automatic caching without the pack", async () => {
    expect(await request(input("anthropic"))).not.toHaveProperty("cache_control");
  });

  it.each(["provider", "model"] as const)("the %s pack enables Messages automatic caching with the service default TTL", async scope => {
    const current = input("anthropic");
    current.settings[scope].compatibility = [{ id: "messagesPromptCaching" }];
    expect((await request(current)).cache_control).toEqual({ type: "ephemeral" });
  });

  it.each(["openai-responses", "openai-chat"] as const)("the Messages prompt caching pack leaves %s unchanged", async protocol => {
    const current = input(protocol);
    current.settings.provider.compatibility = [{ id: "messagesPromptCaching" }];
    expect(await request(current)).not.toHaveProperty("cache_control");
  });

  // Plaintext reasoning must retain its position without being dropped by the SDK or disrupting adjacent images, tool pairing, or assistant text.
  it("plaintext reasoning requires no compatibility package, inserts in original order, and uses only public text across origins", async () => {
    const current = input();
    current.settings.model.compatibility = [{ id: "systemMessageInMessages" }];
    const foreign = { adapter: "foreign-adapter", scope: "foreign-scope" };
    current.messages = [
      { kind: "input", parts: [{ kind: "text", text: "Look" }, { kind: "file", data: new Uint8Array([1, 2, 3]), mediaType: "image/png" }] },
      { kind: "output", ...foreign, parts: [
        { kind: "thinking", summary: "", text: "Before tool", continuation: { signature: "foreign-signature" } },
        { kind: "text", text: "Checking", continuation: { itemId: "foreign-item" } },
        { kind: "toolcall", callId: "vendor/call.with.dots", name: "lookup", input: { kind: "structured", value: { query: "value" } }, continuation: null },
      ] },
      { kind: "result", callId: "vendor/call.with.dots", name: "lookup", error: false, parts: [{ kind: "text", text: "Found" }] },
      { kind: "output", ...foreign, parts: [
        { kind: "thinking", summary: "", text: "After tool", continuation: { reasoningEncryptedContent: "foreign-ciphertext" } },
        { kind: "text", text: "Answer", continuation: null },
      ] },
    ];
    const original = structuredClone(current.messages);
    const body = await request(current);
    const items = body.input as Record<string, unknown>[];
    expect(items.map(item => item.type ?? item.role)).toEqual(["system", "user", "reasoning", "assistant", "function_call", "function_call_output", "reasoning", "assistant"]);
    expect(items[1]).toMatchObject({ content: [{ type: "input_text", text: "Look" }, { type: "input_image", image_url: "data:image/png;base64,AQID" }] });
    expect(items[2]).toEqual({ type: "reasoning", content: [{ type: "reasoning_text", text: "Before tool" }] });
    expect(items[6]).toEqual({ type: "reasoning", content: [{ type: "reasoning_text", text: "After tool" }] });
    expect(items[4]?.call_id).toMatch(/^[A-Za-z0-9_-]{1,64}$/u);
    expect(items[5]?.call_id).toBe(items[4]?.call_id);
    expect(JSON.stringify(body)).not.toMatch(/foreign-(signature|ciphertext|item)|vendor\/call/);
    expect(current.messages).toEqual(original);
  });

  // Normal native continuation is the baseline; switching omits only nonreusable data, and switching back projects original history without contamination by intermediate requests.
  it.each(["openai-responses", "anthropic"] as const)("%s native continuation and A→B→A leave history unchanged", async protocol => {
    const current = input(protocol);
    const native: Json = protocol === "anthropic" ? { signature: "native-token" }
      : { itemId: "rs_native", reasoningEncryptedContent: "native-token" };
    current.messages.push({ kind: "output", adapter: modelProtocol(current.settings.provider.protocol).continuationFormat, scope: modelScope(current.settings), parts: [
      { kind: "thinking", summary: "", text: "Visible thought", continuation: native },
      { kind: "text", text: "Portable answer", continuation: null },
    ] });
    current.messages.push({ kind: "input", parts: [{ kind: "text", text: "Continue" }] });
    const original = structuredClone(current);
    const a = await request(current);
    const other = structuredClone(current);
    other.settings.model.modelId = "other-model";
    other.settings.provider.protocol = protocol === "anthropic" ? "openai-responses" : "anthropic";
    const b = await request(other);
    const resumed = structuredClone(current);
    const foreign: Json = other.settings.provider.protocol === "anthropic" ? { signature: "foreign-token" }
      : { itemId: "rs_foreign", reasoningEncryptedContent: "foreign-token" };
    resumed.messages.push({ kind: "output", adapter: modelProtocol(other.settings.provider.protocol).continuationFormat, scope: modelScope(other.settings), parts: [
      { kind: "thinking", summary: "", text: "B thought", continuation: foreign },
      { kind: "text", text: "B answer", continuation: null },
    ] });
    resumed.messages.push({ kind: "input", parts: [{ kind: "text", text: "Return to A" }] });
    const again = await request(resumed);
    const field = protocol === "anthropic" ? "messages" : "input";
    const otherField = other.settings.provider.protocol === "anthropic" ? "messages" : "input";
    expect(JSON.stringify(a[field])).toContain("native-token");
    expect(JSON.stringify(b[otherField])).not.toMatch(/native-token|rs_native/);
    expect(JSON.stringify(b[otherField])).toContain("Visible thought");
    expect(JSON.stringify(b[otherField])).toContain("Portable answer");
    expect((again[field] as unknown[]).slice(0, (a[field] as unknown[]).length)).toEqual(a[field]);
    expect(JSON.stringify(again[field])).toContain("B answer");
    expect(JSON.stringify(again[field])).not.toContain("foreign-token");
    expect(JSON.stringify(again[field])).toContain("B thought");
    expect(current).toEqual(original);
  });

  // Different origins may reuse call IDs; projection preserves this origin's IDs and renames foreign calls together with their results.
  it("cross-origin call ID collisions preserve native identities while foreign calls remain paired with results", async () => {
    const current = input();
    current.messages = [
      { kind: "output", adapter: "foreign", scope: "foreign", parts: [
        { kind: "toolcall", callId: "same_id", name: "lookup", input: { kind: "structured", value: {} }, continuation: null },
      ] },
      { kind: "result", callId: "same_id", name: "lookup", error: false, parts: [{ kind: "text", text: "Foreign result" }] },
      { kind: "output", adapter: modelProtocol(current.settings.provider.protocol).continuationFormat, scope: modelScope(current.settings), parts: [
        { kind: "toolcall", callId: "same_id", name: "lookup", input: { kind: "structured", value: {} }, continuation: null },
      ] },
      { kind: "result", callId: "same_id", name: "lookup", error: false, parts: [{ kind: "text", text: "Native result" }] },
    ];
    const body = await request(current);
    const items = body.input as Record<string, unknown>[];
    expect(items[0]?.call_id).not.toBe("same_id");
    expect(items[1]?.call_id).toBe(items[0]?.call_id);
    expect(items[2]?.call_id).toBe("same_id");
    expect(items[3]?.call_id).toBe("same_id");
    expect((await request(current)).input).toEqual(body.input);
  });

  function chatToolFiles(): ModelInput {
    const current = input("openai-chat");
    // No generation override: the tool attachment must trigger wire encoding on its own.
    current.settings.thinking = null;
    current.settings.model.generation.maxOutputTokens = null;
    current.messages.push(
      { kind: "output", adapter: modelProtocol(current.settings.provider.protocol).continuationFormat, scope: modelScope(current.settings),
        parts: ["call", "second"].map(callId => ({ kind: "toolcall", callId, name: "lookup", input: { kind: "structured", value: {} }, continuation: null })) },
      { kind: "result", callId: "call", name: "lookup", error: false, parts: [
        { kind: "text", text: "First result" },
        { kind: "file", data: new Uint8Array([1, 2, 3]), mediaType: "image/png", filename: "result.png" },
        { kind: "file", data: new Uint8Array([4, 5, 6]), mediaType: "text/csv", filename: "result.csv" },
        { kind: "text", text: "End of first result" },
      ] },
      { kind: "result", callId: "second", name: "lookup", error: false, parts: [{ kind: "text", text: "Second result" }] },
      { kind: "output", adapter: modelProtocol(current.settings.provider.protocol).continuationFormat, scope: modelScope(current.settings),
        parts: [{ kind: "text", text: "Following answer", continuation: null }] },
    );
    return current;
  }

  it("Chat sends tool attachments as structured wire parts without a compatibility pack", async () => {
    const { messages } = await request(chatToolFiles());
    expect((messages as unknown[]).slice(-3)).toEqual([
      { role: "tool", tool_call_id: "call", content: [
        { type: "text", text: "First result" },
        { type: "image_url", image_url: { url: "data:image/png;base64,AQID" } },
        { type: "file", file: { filename: "result.csv", file_data: "data:text/csv;base64,BAUG" } },
        { type: "text", text: "End of first result" },
      ] },
      { role: "tool", tool_call_id: "second", content: "Second result" },
      { role: "assistant", content: "Following answer" },
    ]);
  });

  it.each(["provider", "model"] as const)("Chat moves tool attachments after the result batch with an explicit %s pack", async layer => {
    const current = chatToolFiles();
    current.settings[layer].compatibility = [{ id: "toolFilesAsUserMessage" }];
    const { messages } = await request(current);
    expect((messages as unknown[]).slice(-4)).toEqual([
      { role: "tool", tool_call_id: "call", content: "First result\nEnd of first result\n[2 file(s) attached in the following user message: result.png, result.csv]" },
      { role: "tool", tool_call_id: "second", content: "Second result" },
      { role: "user", content: [
        { type: "text", text: "Files attached from the preceding tool results:" },
        { type: "image_url", image_url: { url: "data:image/png;base64,AQID" } },
        { type: "file", file: { filename: "result.csv", file_data: "data:text/csv;base64,BAUG" } },
      ] },
      { role: "assistant", content: "Following answer" },
    ]);
  });

  it("Chat sends a standalone generic user file rather than an SDK placeholder or an error", async () => {
    const current = input("openai-chat");
    current.messages.push({ kind: "input", parts: [{ kind: "file", filename: "report.csv", mediaType: "text/csv", data: Uint8Array.of(42) }] });
    const { messages } = await request(current);
    expect((messages as unknown[]).at(-1)).toEqual({ role: "user", content: [
      { type: "file", file: { filename: "report.csv", file_data: "data:text/csv;base64,Kg==" } },
    ] });
  });

  it("Messages encodes generic user and tool files without dropping them from the combined user block", async () => {
    const current = chatToolFiles();
    current.settings.provider.protocol = "anthropic";
    current.messages.splice(-1, 0, { kind: "input", parts: [
      { kind: "file", filename: "report.csv", mediaType: "text/csv", data: Uint8Array.of(42) },
      { kind: "text", text: "Use both files" },
    ] });
    const { messages } = await request(current);
    expect((messages as unknown[]).at(-2)).toMatchObject({ role: "user", content: [
      { type: "tool_result", tool_use_id: "call", content: [
        { type: "text", text: "First result" },
        { type: "image", source: { type: "base64", media_type: "image/png", data: "AQID" } },
        { type: "document", source: { type: "base64", media_type: "text/csv", data: "BAUG" }, title: "result.csv" },
        { type: "text", text: "End of first result" },
      ] },
      { type: "tool_result", tool_use_id: "second", content: "Second result" },
      { type: "document", source: { type: "base64", media_type: "text/csv", data: "Kg==" }, title: "report.csv" },
      { type: "text", text: "Use both files" },
    ] });
  });

  it("Chat surfaces the endpoint's rejection of tool attachment parts", async () => {
    const adapter = new AiSdkAdapter(async () => null, undefined, async () => Response.json({
      error: { message: "Only text is accepted in tool messages" },
    }, { status: 400 }));
    const stream = adapter.prepare(chatToolFiles()).stream(new AbortController().signal);
    await expect((async () => { for await (const _event of stream) { /* Consume the provider error. */ } })())
      .rejects.toMatchObject({ origin: "model", code: "provider_error", message: "Only text is accepted in tool messages", details: { httpStatus: 400 } });
  });
});
