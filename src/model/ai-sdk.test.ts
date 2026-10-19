import { thinkingLevels } from "@atelier/sdk/contracts";
import { describe, expect, it, vi } from "vitest";
import { setImmediate } from "node:timers/promises";
import { MockLanguageModelV4, simulateReadableStream } from "ai/test";
import { AiSdkAdapter, sdkMessages } from "./ai-sdk.ts";
import { modelScope } from "../shared/model.ts";
import { ModelFailure, type ModelInput, type ModelEvent } from "./contract.ts";
import { createProviderModel } from "./provider.ts";
import { projectSystemPrompt } from "./system-prompt.ts";
import { composeSystemPrompt } from "@atelier/builtin/runtime";

const input: ModelInput = {
  settings: { provider: { id: "p", revision: 1, name: "Provider", enabled: true, baseUrl: "https://example.invalid", protocol: "anthropic", auth: "api_key", compatibility: [] },
    model: { revision: 1, name: "Model", modelId: "test", providerId: "p", enabled: true, contextWindow: null, cost: null, compatibility: [],
      capabilities: { reasoning: true, tools: true, thinkingLevels: [...thinkingLevels] }, generation: { temperature: 0.2, topP: null, maxOutputTokens: 1000 } }, thinking: "low" },
  system: composeSystemPrompt({ id: "worker", systemPrompt: "System" }, "Atelier"), messages: [{ kind: "input", parts: [{ kind: "text", text: "Read" }] }],
  tools: [{ name: "read", description: "Read", parameters: { type: "object", properties: { resource_id: { type: "string" } }, required: ["resource_id"] } }],
};

