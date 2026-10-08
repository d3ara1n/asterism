import { describe, expect, it } from "vitest";
import { MockLanguageModelV4, simulateReadableStream } from "ai/test";
import { AiSdkAdapter, sdkMessages } from "./ai-sdk.ts";
import { modelScope } from "../shared/conversation.ts";
import type { ModelInput, ModelEvent } from "./contract.ts";
import { createProviderModel } from "./provider.ts";
import { composeSystemPrompt, projectSystemPrompt } from "./system-prompt.ts";

const input: ModelInput = {
  settings: { provider: { id: "p", revision: 1, name: "Provider", enabled: true, baseUrl: "https://example.invalid", protocol: "anthropic", auth: "api_key" },
    model: { id: "m", revision: 1, name: "Model", modelId: "test", providerId: "p", enabled: true, contextWindow: null,
      capabilities: { reasoning: true, tools: true, images: false }, generation: { temperature: 0.2, topP: null, maxOutputTokens: 1000 } }, thinking: "low" },
  system: composeSystemPrompt({ id: "worker", systemPrompt: "System" }), messages: [{ kind: "input", text: "Read" }],
  tools: [{ name: "read", description: "Read", parameters: { type: "object", properties: { resource_id: { type: "string" } }, required: ["resource_id"] } }],
};

describe("AI SDK 适配契约", () => {
  it.each(["openai-chat", "openai-responses", "anthropic"] as const)("合成 %s 协议流通过真实 provider 解码，无鉴权头且禁止重定向", async protocol => {
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
      return new Response(frames.map(frame => `data: ${JSON.stringify(frame)}\n\n`).join("") + (protocol === "openai-chat" ? "data: [DONE]\n\n" : ""), { headers: { "content-type": "text/event-stream" } });
    };
    const current = structuredClone(input);
    current.settings.provider.protocol = protocol; current.settings.provider.auth = "none"; current.settings.thinking = "off";
    current.settings.model.capabilities.reasoning = false;
    const adapter = new AiSdkAdapter(async () => { throw new Error("Anonymous execution must not read credentials"); },
      (value, key) => createProviderModel(value.settings.provider, value.settings.model, key, transport));
    const events: ModelEvent[] = [];
    for await (const event of adapter.prepare(current).stream(new AbortController().signal)) events.push(event);
    expect(sent).toBe(1);
    expect(events.find(e => e.type === "part.delta")).toMatchObject({ delta: "Hello" });
    expect(events.at(-1)).toMatchObject({ type: "finish", reason: "stop", usage: { input: 3, output: 1, total: 4 } });
  });

  it("明文远程鉴权在准备请求时拒绝，凭据不被读取", () => {
    const current = structuredClone(input); current.settings.provider.baseUrl = "http://example.invalid/v1";
    const adapter = new AiSdkAdapter(async () => { throw new Error("Must not read credentials"); });
    expect(() => adapter.prepare(current)).toThrow("require HTTPS");
  });

  it("未知工具的完整调用传给执行层，SDK 不代为执行或把它变成流失败", async () => {
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

  it("单次流保留思考签名和工具参数，计量按响应收束，后续按 assistant/tool 投影", async () => {
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
    expect(prepared).not.toHaveProperty("input");
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
    const next = sdkMessages({ ...input, messages: [...input.messages, { kind: "output", parts: [], replay: end.replay, scope: modelScope(input.settings), adapter: adapter.version },
      { kind: "result", callId: "call-1", name: "read", outcome: { kind: "succeeded", model: "Note text", data: { userOnly: "detail" } } }] });
    expect(next.map(m => m.role)).toEqual(["user", "assistant", "tool"]);
    expect(JSON.stringify(next)).toContain("signature-value"); expect(JSON.stringify(next)).not.toContain("userOnly");
  });

  it("provider 错误脱敏且不自动重试；跨模型续接明确拒绝", async () => {
    const model = new MockLanguageModelV4({ doStream: async () => { throw new Error("secret-provider-header"); } });
    const adapter = new AiSdkAdapter(async () => "credential", () => model);
    await expect((async () => { for await (const _event of adapter.prepare(input).stream(new AbortController().signal)) { /* 消费流 */ } })()).rejects.toThrow("provider request failed");
    expect(model.doStreamCalls).toHaveLength(1);
    expect(() => sdkMessages({ ...input, messages: [{ kind: "output", parts: [], replay: {}, scope: "different-provider", adapter: adapter.version }] })).toThrow("Cross-model");
  });
});
