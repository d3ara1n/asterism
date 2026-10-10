import { describe, expect, it } from "vitest";
import { MockLanguageModelV4, simulateReadableStream } from "ai/test";
import { AiSdkAdapter, sdkMessages } from "./ai-sdk.ts";
import { modelScope } from "../shared/model.ts";
import type { ModelInput, ModelEvent } from "./contract.ts";
import { createProviderModel } from "./provider.ts";
import { composeSystemPrompt, projectSystemPrompt } from "./system-prompt.ts";
import { ResponseBuffer } from "../execution/response.ts";
import type { NewNode } from "../shared/session.ts";

const input: ModelInput = {
  settings: { provider: { id: "p", revision: 1, name: "Provider", enabled: true, baseUrl: "https://example.invalid", protocol: "anthropic", auth: "api_key" },
    model: { id: "m", revision: 1, name: "Model", modelId: "test", providerId: "p", enabled: true, contextWindow: null,
      capabilities: { reasoning: true, tools: true, images: false }, generation: { temperature: 0.2, topP: null, maxOutputTokens: 1000 } }, thinking: "low" },
  system: composeSystemPrompt({ id: "worker", systemPrompt: "System" }), messages: [{ kind: "input", text: "Read" }],
  tools: [{ name: "read", description: "Read", parameters: { type: "object", properties: { resource_id: { type: "string" } }, required: ["resource_id"] } }],
};