describe("AI SDK 适配契约", () => {
  // 模型终态是请求边界：客户端暂停消费与连接延后关闭不延长耗时；终态之后取消也不能丢失已实报用量。
  it.each(["close", "cancel"] as const)("消费者等待和终态之后的 %s 不改变已接收的计量", async action => {
    let now = 0;
    const clock = vi.spyOn(performance, "now").mockImplementation(() => now);
    const controller = new AbortController();
    let close!: () => void;
    let drained!: () => void;
    const received = new Promise<void>(resolve => { drained = resolve; });
    const model = new MockLanguageModelV4({ doStream: async () => {
      now = 10;
      return { stream: new ReadableStream({
        start(stream) {
          close = () => stream.close();
          stream.enqueue({ type: "stream-start", warnings: [] });
          stream.enqueue({ type: "text-start", id: "t" });
          for (let i = 0; i < 32; i++) stream.enqueue({ type: "text-delta", id: "t", delta: "word " });
          stream.enqueue({ type: "text-end", id: "t" });
          stream.enqueue({ type: "finish", finishReason: { unified: "stop", raw: "stop" },
            usage: { inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
              outputTokens: { total: 32, text: 32, reasoning: 0 } } });
        },
        pull() { drained(); },
      }) };
    } });
    const events: ModelEvent[] = [];
    let failure: unknown, paused = false;
    try {
      const adapter = new AiSdkAdapter(async () => "synthetic-key", () => model);
      try {
        for await (const event of adapter.prepare(input).stream(controller.signal)) {
          events.push(event);
          if (event.type === "part.delta" && !paused) {
            paused = true;
            await received;
            await setImmediate();
            now = 1000;
            if (action === "cancel") controller.abort();
            close();
          }
        }
      } catch (error) { failure = error; }
      expect(events.at(-1)).toMatchObject({ type: "finish", usage: { input: 10, output: 32, total: 42 },
        timing: { durationMs: 10, firstOutputMs: 10, firstTextMs: 10, lastOutputMs: 10, outputChunks: 32, outcome: "completed" } });
      if (action === "cancel") expect(failure).toBeInstanceOf(ModelFailure);
      else expect(failure).toBeUndefined();
    } finally { controller.abort(); clock.mockRestore(); }
  });
  // docs/runtime.md#请求诊断：实际适配流在失败/取消时仍交付计时，不把空流或错误当成零 token 成功。
  it.each(["failed", "cancelled"] as const)("保留%s流的计时", async outcome => {
    const controller = new AbortController();
    const model = new MockLanguageModelV4({ doStream: async () => {
      if (outcome === "cancelled") controller.abort();
      throw new Error("Synthetic transport failure");
    } });
    const adapter = new AiSdkAdapter(async () => "synthetic-key", () => model);
    let failure: unknown;
    try {
      for await (const _event of adapter.prepare(input).stream(controller.signal)) { /* 消费流。 */ }
    } catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(ModelFailure);
    expect((failure as ModelFailure).diagnostics?.timing).toMatchObject({
      outcome, durationMs: expect.any(Number), firstOutputMs: null, firstTextMs: null, outputChunks: 0,
    });
  });
  // SDK stream 的调用方上限须抵达 provider，且不得扩大用户配置的输出上限。
  it.each([{ requested: 400, expected: 400 }, { requested: 2000, expected: 1000 }])(
    "单次补全输出上限 $requested 与模型配置取较小值", async ({ requested, expected }) => {
      const model = new MockLanguageModelV4({ doStream: async () => ({ stream: simulateReadableStream({
        initialDelayInMs: null, chunkDelayInMs: null, chunks: [
          { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage: {
            inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
            outputTokens: { total: 1, text: 1, reasoning: undefined },
          } },
        ],
      }) }) });
      const adapter = new AiSdkAdapter(async () => "synthetic-key", () => model);
      for await (const _event of adapter.prepare({ ...input, maxOutputTokens: requested }).stream(new AbortController().signal)) { /* 消费终态。 */ }
      expect(model.doStreamCalls[0]!.maxOutputTokens).toBe(expected);
      expect(() => adapter.prepare({ ...input, maxOutputTokens: 0 })).toThrow("positive safe integer");
    });
  it.each([
    { modelId: "o3", thinking: "low", reasoning: true },
    { modelId: "deepseek-flash", thinking: "off", reasoning: true },
    { modelId: "o3", thinking: "high", reasoning: false },
    { modelId: "deepseek-flash", thinking: null, reasoning: false },
  ] as const)("Responses $modelId reasoning=$reasoning 等级=$thinking：开关控制请求，所有返回思考照常接收", async ({ modelId, thinking, reasoning }) => {
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
    // off 只是等级编码，false 才省略思考选项；两种情况下均接收服务端实际返回的思考。
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

  // 请求投影契约：开关不改历史；off 不删思考；过滤后不得发送空 assistant 或丢失工具调用。
  it("历史思考只受当前请求 reasoning 开关控制，重新开启可完整回传", () => {
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

  // 明文思考是协议基线；未知域名、空兼容列表也必须保存并原样回传。
  it("Responses 原始思考正常解码，无兼容包也能明文续接", async () => {
    const current = structuredClone(input);
    current.settings.provider.protocol = "openai-responses";
    current.settings.provider.baseUrl = "https://example.invalid/v1";
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
    const events: ModelEvent[] = [];
    for await (const event of adapter.prepare(current).stream(new AbortController().signal)) events.push(event);
    expect(events.filter(event => event.type === "part.delta").map(event => event.delta)).toEqual(["Assess ", "the plan."]);
    const thought = events.find(event => event.type === "part.end");
    if (thought?.type !== "part.end") throw new Error("Missing thinking completion.");
    const next: ModelInput = { ...current, messages: [...current.messages, {
      kind: "output", adapter: adapter.version, scope: modelScope(current.settings),
      parts: [{ kind: "thinking", summary: "", text: "Assess the plan.", continuation: thought.continuation ?? null }, { kind: "text", text: "Answer", continuation: null }],
    }] };
    for await (const _event of adapter.prepare(next).stream(new AbortController().signal)) { /* 检查实际序列化请求。 */ }
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

  // Responses summary 分段与全文可同时存在，SDK 摘要事件不能重复交付或提前结束整个 item。
  it("真实 Responses 解码保留全文、多个摘要段落及密文，只交付一个思考块", async () => {
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

  // 块不完整不等于终态不可用：执行状态机需要先保留服务端计量，再拒绝未闭合块。
  it("Responses 思考缺少 done 时仍交付已收到的 incomplete 终态与用量", async () => {
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
    const current = structuredClone(input);
    current.settings.model.generation.maxOutputTokens = 4096;
    for await (const event of adapter.prepare(current).stream(new AbortController().signal)) events.push(event);
    expect(events.find(event => event.type === "part.delta")).toMatchObject({ partId: "thinking:0", delta: "Reasoning" });
    expect(events.filter(event => event.type === "part.end")).toEqual([
      expect.objectContaining({ continuation: { anthropic: { signature: "signed-thinking" } } }),
      expect.objectContaining({ continuation: { anthropic: { redactedData: "redacted-thinking" } } }),
    ]);
  });

  it.each(["openai-chat", "openai-responses", "anthropic"] as const)("真实 %s provider 编码图文并解码流，无鉴权头且禁止重定向", async protocol => {
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

  it("明文远程鉴权在准备请求时拒绝，凭据不被读取", () => {
    const current = structuredClone(input); current.settings.provider.baseUrl = "http://example.invalid/v1";
    const adapter = new AiSdkAdapter(async () => { throw new Error("Must not read credentials"); });
    expect(() => adapter.prepare(current)).toThrow();
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
    const events: ModelEvent[] = [];
    for await (const event of prepared.stream(new AbortController().signal)) events.push(event);
    expect(model.doStreamCalls).toHaveLength(1);
    expect(model.doStreamCalls[0]).toMatchObject({ reasoning: "low", temperature: 0.2, maxOutputTokens: 1000 });
    expect(model.doStreamCalls[0]?.prompt[0]).toEqual({ role: "system", content: projectSystemPrompt(input.system) });
    expect(events.find(e => e.type === "part.end" && e.partId === "tool:call-1")).toMatchObject({ arguments: { resource_id: "note" } });
    const end = events.at(-1)!;
    expect(end).toMatchObject({ type: "finish", reason: "tool-calls", responseId: "response-1", rawFinishReason: "tool_use", usage: { input: 10, output: 5, total: 15, reasoning: 2, cacheRead: 2 } });
    expect(end).toMatchObject({ timing: {
      outcome: "completed", startedAt: expect.any(String), endedAt: expect.any(String),
      firstOutputMs: expect.any(Number), firstReasoningMs: expect.any(Number), lastOutputMs: expect.any(Number),
    } });
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

  it("失败工具只发送文字投影，文字不二次序列化", () => {
    const text = 'cancelled: Stopped.\n{"partial":"Captured output"}';
    const messages = sdkMessages({ ...input, messages: [{ kind: "result", callId: "cancelled", name: "resource_call", error: true, parts: [{ kind: "text", text }] }] });
    expect(messages).toEqual([{ role: "tool", content: [{ type: "tool-result", toolCallId: "cancelled", toolName: "resource_call",
      output: { type: "error-text", value: text } }] }]);
  });

  it.each(["anthropic", "openai-responses", "openai-chat"] as const)("%s 工具结果文件如实交出；Chat 显式兼容包才搬运到 user 消息", protocol => {
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

  it("provider 错误脱敏且不自动重试", async () => {
    const model = new MockLanguageModelV4({ doStream: async () => { throw new Error("secret-provider-header"); } });
    const adapter = new AiSdkAdapter(async () => "credential", () => model);
    let failure: unknown;
    try { for await (const _event of adapter.prepare(input).stream(new AbortController().signal)) { /* 消费流。 */ } }
    catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(Error);
    expect(String(failure)).not.toContain("secret-provider-header");
    expect(model.doStreamCalls).toHaveLength(1);
  });

  it("跨模型或适配版本变化不阻断公共正文，原生资料不跨来源发送", () => {
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
      { type: "reasoning", text: "Foreign thought", providerOptions: { atelier: { summary: "" } } },
      { type: "text", text: "Portable answer", providerOptions: {} },
    ] }]);
  });
});
