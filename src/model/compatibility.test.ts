import { describe, expect, it } from "vitest";
import { generateText } from "ai";
import { z } from "zod";
import { thinkingLevels } from "@asterism-app/sdk/contracts";
import { AiSdkAdapter, sdkMessages } from "./ai-sdk.ts";
import { createProviderModel } from "./provider.ts";
import { aiSdkAdapterVersion } from "./continuation.ts";
import { modelScope, type Json } from "../shared/model.ts";
import { projectSystemPrompt } from "./system-prompt.ts";

import type { ModelInput } from "./contract.ts";
import { mergeModelCompatibility, modelCompatibilityDefinition, modelCompatibilitySchema, type ModelCompatibility } from "../shared/model-compatibility.ts";
import { requestOptions } from "./request-options.ts";
import { configurationField } from "../shared/configuration-fields.ts";

function input(protocol: ModelInput["settings"]["provider"]["protocol"] = "openai-responses"): ModelInput {
  return {
    settings: {
      provider: { id: "p", name: "Test", protocol, baseUrl: "https://example.invalid/v1", enabled: true, auth: "none", compatibility: [] },
      model: { providerId: "p", modelId: "test", name: "Test", enabled: true, contextWindow: null, cost: null,
        capabilities: { reasoning: true, thinkingLevels: [...thinkingLevels], tools: true },
        generation: { temperature: null, topP: null, maxOutputTokens: 4096 }, compatibility: [] }, thinking: "low",
    },
    system: { blocks: [{ id: "system", kind: "system", from: "test", text: "System instruction" }] },
    messages: [{ kind: "input", parts: [{ kind: "text", text: "Question" }] }], tools: [],
  };
}

// Use the real SDK streaming interface and replace only transport; capture final HTTP bodies instead of checking intermediate options alone.
async function request(value: ModelInput, inspectHeaders?: (headers: Headers) => void): Promise<Record<string, unknown>> {
  let body: Record<string, unknown> | undefined;
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
  const transport: typeof fetch = async (_url, init) => {
    body = JSON.parse(String(init?.body));
    inspectHeaders?.(new Headers(init?.headers));
    return new Response(frames.map(frame => `data: ${JSON.stringify(frame)}\n\n`).join(""), { headers: { "content-type": "text/event-stream" } });
  };
  const adapter = new AiSdkAdapter(async () => "unused", (current, key) => createProviderModel(current.settings.provider, current.settings.model, key, transport, current));
  for await (const _event of adapter.prepare(value).stream(new AbortController().signal)) { /* Consume the complete stream; serialization errors cannot be ignored. */ }
  return body!;
}

