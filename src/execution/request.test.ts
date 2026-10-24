import { thinkingLevels, present, completionData, modelCompletionSchema, modelRunRecordSchema, type RequestTiming } from "@atelier/sdk/contracts";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { defineData, defineResource, defineTool, defineImplementation, type ModelRunEvent, type ModelRunRequest } from "@atelier/sdk/contracts";
import { implement, toolCaller } from "../tools/testing.ts";
import { ResourceRegistry } from "../resources/registry.ts";
import { ToolRegistry } from "../tools/registry.ts";
import { AgentCapabilities } from "./capabilities.ts";
import { resolveInput } from "../model/input.ts";
import { runModelRequest } from "./request.ts";
import { ModelFailure, type ModelAdapter, type ModelEvent } from "../model/contract.ts";
import type { ModelSettings } from "../shared/model.ts";

const settings: ModelSettings = {
  provider: { id: "p", name: "Provider", enabled: true, baseUrl: "https://example.invalid", protocol: "openai-responses", auth: "none", compatibility: [] },
  model: { name: "Model", modelId: "test", providerId: "p", enabled: true, contextWindow: 4000, cost: null, compatibility: [],
    capabilities: { reasoning: false, tools: true, thinkingLevels: [...thinkingLevels] }, generation: { temperature: null, topP: null, maxOutputTokens: null } }, thinking: "off",
};
const empty = () => new AgentCapabilities(new ResourceRegistry([]), new ToolRegistry([]), [], () => true);
const text: ModelEvent[] = [
  { type: "part.start", part: { id: "t", kind: "text" } }, { type: "part.delta", partId: "t", delta: "Hello" },
  { type: "part.end", partId: "t" }, { type: "finish", reason: "stop", usage: null },
];
const calls = (ids: string[], name = "resource_list", args = {}) => [
  ...ids.flatMap(id => [
    { type: "part.start" as const, part: { id, kind: "toolcall" as const, callId: id, name } },
    { type: "part.end" as const, partId: id, arguments: args },
  ]), { type: "finish" as const, reason: "tool-calls", usage: null },
];
function input(events: ModelRunEvent[], extra: Partial<ModelRunRequest> = {}): ModelRunRequest {
  return { object: { id: "a", sessionId: "s", kind: "example.agent/worker" }, requestParentId: "origin",
    target: { role: "default" }, system: { blocks: [] }, messages: [{ kind: "input", parts: [{ kind: "text", text: "Input" }] }],
    signal: new AbortController().signal, observer: { event(event) { events.push(event); } }, ...extra };
}
function model(events: ModelEvent[], prepare = () => {}): ModelAdapter {
  return { validate() {}, version: "test-adapter", prepare() { prepare(); return { async *stream() { yield* events; } }; } };
}
async function execute(request: ModelRunRequest, adapter: ModelAdapter, capabilities = empty()) {
  return runModelRequest(request, Promise.resolve({ adapter, settings, capabilities, system: request.system, messages: await resolveInput(request.messages, undefined, request.signal) }));
}
const resource = { id: "r", kind: "example.resource/item", title: "Item", data: {} };
const write = defineImplementation({ ...defineData("example.resource/write", z.number().describe("Current value.")),
  resource: defineResource(resource.kind, z.object({})),
  tool: defineTool({ id: "test.tools/write", name: "write", description: "Write a value.", guidelines: [], argsSchema: z.object({}).describe("No arguments.") }),
  targetSchema: z.null().describe("The whole item."), effect: "write", execution: "sequential" });