describe("AI SDK 适配契约", () => {
  it.each([
    { modelId: "o3", thinking: null }, { modelId: "o3", thinking: "low" }, { modelId: "o3", thinking: "off" },
    { modelId: "deepseek-flash", thinking: null }, { modelId: "deepseek-flash", thinking: "medium" }, { modelId: "deepseek-flash", thinking: "off" },
  ] as const)("Responses $modelId 思考等级 $thinking 的摘要请求与可见正文解码", async ({ modelId, thinking }) => {
    const current = structuredClone(input);
    current.settings.provider.protocol = "openai-responses";
    current.settings.model.modelId = modelId;
    current.settings.model.generation.temperature = null;
    current.settings.thinking = thinking;
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
    // 摘要是可见内容；加密推理只供后续请求续接，两者需分别请求和保留。
    if (thinking === "off") expect(request?.reasoning).not.toHaveProperty("summary");
    else expect(request?.reasoning).toMatchObject({ summary: "auto" });
    if (thinking !== null) expect(request?.reasoning).toMatchObject({ effort: thinking === "off" ? "none" : thinking });
    expect(request).toMatchObject({ store: false, include: ["reasoning.encrypted_content"] });
    expect(events.find(event => event.type === "part.delta")).toMatchObject({ partId: "thinking:reasoning-1:0", delta: "Visible summary" });
    expect(events.find(event => event.type === "part.end")).toMatchObject({
      continuation: { openai: { itemId: "reasoning-1", reasoningEncryptedContent: "encrypted-continuation" } },
    });
  });

  it("DeepSeek Responses 的 reasoning_text 增量进入即时与保存正文，续接使用受支持的纯文本", async () => {
    const current = structuredClone(input);
    current.settings.provider.protocol = "openai-responses";
    current.settings.provider.baseUrl = "https://api.deepseek.com";
    current.settings.model.modelId = "deepseek-flash";
    current.settings.thinking = "medium";
    current.settings.model.generation.temperature = null;
    const response = { id: "response-plain", model: "deepseek-flash", created_at: 0 };
    // DeepSeek 官方 Responses 示例使用 reasoning_text；summary 为空，不产生摘要事件。
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
    const nodes: NewNode[] = [];
    const buffer = new ResponseBuffer({ agentId: "a", responseId: "r", requestParentId: null, model: "p/m:medium",
      adapter: adapter.version, scope: modelScope(current.settings) },
      node => { nodes.push(node); return `block-${nodes.length}`; }, () => {});
    const liveText: string[] = [];
    for await (const event of adapter.prepare(current).stream(new AbortController().signal)) {
      buffer.accept(event);
      if (event.type === "part.delta") {
        const live = buffer.live()[0];
        if (live?.kind === "thinking") liveText.push(live.text);
      }
    }
    buffer.close();
    expect(liveText).toEqual(["Assess ", "Assess the plan."]);
    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({ kind: "thinking", text: "Assess the plan.", complete: true });
    const thought = nodes[0];
    if (thought?.kind !== "thinking") throw new Error("Missing saved thinking.");
    const next: ModelInput = { ...current, messages: [...current.messages, {
      kind: "output", adapter: adapter.version, scope: modelScope(current.settings),
      parts: [{ kind: "thinking", text: thought.text, continuation: thought.continuation }, { kind: "text", text: "Answer", continuation: null }],
    }] };
    for await (const _event of adapter.prepare(next).stream(new AbortController().signal)) { /* 检查实际序列化请求。 */ }
    expect(requests[0]?.reasoning).toMatchObject({ effort: "medium" });
    expect((requests[0]?.input as Array<{ role?: string }>)[0]?.role).toBe("system");
    const replay = requests[1]?.input as Array<{ type?: string; role?: string; content?: unknown }>;
    const assistant = replay.filter(item => item.role === "assistant");
    expect(JSON.stringify(assistant)).toContain("Assess the plan.");
    expect(JSON.stringify(assistant)).toContain("Answer");
    expect(replay.some(item => item.type === "reasoning")).toBe(false);
  });

  it("真实 Anthropic 解码保留 start 的 redactedData 与 delta 的签名", async () => {
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
    for await (const event of adapter.prepare(input).stream(new AbortController().signal)) events.push(event);
    expect(events.find(event => event.type === "part.delta")).toMatchObject({ partId: "thinking:0", delta: "Reasoning" });
    expect(events.filter(event => event.type === "part.end")).toEqual([
      expect.objectContaining({ continuation: { anthropic: { signature: "signed-thinking" } } }),
      expect.objectContaining({ continuation: { anthropic: { redactedData: "redacted-thinking" } } }),
    ]);
  });

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
    const thinking = events.find(e => e.type === "part.end" && e.partId === "thinking:r");
    if (thinking?.type !== "part.end") throw new Error("Missing thinking completion.");
    const next = sdkMessages({ ...input, messages: [...input.messages, { kind: "output", parts: [{ kind: "thinking", text: "Think", continuation: thinking.continuation ?? null }, { kind: "toolcall", callId: "call-1", name: "read", arguments: { resource_id: "note" }, continuation: null }], scope: modelScope(input.settings), adapter: adapter.version },
      { kind: "result", callId: "call-1", name: "read", outcome: { kind: "succeeded", model: "Note text", data: { userOnly: "detail" } } }] });
    expect(next.map(m => m.role)).toEqual(["user", "assistant", "tool"]);
    expect(JSON.stringify(next)).toContain("signature-value"); expect(JSON.stringify(next)).not.toContain("userOnly");
  });

  it("失败工具也只发送保存的模型投影，不泄漏界面产出、资源名称或执行元数据", () => {
    const model = { kind: "cancelled", data: "Captured output", message: "Stopped." };
    const messages = sdkMessages({ ...input, messages: [{ kind: "result", callId: "cancelled", name: "resource_call",
      outcome: { kind: "cancelled", message: "Stopped.", data: { privateView: "GUI details" }, model,
        implementation: { id: "test.hidden", version: 1 }, resource: { id: "r", kind: "directory", title: "GUI title" }, startedAt: 10, finishedAt: 20 } }] });
    expect(messages).toEqual([{ role: "tool", content: [{ type: "tool-result", toolCallId: "cancelled", toolName: "resource_call",
      output: { type: "error-json", value: model } }] }]);
  });

  it("provider 错误脱敏且不自动重试；跨模型续接明确拒绝", async () => {
    const model = new MockLanguageModelV4({ doStream: async () => { throw new Error("secret-provider-header"); } });
    const adapter = new AiSdkAdapter(async () => "credential", () => model);
    await expect((async () => { for await (const _event of adapter.prepare(input).stream(new AbortController().signal)) { /* 消费流 */ } })()).rejects.toThrow("provider request failed");
    expect(model.doStreamCalls).toHaveLength(1);
    expect(() => sdkMessages({ ...input, messages: [{ kind: "output", parts: [], scope: "different-provider", adapter: adapter.version }] })).toThrow("Cross-model");
  });
});