describe("Reasoning level and budget mappings", () => {
  // Mapping packages accept standard levels only; budgets are absolute token counts and off must not encode as a zero budget.
  it("level and budget mappings validate sparse values and forms distinguish default, null, and custom values", () => {
    const levels = modelCompatibilityDefinition("customThinkingLevels")!;
    const budgets = modelCompatibilityDefinition("customThinkingBudgets")!;
    expect(modelCompatibilitySchema.parse([
      { id: levels.id, value: { low: " upstream-low ", high: null } },
      { id: budgets.id, value: { high: 16384 } },
    ])).toEqual([
      { id: levels.id, value: { low: "upstream-low", high: null } },
      { id: budgets.id, value: { high: 16384 } },
    ]);
    for (const value of [{ high: "" }, { high: 1024 }, { ultra: "ultra" }])
      expect(levels.schema.safeParse(value).success).toBe(false);
    for (const value of [{ off: 0 }, { high: 1023 }, { high: 1024.5 }, { high: null }, { high: Number.MAX_SAFE_INTEGER + 1 }])
      expect(budgets.schema.safeParse(value).success).toBe(false);
    const levelsForm = z.toJSONSchema(levels.schema, { io: "input" });
    const budgetsForm = z.toJSONSchema(budgets.schema, { io: "input" });
    expect(configurationField(levelsForm.properties!.high as Json).kind).toBe("nullable-string");
    expect(configurationField(budgetsForm.properties!.high as Json).kind).toBe("integer");
  });

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

  // Anthropic manual budgets work without compatibility packages; the output limit includes reasoning and cannot be expanded by the SDK.
  it("Anthropic default budgets use the final output limit and budget packages override only specified levels", async () => {
    const current = input("anthropic");
    current.settings.model.modelId = "claude-sonnet-4-5";
    current.settings.model.generation.maxOutputTokens = 20000;
    current.maxOutputTokens = 10000;
    current.settings.thinking = "medium";
    expect(await request(current)).toMatchObject({ thinking: { type: "enabled", budget_tokens: 3000 }, max_tokens: 10000 });
    current.settings.provider.compatibility = [{ id: "customThinkingBudgets", value: { medium: 5000, low: 2048 } }];
    expect(await request(current)).toMatchObject({ thinking: { type: "enabled", budget_tokens: 5000 }, max_tokens: 10000 });
    current.settings.model.compatibility = [{ id: "customThinkingBudgets", value: { high: 6000 } }];
    expect(await request(current)).toMatchObject({ thinking: { type: "enabled", budget_tokens: 3000 }, max_tokens: 10000 });
    current.settings.thinking = "low";
    expect(await request(current)).toMatchObject({ thinking: { type: "enabled", budget_tokens: 1024 }, max_tokens: 10000 });
    current.settings.model.compatibility = [];
    expect(await request(current)).toMatchObject({ thinking: { type: "enabled", budget_tokens: 2048 }, max_tokens: 10000 });
  });

  // With both mappings present, effort names do not affect token calculations; budget packages cannot force adaptive models into manual budgeting.
  it("Anthropic mode is independent of both mappings and the SDK does not downgrade off to low reasoning", async () => {
    const current = input("anthropic");
    current.settings.model.generation.maxOutputTokens = 20000;
    current.settings.provider.compatibility = [
      { id: "customThinkingLevels", value: { low: "custom-low" } },
      { id: "customThinkingBudgets", value: { low: 4096 } },
    ];
    const manual = await request(current);
    expect(manual).toMatchObject({ thinking: { type: "enabled", budget_tokens: 4096 }, output_config: { effort: "custom-low" } });
    current.settings.model.modelId = "claude-opus-4-7";
    const adaptive = await request(current);
    expect(adaptive.thinking).toMatchObject({ type: "adaptive" });
    expect(adaptive.thinking).not.toHaveProperty("budget_tokens");
    expect(adaptive.output_config).toMatchObject({ effort: "custom-low" });
    current.settings.model.capabilities.thinkingLevels = ["low"];
    current.settings.thinking = "off";
    const disabled = await request(current);
    expect(disabled.thinking).toEqual({ type: "disabled" });
    expect(disabled.output_config).toBeUndefined();
  });

  // For unknown models the SDK adds the default output limit and budget, and separately truncates known models; neither defines the host default budget base.
  it("manual budgets without output limits use a fixed total cap of 4096 without SDK or level expansion", async () => {
    const current = input("anthropic");
    current.settings.model.generation.maxOutputTokens = null;
    for (const modelId of ["test", "claude-sonnet-4-5"]) {
      current.settings.model.modelId = modelId;
      current.settings.thinking = "low";
      expect(await request(current)).toMatchObject({ max_tokens: 4096, thinking: { type: "enabled", budget_tokens: 1024 } });
      current.settings.thinking = "max";
      expect(await request(current)).toMatchObject({ max_tokens: 4096, thinking: { type: "enabled", budget_tokens: 3891 } });
    }
  });

  // Reject excessive budgets before HTTP transmission and retain explicit host errors rather than misleading network errors.
  it.each([{ limit: 8192, budget: 8192 }, { limit: 1000, budget: undefined }])(
    "rejects sending when the Anthropic budget cannot fit output limit $limit", async ({ limit, budget }) => {
      const current = input("anthropic");
      current.settings.model.generation.maxOutputTokens = limit;
      if (budget !== undefined) current.settings.model.compatibility = [{ id: "customThinkingBudgets", value: { low: budget } }];
      let sent = false;
      await expect(request(current, () => { sent = true; })).rejects.toMatchObject({ code: "thinking_budget_unavailable" });
      expect(sent).toBe(false);
    });

  // Streaming and non-streaming SDK calls share the budget contract; minimal connection probes do not enable reasoning.
  it("non-streaming execution uses the same budget mapping while connection tests do not consume mappings", async () => {
    const current = input("anthropic");
    current.settings.model.generation.maxOutputTokens = 10000;
    current.settings.model.compatibility = [{ id: "customThinkingBudgets", value: { low: 2048 } }];
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
    expect(bodies[0]).toMatchObject({ thinking: { type: "enabled", budget_tokens: 2048 }, max_tokens: 10000 });
    expect(bodies[1]).not.toHaveProperty("thinking");
    expect(bodies[1]).toMatchObject({ max_tokens: 128 });
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
    current.messages = [{ kind: "output", adapter: aiSdkAdapterVersion, scope: modelScope(current.settings), parts: [
      { kind: "thinking", text: "Plain", summary: "Summary", continuation: null },
      { kind: "thinking", text: "", summary: "Summary only", continuation: null },
      { kind: "thinking", text: "Visible full text", summary: "Opaque summary",
        continuation: { openai: { itemId: "rs_native", reasoningEncryptedContent: "cipher" } } },
      { kind: "thinking", text: "", summary: "", continuation: { openai: { reasoningEncryptedContent: "cipher-only" } } },
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

  // Messages signatures must match original text; unsigned text encodes unchanged, summaries are not disguised as thinking, and redacted-only blocks continue normally.
  it("Messages natively supports unsigned plaintext, signatures, and redacted reasoning while preserving relative tool order", async () => {
    const current = input("anthropic");
    current.messages = [{ kind: "output", adapter: aiSdkAdapterVersion, scope: modelScope(current.settings), parts: [
      { kind: "thinking", text: "  Signed\n", summary: "Display only", continuation: { anthropic: { signature: "signed" } } },
      { kind: "thinking", text: "", summary: "", continuation: { anthropic: { signature: "empty-signed" } } },
      { kind: "toolcall", callId: "call", name: "read", arguments: {}, continuation: null },
      { kind: "thinking", text: "Unsigned", summary: "", continuation: null },
      { kind: "thinking", text: "", summary: "Not a full thought", continuation: null },
      { kind: "thinking", text: "", summary: "", continuation: { anthropic: { redactedData: "opaque" } } },
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
    current.messages = [{ kind: "output", adapter: aiSdkAdapterVersion, scope: modelScope(current.settings), parts: [
      { kind: "thinking", text: "  Thought\n", summary: "", continuation: { anthropic: { signature: "signed" } } },
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

  // Plaintext reasoning must retain its position without being dropped by the SDK or disrupting adjacent images, tool pairing, or assistant text.
  it("plaintext reasoning requires no compatibility package, inserts in original order, and uses only public text across origins", async () => {
    const current = input();
    current.settings.model.compatibility = [{ id: "systemMessageInMessages" }];
    const foreign = { adapter: "foreign-adapter", scope: "foreign-scope" };
    current.messages = [
      { kind: "input", parts: [{ kind: "text", text: "Look" }, { kind: "file", data: new Uint8Array([1, 2, 3]), mediaType: "image/png" }] },
      { kind: "output", ...foreign, parts: [
        { kind: "thinking", summary: "", text: "Before tool", continuation: { anthropic: { signature: "foreign-signature" } } },
        { kind: "text", text: "Checking", continuation: { openai: { itemId: "foreign-item" } } },
        { kind: "toolcall", callId: "vendor/call.with.dots", name: "lookup", arguments: { query: "value" }, continuation: null },
      ] },
      { kind: "result", callId: "vendor/call.with.dots", name: "lookup", error: false, parts: [{ kind: "text", text: "Found" }] },
      { kind: "output", ...foreign, parts: [
        { kind: "thinking", summary: "", text: "After tool", continuation: { openai: { reasoningEncryptedContent: "foreign-ciphertext" } } },
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
    const native: Json = protocol === "anthropic" ? { anthropic: { signature: "native-token" } }
      : { openai: { itemId: "rs_native", reasoningEncryptedContent: "native-token" } };
    current.messages.push({ kind: "output", adapter: aiSdkAdapterVersion, scope: modelScope(current.settings), parts: [
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
    const foreign: Json = other.settings.provider.protocol === "anthropic" ? { anthropic: { signature: "foreign-token" } }
      : { openai: { itemId: "rs_foreign", reasoningEncryptedContent: "foreign-token" } };
    resumed.messages.push({ kind: "output", adapter: aiSdkAdapterVersion, scope: modelScope(other.settings), parts: [
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
        { kind: "toolcall", callId: "same_id", name: "lookup", arguments: {}, continuation: null },
      ] },
      { kind: "result", callId: "same_id", name: "lookup", error: false, parts: [{ kind: "text", text: "Foreign result" }] },
      { kind: "output", adapter: aiSdkAdapterVersion, scope: modelScope(current.settings), parts: [
        { kind: "toolcall", callId: "same_id", name: "lookup", arguments: {}, continuation: null },
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

  // Moving files can change only their representation position, never place them after subsequent historical messages.
  it("Chat attachments immediately follow the tool result batch before the next historical message", () => {
    const current = input("openai-chat");
    current.settings.model.compatibility = [{ id: "toolFilesAsUserMessage" }];
    current.messages = [
      { kind: "result", callId: "call", name: "lookup", error: false,
        parts: [{ kind: "file", data: new Uint8Array([1]), mediaType: "image/png", filename: "result.png" }] },
      { kind: "result", callId: "second", name: "lookup", error: false, parts: [{ kind: "text", text: "Another result" }] },
      { kind: "output", adapter: aiSdkAdapterVersion, scope: modelScope(current.settings),
        parts: [{ kind: "text", text: "Following answer", continuation: null }] },
    ];
    const messages = sdkMessages(current);
    expect(messages.map(message => message.role)).toEqual(["tool", "user", "assistant"]);
    expect(messages[0]?.content).toHaveLength(2);
    expect(messages[1]).toMatchObject({ content: [{ type: "text" }, { type: "file", filename: "result.png" }] });
    expect(messages[2]).toMatchObject({ content: [{ type: "text", text: "Following answer" }] });
  });

  // References before submission and bytes in actual requests share one protocol gate; files cannot be moved silently.
  it("Chat rejects tool files without a tool-file tag in validate and prepare", () => {
    const current = input("openai-chat");
    const adapter = new AiSdkAdapter(async () => { throw new Error("Must fail before reading credentials"); });
    const saved = { ...current, messages: [{ kind: "result" as const, callId: "call", name: "lookup", outcome: {
      kind: "succeeded" as const, data: null, model: [{ kind: "file" as const, file: { "$asterism.content": "c4b22b60-ae71-4e92-9823-2223b48a8327" }, mediaType: "image/png" }],
    } }] };
    expect(() => adapter.validate(saved)).toThrow("Tool files in a user message");
    current.messages = [{ kind: "result", callId: "call", name: "lookup", error: false,
      parts: [{ kind: "file", data: new Uint8Array([1]), mediaType: "image/png" }] }];
    expect(() => adapter.prepare(current)).toThrow("Tool files in a user message");
    current.settings.provider.compatibility = [{ id: "toolFilesAsUserMessage" }];
    expect(() => adapter.validate({ ...saved, settings: current.settings })).not.toThrow();
    expect(() => adapter.prepare(current)).not.toThrow();
  });
});
