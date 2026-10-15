import { thinkingLevels } from "@atelier/sdk/contracts";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { defineData, defineResource, defineTool, defineImplementation, type ModelRunEvent, type ModelRunRequest } from "@atelier/sdk/contracts";
import { implement } from "../tools/testing.ts";
import { ResourceRegistry } from "../resources/registry.ts";
import { ToolRegistry } from "../tools/registry.ts";
import { AgentCapabilities } from "./capabilities.ts";
import { resolveInput } from "../model/input.ts";
import { runModelRequest } from "./request.ts";
import type { ModelAdapter, ModelEvent } from "../model/contract.ts";
import type { ModelSettings } from "../shared/model.ts";

const settings: ModelSettings = {
  provider: { id: "p", revision: 1, name: "Provider", enabled: true, baseUrl: "https://example.invalid", protocol: "openai-responses", auth: "none", compatibility: [] },
  model: { revision: 1, name: "Model", modelId: "test", providerId: "p", enabled: true, contextWindow: 4000, cost: null, compatibility: [],
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
  it("流暂停时也交付部分输入，填充不执行工具，结束后清理合并计时器", async () => {
    vi.useFakeTimers();
    try {
      let executions = 0;
      const tool = implement(write, { async call() { executions++; return { kind: "succeeded", data: 1 }; } });
      const capabilities = new AgentCapabilities(new ResourceRegistry([]), new ToolRegistry([tool]), [resource], () => true);
      const events: ModelRunEvent[] = [];
      const adapter: ModelAdapter = { validate() {}, version: "test", prepare() { return { async *stream() {
        yield { type: "part.start", part: { id: "c", kind: "toolcall", callId: "c", name: "resource_call" } } as const;
        yield { type: "part.delta", partId: "c", delta: '{"resource_id":"r","tool":"write","args":{"content":"正在生成' } as const;
        await new Promise(resolve => setTimeout(resolve, 80));
        expect(executions).toBe(0);
        expect(events).toContainEqual(expect.objectContaining({ type: "progress", blocks: [
          expect.objectContaining({ state: "input", arguments: { resource_id: "r", tool: "write", args: { content: "正在生成" } },
            invocation: expect.objectContaining({ implementation: { id: write.id }, resource: { id: "r", kind: resource.kind, title: "Item" } }) }),
        ] }));
        yield { type: "part.end", partId: "c", arguments: { resource_id: "r", tool: "write", args: {} } } as const;
        yield { type: "finish", reason: "tool-calls", usage: null } as const;
      } }; } };
      const running = execute(input(events), adapter, capabilities);
      await vi.runAllTimersAsync();
      expect(await running).toMatchObject({ reason: "completed" });
      expect(executions).toBe(1);
      expect(events.at(-1)).toEqual({ type: "progress", blocks: [] });
    } finally { vi.useRealTimers(); }
  });

  it("流在合并间隔内中断仍刷新最后输入，且不会在收束后发出迟到进度", async () => {
    vi.useFakeTimers();
    try {
      const events: ModelRunEvent[] = [];
      await execute(input(events), model([
        { type: "part.start", part: { id: "c", kind: "toolcall", callId: "c", name: "resource_call" } },
        { type: "part.delta", partId: "c", delta: '{"tool":"write","args":{"content":"unfinished' },
      ]));
      expect(events).toContainEqual(expect.objectContaining({ type: "progress", blocks: [
        expect.objectContaining({ state: "input", argumentsText: expect.stringContaining("unfinished") }),
      ] }));
      const count = events.length;
      await vi.runAllTimersAsync();
      expect(events).toHaveLength(count);
    } finally { vi.useRealTimers(); }
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
    const capabilities = new AgentCapabilities(new ResourceRegistry([]), new ToolRegistry([tool]), [resource], () => true);
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
    expect(started).toBe(1);
    expect(later).toBe(0);
  });

  it("未知工具结局显式阻止自动继续，宿主仍交付全部调用和终态", async () => {
    const tool = implement(write, { async call() { return { kind: "unknown", message: "Effects require inspection." }; } });
    const capabilities = new AgentCapabilities(new ResourceRegistry([]), new ToolRegistry([tool]), [resource], () => true);
    const events: ModelRunEvent[] = [];
    const result = await execute(input(events), model(calls(["first", "second"], "resource_call", { resource_id: "r", tool: "write", args: {} })), capabilities);
    expect(result).toMatchObject({ reason: "failed", code: "unknown_outcome", tools: [{ kind: "unknown" }, { kind: "unknown" }] });
    expect(events.filter(event => event.type === "block")).toHaveLength(2);
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
});
