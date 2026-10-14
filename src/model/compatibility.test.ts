import { describe, expect, it } from "vitest";
import { thinkingLevels } from "@atelier/sdk/contracts";
import { AiSdkAdapter, sdkMessages } from "./ai-sdk.ts";
import { createProviderModel } from "./provider.ts";
import { aiSdkAdapterVersion } from "./continuation.ts";
import { modelScope, type Json } from "../shared/model.ts";
import { projectSystemPrompt } from "../modules/agent/system-prompt.ts";
import type { ModelInput } from "./contract.ts";
import { mergeModelCompatibility, type ModelCompatibility } from "../shared/model-compatibility.ts";

function input(protocol: ModelInput["settings"]["provider"]["protocol"] = "openai-responses"): ModelInput {
  return {
    settings: {
      provider: { id: "p", revision: 1, name: "Test", protocol, baseUrl: "https://example.invalid/v1", enabled: true, auth: "none", compatibility: [] },
      model: { providerId: "p", modelId: "test", name: "Test", revision: 1, enabled: true, contextWindow: null,
        capabilities: { reasoning: true, thinkingLevels: [...thinkingLevels], tools: true },
        generation: { temperature: null, topP: null, maxOutputTokens: 4096 }, compatibility: [] }, thinking: "low",
    },
    system: { blocks: [{ id: "system", kind: "system", from: "test", text: "System instruction" }] },
    messages: [{ kind: "input", parts: [{ kind: "text", text: "Question" }] }], tools: [],
  };
}

// 沿用真实 SDK 的流接口，只替换传输；捕获最终 HTTP 正文，避免只验证中间选项。
async function request(value: ModelInput): Promise<Record<string, unknown>> {
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
    return new Response(frames.map(frame => `data: ${JSON.stringify(frame)}\n\n`).join(""), { headers: { "content-type": "text/event-stream" } });
  };
  const adapter = new AiSdkAdapter(async () => "unused", (current, key) => createProviderModel(current.settings.provider, current.settings.model, key, transport));
  for await (const _event of adapter.prepare(value).stream(new AbortController().signal)) { /* 消费完整流，序列化错误不能被忽略。 */ }
  return body!;
}