describe("无状态的单次模型执行", () => {
  // 中途断流时已有块仍交付；原始错误经过事件和记录校验后仍可供界面读取。
  it("部分响应失败的详情同时保留在返回值与可保存诊断中", async () => {
    const details = { message: "Upstream overloaded", statusCode: 503, responseBody: '{"error":"busy"}' };
    const failure = new ModelFailure("provider_error", details.message, details, "model");
    const events: ModelRunEvent[] = [];
    const result = await execute(input(events), { validate() {}, version: "test", prepare() { return {
      async *stream() { yield* text.slice(0, -1); throw failure; },
    }; } });
    expect(result).toMatchObject({ reason: "failed", code: "provider_error", details });
    const records = events.filter(event => event.type !== "progress").map(event => modelRunRecordSchema.parse(event));
    expect(records).toContainEqual({ type: "diagnostic", origin: "model", code: "provider_error", message: details.message, level: "error", details });
    expect(records[0]).toMatchObject({ type: "block", block: { kind: "text", text: "Hello", complete: true } });
  });
  // 响应元信息只随返回结果交付发起者，不进入可保存的块、诊断或进度事件。
  it.each(["completed", "failed"] as const)("%s 结果保留 HTTP 元信息，观察事件不包含 headers", async outcome => {
    const response = { connection: { id: "p" }, endpoint: settings.provider.baseUrl, model: "test",
      status: outcome === "completed" ? 200 : 429, receivedAt: 1, headers: { "x-test-metadata": "private-response" } };
    const failure = new ModelFailure("provider_error", "Failed.");
    failure.response = response;
    const adapter = outcome === "completed"
      ? model([...text.slice(0, -1), { type: "finish", reason: "stop", usage: null, response }])
      : { validate() {}, version: "test", prepare() { return { async *stream(): AsyncIterable<ModelEvent> { throw failure; } }; } };
    const events: ModelRunEvent[] = [];
    const result = await execute(input(events), adapter);
    expect(result).toMatchObject({ reason: outcome, response });
    expect(JSON.stringify(events)).not.toContain("private-response");
  });
  // docs/runtime.md#响应计量与请求计时：终态计时与 usage 一起交付，执行工具不重置时间；失败也保留计时。
  it("保留模型终态和失败携带的计时，不用工具批次结束时间覆盖", async () => {
    const timing: RequestTiming = { startedAt: "2026-01-01T00:00:00.000Z", endedAt: "2026-01-01T00:00:01.000Z",
      durationMs: 1000, firstOutputMs: 100, firstTextMs: null, firstReasoningMs: null, lastOutputMs: 900, outputChunks: 2, outcome: "completed" };
    const events = calls(["list"]);
    const result = await execute(input([]), model([...events.slice(0, -1),
      { type: "finish", reason: "tool-calls", usage: null, timing }]));
    expect(result).toMatchObject({ reason: "completed", completion: { timing }, timing,
      tools: [{ kind: "succeeded" }] });
    const controller = new AbortController();
    const cancelled = await execute(input([], { signal: controller.signal }), { validate() {}, version: "test", prepare() { return {
      async *stream() {
        yield* events.slice(0, -1);
        controller.abort();
        yield { type: "finish", reason: "tool-calls", usage: null, timing };
      },
    }; } });
    expect(cancelled).toMatchObject({ reason: "cancelled", completion: { timing }, tools: [] });
    const failure = new ModelFailure("provider_error", "Failed.");
    failure.timing = { ...timing, outcome: "failed" };
    const failed = await execute(input([]), { validate() {}, version: "test", prepare() { return {
      async *stream() { throw failure; },
    }; } });
    expect(failed).toMatchObject({ reason: "failed", completion: null, timing: { outcome: "failed", durationMs: 1000 } });
  });

  it("工具批次结束即返回，不隐式发起下一请求，另一次调用只使用显式输入", async () => {
    let requests = 0;
    const seen: unknown[] = [];
    const adapter: ModelAdapter = { validate() {}, version: "test", prepare(request) {
      requests++; seen.push(structuredClone(request.messages));
      return { async *stream() { yield* calls(["list"]); } };
    } };
    const events: ModelRunEvent[] = [];
    const first = await execute(input(events), adapter);
    expect(requests).toBe(1);
    expect(first).toMatchObject({ reason: "completed", tools: [{ kind: "succeeded", data: { resources: [] } }] });
    expect(events.filter(event => event.type === "block")).toHaveLength(1);
    expect(events.find(event => event.type === "block")).toMatchObject({ block: { ordinal: 0, requestParentId: "origin", completion: { finishReason: "tool-calls" } } });
    await execute(input([], { messages: [{ kind: "input", parts: [{ kind: "text", text: "New projection" }] }] }), adapter);
    expect(seen).toEqual([[{ kind: "input", parts: [{ kind: "text", text: "Input" }] }], [{ kind: "input", parts: [{ kind: "text", text: "New projection" }] }]]);
  });

  it("截断响应只交付未完成审计块，保留已报告终态，不执行工具", async () => {
    const events: ModelRunEvent[] = [];
    const result = await execute(input(events), model([
      { type: "part.start", part: { id: "c", kind: "toolcall", callId: "c", name: "resource_list" } },
      { type: "part.delta", partId: "c", delta: "{" }, { type: "finish", reason: "tool-calls", usage: null },
    ]));
    expect(result).toMatchObject({ reason: "failed", code: "incomplete", tools: [], completion: { finishReason: "tool-calls" } });
    expect(events.filter(event => event.type === "block")).toEqual([expect.objectContaining({ block: expect.objectContaining({ complete: false, outcome: null }) })]);
    expect(events.at(-1)).toEqual({ type: "progress", blocks: [] });
  });

  it("事件消费者失败时取消执行并收束整批，保留未知写入与未启动调用的结局", async () => {
    let started = 0;
    const tool = implement(write, { async call(_state, _target, _args, { publish, signal }) {
      started++; publish(1); signal.throwIfAborted(); return { kind: "succeeded", data: 2 };
    } });
    const capabilities = new AgentCapabilities(new ResourceRegistry([]), new ToolRegistry([tool]), [resource], () => true, toolCaller);
    let failed = false;
    let later = 0;
    const request = input([], { observer: { event(event) {
      if (failed) later++;
      if (event.type === "progress" && event.blocks.some(block => block.kind === "toolcall" && block.result?.data === 1)) {
        failed = true; throw new Error("The event consumer failed.");
      }
    } } });
    const result = await execute(request, model(calls(["first", "second"], "resource_call", { resource_id: "r", tool: "write", args: {} })), capabilities);
    expect(result).toMatchObject({ reason: "failed", code: "event_delivery", tools: [{ kind: "unknown", data: 1 }, { kind: "cancelled" }] });
    expect(result).toMatchObject({ details: { message: "The event consumer failed." } });
    expect(started).toBe(1);
    expect(later).toBe(0);
  });

  // docs/runtime.md：工具结局是模型反馈；显式未知与写工具抛错均不改变模型请求结局。
  it("未知工具结局和写工具异常正常交付，整批完成供代理继续处理", async () => {
    let executions = 0;
    const tool = implement(write, { async call() {
      if (++executions === 2) throw new Error("The command stopped before reporting its result.");
      return { kind: "unknown", message: "Effects require inspection." };
    } });
    const capabilities = new AgentCapabilities(new ResourceRegistry([]), new ToolRegistry([tool]), [resource], () => true, toolCaller);
    const events: ModelRunEvent[] = [];
    const result = await execute(input(events), model(calls(["first", "second"], "resource_call", { resource_id: "r", tool: "write", args: {} })), capabilities);
    expect(result).toMatchObject({ reason: "completed", tools: [{ kind: "unknown" }, { kind: "unknown" }] });
    expect(result.tools[0]!.model).toEqual([{ kind: "text", text: "unknown: Effects require inspection." }]);
    expect(result.tools[1]!.model).toEqual([{ kind: "text", text: "unknown: The tool stopped with an unknown outcome." }]);
    expect(events.filter(event => event.type === "block")).toHaveLength(2);
    expect(events.filter(event => event.type === "diagnostic")).toEqual([]);
  });

  it("缓存命中预期每次显式输入，不根据上次调用推断", async () => {
    const finish = { type: "finish" as const, reason: "stop", usage: { input: 3000, output: 10, total: 3010, reasoning: null, cacheRead: 0, cacheWrite: null } };
    const adapter = model([...text.slice(0, -1), finish]);
    const first: ModelRunEvent[] = []; const second: ModelRunEvent[] = []; const third: ModelRunEvent[] = [];
    await execute(input(first), adapter);
    await execute(input(second, { cache: { expectHit: true } }), adapter);
    await execute(input(third), adapter);
    expect(first.filter(event => event.type === "diagnostic")).toEqual([]);
    expect(second.filter(event => event.type === "diagnostic")).toMatchObject([{ code: "cache_miss", level: "warning" }]);
    expect(third.filter(event => event.type === "diagnostic")).toEqual([]);
  });
  // docs/runtime.md：领域扩展消费最终现场的独立副本，与 usage 同时交付最高序号块，公共层只保留封装。
  it("领域扩展在准备后生成，随终态块一次交付，未知或不兼容扩展不破坏公共计量", async () => {
    const contract = defineData("example.agent/request", z.object({ tools: z.array(z.string()) }));
    const unknown = { contract: { id: "other.plugin/opaque" }, data: { version: 42 } };
    const system = { blocks: [{ id: "s", kind: "system" as const, from: "core", text: "Environment" }] };
    let prepared = false;
    const extensions = vi.fn(context => {
      expect(prepared).toBe(true);
      context.system.blocks[0].text = "Changed copy";
      return [present(contract, { tools: context.tools.map((tool: { name: string }) => tool.name) }), unknown];
    });
    const events: ModelRunEvent[] = [];
    const result = await execute(input(events, { system, completionExtensions: extensions }), model([
      { type: "part.start", part: { id: "thought", kind: "thinking" } },
      { type: "part.end", partId: "thought" }, ...text,
    ], () => { prepared = true; }));
    const blocks = events.filter(event => event.type === "block").map(event => event.block);
    expect(blocks[0]?.completion).toBeNull();
    expect(blocks[1]?.completion).toEqual(result.completion);
    expect(extensions).toHaveBeenCalledTimes(1);
    expect(system.blocks[0]?.text).toBe("Environment");
    const saved = modelCompletionSchema.parse(result.completion);
    expect(saved.extensions).toContainEqual(unknown);
    expect(completionData(saved, contract)).toEqual({ tools: ["resource_list", "resource_inspect", "resource_call"] });
    expect(completionData(saved, defineData("missing/plugin", z.string()))).toBeNull();
    expect(completionData(saved, defineData(contract.id, z.number()))).toBeNull();
    extensions.mockClear();
    const rejected = await execute(input([], { completionExtensions: extensions }), model(text, () => { throw new ModelFailure("thinking_unavailable", "No."); }));
    expect(rejected).toMatchObject({ reason: "failed", completion: null });
    expect(extensions).not.toHaveBeenCalled();
  });
});
