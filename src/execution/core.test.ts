import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { defineData, reference } from "@atelier/sdk/contracts";
import { defineImplementation, defineResource, defineTool } from "@atelier/sdk/contracts";
import type { Json, ToolOutcome } from "../shared/model.ts";
import type { ToolInvocationInfo } from "@atelier/sdk/contracts";
import { implement, type CallResult } from "../tools/contract.ts";
import { ToolRegistry } from "../tools/registry.ts";
import { ResourceRegistry } from "../resources/registry.ts";
import { AgentCapabilities } from "./capabilities.ts";
import { executeCoreBatch, type ToolObserver } from "./core.ts";

const contract = defineImplementation({
  ...defineData("test.stream", 1, z.strictObject({ text: z.string() }).describe("Current captured text.")),
  resource: defineResource("test", z.strictObject({})),
  tool: defineTool({ name: "stream", description: "Produce text.", guidelines: [], argsSchema: z.strictObject({}).describe("No parameters.") }),
  targetSchema: z.null().describe("Use the resource."), effect: "read", execution: "parallel",
});
const resource = { id: "r", kind: "test", title: "At request start", data: {} };
const call = { callId: "c", name: "resource_call", arguments: { resource_id: "r", tool: "stream", args: {} } };
type Data = { text: string };
type Handler = (context: { signal: AbortSignal; publish(data: Data): void }) => Promise<CallResult<Data>>;
async function run(handler: Handler, options: { effect?: "read" | "write"; signal?: AbortSignal; observer?: ToolObserver; toModel?: (data: Data) => Json } = {}) {
  const tool = implement({ ...contract, effect: options.effect ?? "read" }, {
    call: async (_state, _target, _args, context) => handler(context), toModel: options.toModel,
  });
  const capabilities = new AgentCapabilities(new ResourceRegistry([]), new ToolRegistry([tool]), [resource], () => true);
  const results: ToolOutcome[] = [];
  await executeCoreBatch([call], capabilities, options.signal ?? new AbortController().signal, (_call, result) => results.push(result), options.observer);
  expect(results).toHaveLength(1);
  return results[0]!;
}

describe("工具产出与终结", () => {
  it("publish 是独立快照，只在终结时投影模型；终结后的回调失效", async () => {
    const updates: Json[] = [];
    const order: string[] = [];
    const waiting: ToolInvocationInfo[] = [];
    let late!: (data: Data) => void;
    const toModel = vi.fn((data: Data) => data.text);
    const outcome = await run(async ({ publish }) => {
      late = publish;
      const data = { text: "first" };
      publish(data);
      data.text = "second";
      publish(data);
      data.text = "not published";
      expect(updates).toEqual([{ text: "first" }, { text: "second" }]);
      expect(toModel).not.toHaveBeenCalled();
      return { kind: "succeeded", data: { text: "final" } };
    }, { toModel, observer: {
      prepared(_call, info) { waiting.push(info); order.push("prepared"); expect(info).toMatchObject({ implementation: reference(contract), resource: { id: "r", title: resource.title } }); },
      started(_call, info) { order.push("started"); expect(info.startedAt).toEqual(expect.any(Number)); },
      published(_call, data) { order.push("published"); updates.push(data); },
    } });
    expect(order).toEqual(["prepared", "started", "published", "published"]);
    expect(waiting[0]).not.toHaveProperty("startedAt");
    expect(outcome).toMatchObject({ kind: "succeeded", data: { text: "final" }, model: "final", implementation: reference(contract),
      resource: { id: "r", kind: "test", title: resource.title }, startedAt: expect.any(Number), finishedAt: expect.any(Number) });
    expect(toModel).toHaveBeenCalledTimes(1);
    expect(() => late({ text: 4 } as never)).not.toThrow();
    expect(updates).toHaveLength(2);
  });

  it.each([
    { kind: "failed", error: { code: "test_failure", message: "Failed after producing text." } },
    { kind: "rejected", error: { code: "test_rejection", message: "Rejected after inspection." } },
    { kind: "cancelled", message: "Stopped after producing text." },
    { kind: "unknown", message: "Effects are unknown." },
  ] as const)("$kind 保留最近的合法产出，模型投影包含结局和产出", async completion => {
    const outcome = await run(async ({ publish }) => { publish({ text: "captured" }); return completion; }, { toModel: data => data.text });
    expect(outcome).toMatchObject({ ...completion, data: { text: "captured" }, model: { ...completion, data: "captured" } });
  });

  it("部分完成明确保存最终产出；显式 null 可以清空过期的过程产出", async () => {
    expect(await run(async ({ publish }) => {
      publish({ text: "preliminary" });
      return { kind: "partial", data: { text: "committed portion" }, message: "Only some work completed." };
    })).toMatchObject({ kind: "partial", data: { text: "committed portion" }, model: {
      kind: "partial", data: { text: "committed portion" }, message: "Only some work completed.",
    } });
    expect(await run(async ({ publish }) => {
      publish({ text: "invalidated preview" });
      return { kind: "failed", data: null, error: { code: "invalidated", message: "Preview is no longer valid." } };
    })).toMatchObject({ data: null, model: { data: null } });
  });

  it.each(["read", "write"] as const)("%s 执行中抛出中止时保留产出，不能把未知写入伪装成已撤销", async effect => {
    const controller = new AbortController();
    const outcome = await run(async ({ publish, signal }) => {
      publish({ text: "before abort" });
      controller.abort();
      signal.throwIfAborted();
      return { kind: "succeeded", data: { text: "unreachable" } };
    }, { effect, signal: controller.signal });
    expect(outcome).toMatchObject({ kind: effect === "read" ? "cancelled" : "unknown", data: { text: "before abort" } });
    expect(outcome.model).toMatchObject({ kind: outcome.kind, data: { text: "before abort" } });
  });

  it.each(["publish", "return"] as const)("%s 的不合法数据不会覆盖之前的有效快照", async where => {
    const outcome = await run(async ({ publish }) => {
      publish({ text: "valid" });
      if (where === "publish") publish({ text: 42 } as never);
      return { kind: "succeeded", data: { text: 42 } as never };
    });
    expect(outcome).toMatchObject({ kind: "failed", data: { text: "valid" }, error: { code: "tool_failed" } });
  });

  it.each([
    { kind: "succeeded", preview: true },
    { kind: "partial", preview: false },
  ] as const)("$kind 缺少最终 data 时不能将预览或 null 当作成功产出", async ({ kind, preview }) => {
    const outcome = await run(async ({ publish }) => {
      if (preview) publish({ text: "preview only" });
      return { kind, ...(kind === "partial" ? { message: "Missing final data." } : {}) } as never;
    });
    expect(outcome).toMatchObject({
      kind: "failed", data: preview ? { text: "preview only" } : null,
      model: { kind: "failed", data: preview ? { text: "preview only" } : null },
    });
  });

  it("模型投影失败保留已知执行结局，不绕过投影发送原始数据", async () => {
    const outcome = await run(async () => ({ kind: "succeeded", data: { text: "UI only" } }), { effect: "write", toModel() { throw new Error("Internal exception"); } });
    expect(outcome).toMatchObject({ kind: "succeeded", data: { text: "UI only" }, model: { error: { code: "result_projection_failed" } } });
    expect(JSON.stringify(outcome.model)).not.toContain("UI only");
    expect(JSON.stringify(outcome)).not.toContain("Internal exception");
  });
});