describe("显式兼容与目标投影", () => {
  // 标准等级契约：max 与 xhigh 独立；在支持两者的协议／型号上，真实 SDK 不得丢失或混同它们。
  it.each(["openai-responses", "openai-chat", "anthropic"] as const)("%s 编码独立的 max 与 xhigh 等级", async protocol => {
    const current = input(protocol);
    if (protocol === "anthropic") current.settings.model.modelId = "claude-opus-4-7";
    for (const level of ["xhigh", "max"] as const) {
      current.settings.thinking = level;
      const body = await request(current);
      if (protocol === "anthropic") expect(body.output_config).toMatchObject({ effort: level });
      else if (protocol === "openai-chat") expect(body.reasoning_effort).toBe(level);
      else expect(body.reasoning).toMatchObject({ effort: level });
    }
    current.settings.model.capabilities.thinkingLevels = ["xhigh"];
    expect(() => new AiSdkAdapter(async () => "unused").validate(current)).toThrow("thinking level is unavailable");
  });

  // 两层合并不能深合并参数、把空列表当禁用，或把生效条目回写到任一来源。
  it("按 id 去重，模型参数整项优先，撤下覆盖恢复提供商条目", () => {
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

  // 系统提示只能发送一份：默认 instructions，显式标签才改为首条 system。
  it.each(["none", "provider", "model", "both"])("Responses 系统提示位置由两层标签决定：%s", async source => {
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

  // 参考协议不限制添加；不认识这些行为的协议继续正常编码。
  it("Responses 标签不改变 Anthropic 请求", async () => {
    const current = input("anthropic");
    current.settings.provider.compatibility = [{ id: "systemMessageInMessages" }, { id: "thinkingInDeepSeekFormat" }];
    const body = await request(current);
    expect(body).not.toHaveProperty("instructions");
    expect(body.system).toEqual([{ type: "text", text: projectSystemPrompt(current.system) }]);
    expect(body.messages).toEqual([{ role: "user", content: [{ type: "text", text: "Question" }] }]);
  });

  // 明文 reasoning 必须在原位置，不能被 SDK 丢弃，也不能破坏相邻的图片、工具配对或助手文字。
  it("DeepSeek 明文思考按原顺序插入，跨来源只取公共文字", async () => {
    const current = input();
    current.settings.provider.compatibility = [{ id: "thinkingInDeepSeekFormat" }];
    current.settings.model.compatibility = [{ id: "systemMessageInMessages" }];
    const foreign = { adapter: "foreign-adapter", scope: "foreign-scope" };
    current.messages = [
      { kind: "input", parts: [{ kind: "text", text: "Look" }, { kind: "file", data: new Uint8Array([1, 2, 3]), mediaType: "image/png" }] },
      { kind: "output", ...foreign, parts: [
        { kind: "thinking", text: "Before tool", continuation: { anthropic: { signature: "foreign-signature" } } },
        { kind: "text", text: "Checking", continuation: { openai: { itemId: "foreign-item" } } },
        { kind: "toolcall", callId: "vendor/call.with.dots", name: "lookup", arguments: { query: "value" }, continuation: null },
      ] },
      { kind: "result", callId: "vendor/call.with.dots", name: "lookup", error: false, parts: [{ kind: "text", text: "Found" }] },
      { kind: "output", ...foreign, parts: [
        { kind: "thinking", text: "After tool", continuation: { openai: { reasoningEncryptedContent: "foreign-ciphertext" } } },
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

  // 正常原生续接属于基线；切换只省略不可复用资料，切回时原历史的投影不受中间请求污染。
  it.each(["openai-responses", "anthropic"] as const)("%s 原生续接与 A→B→A 不改历史", async protocol => {
    const current = input(protocol);
    const native: Json = protocol === "anthropic" ? { anthropic: { signature: "native-token" } }
      : { openai: { itemId: "rs_native", reasoningEncryptedContent: "native-token" } };
    current.messages.push({ kind: "output", adapter: aiSdkAdapterVersion, scope: modelScope(current.settings), parts: [
      { kind: "thinking", text: "Visible thought", continuation: native },
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
      { kind: "thinking", text: "B thought", continuation: foreign },
      { kind: "text", text: "B answer", continuation: null },
    ] });
    resumed.messages.push({ kind: "input", parts: [{ kind: "text", text: "Return to A" }] });
    const again = await request(resumed);
    const field = protocol === "anthropic" ? "messages" : "input";
    const otherField = other.settings.provider.protocol === "anthropic" ? "messages" : "input";
    expect(JSON.stringify(a[field])).toContain("native-token");
    expect(JSON.stringify(b[otherField])).not.toMatch(/native-token|Visible thought|rs_native/);
    expect(JSON.stringify(b[otherField])).toContain("Portable answer");
    expect((again[field] as unknown[]).slice(0, (a[field] as unknown[]).length)).toEqual(a[field]);
    expect(JSON.stringify(again[field])).toContain("B answer");
    expect(JSON.stringify(again[field])).not.toMatch(/foreign-token|B thought/);
    expect(current).toEqual(original);
  });

  // 不同来源可以复用相同 call ID；投影必须保留本来源 ID，并让外来调用与其结果一起改名。
  it("跨来源调用 ID 冲突时保留原生身份，外来调用仍与结果配对", async () => {
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

  // 搬运只能改变文件的表达位置，不能把它移到后续历史消息之后。
  it("Chat 附件紧随工具结果批次，位于下一条历史消息之前", () => {
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

  // 提交前的引用形式与实际请求的字节形式共用同一协议门禁，禁止静默搬运文件。
  it("Chat 未添加工具文件标签时在 validate 与 prepare 拒绝", () => {
    const current = input("openai-chat");
    const adapter = new AiSdkAdapter(async () => { throw new Error("Must fail before reading credentials"); });
    const saved = { ...current, messages: [{ kind: "result" as const, callId: "call", name: "lookup", outcome: {
      kind: "succeeded" as const, data: null, model: [{ kind: "file" as const, file: { "$atelier.content": "c4b22b60-ae71-4e92-9823-2223b48a8327" }, mediaType: "image/png" }],
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
