import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { defineData, reference } from "@asterism/sdk/contracts";
import { defineImplementation, defineResource, defineTool } from "@asterism/sdk/contracts";
import type { Json, ToolOutcome } from "../shared/model.ts";
import type { ToolModelOutput } from "@asterism/sdk/contracts";
const text = (outcome: ToolOutcome) => outcome.model.flatMap(part => part.kind === "text" ? [part.text] : []).join("\n");
import type { ToolInvocationInfo } from "@asterism/sdk/contracts";
import { implement, toolCaller } from "../tools/testing.ts";
import type { CallResult } from "@asterism/sdk/runtime";
import { ToolRegistry } from "../tools/registry.ts";
import { ResourceRegistry } from "../resources/registry.ts";
import { AgentCapabilities } from "./capabilities.ts";
import { executeCoreBatch, previewCoreCall, type ToolObserver } from "./core.ts";
import { finishToolResult } from "../tools/result.ts";

const contract = defineImplementation({
  ...defineData("test.stream", z.strictObject({ text: z.string() }).describe("Current captured text.")),
  resource: defineResource("test", z.strictObject({})),
  tool: defineTool({ id: "test.tools/stream", name: "stream", description: "Produce text.", guidelines: [], argsSchema: z.strictObject({}).describe("No parameters.") }),
  targetSchema: z.null().describe("Use the resource."), effect: "read", execution: "parallel",
});
const resource = { id: "r", kind: "test", title: "At request start", data: {} };
const call = { callId: "c", name: "resource_call", arguments: { resource_id: "r", tool: "stream", args: {} } };
type Data = { text: string };
type Handler = (context: { signal: AbortSignal; publish(data: Data): void }) => Promise<CallResult<Data>>;
async function run(handler: Handler, options: { effect?: "read" | "write"; signal?: AbortSignal; observer?: ToolObserver; toModel?: (data: Data) => ToolModelOutput } = {}) {
  const tool = implement({ ...contract, effect: options.effect ?? "read" }, {
    call: async (_state, _target, _args, context) => handler(context), toModel: options.toModel,
  });
  const capabilities = new AgentCapabilities(new ResourceRegistry([]), new ToolRegistry([tool]), [resource], () => true, toolCaller);
  const results: ToolOutcome[] = [];
  await executeCoreBatch([call], capabilities, options.signal ?? new AbortController().signal, (_call, result) => results.push(result), options.observer);
  expect(results).toHaveLength(1);
  return results[0]!;
}

describe("Tool output and completion", () => {
  // Without a declared projection, domain data shaped like model parts must not become file parts that bypass the tool's projection.
  it("undeclared projections send strings as text and other data as JSON text, never as model parts", () => {
    const partsLike = [{ kind: "file", content: { id: "x" } }];
    expect(finishToolResult({ kind: "succeeded", data: partsLike }).model).toEqual([{ kind: "text", text: JSON.stringify(partsLike) }]);
    expect(finishToolResult({ kind: "succeeded", data: "plain" }).model).toEqual([{ kind: "text", text: "plain" }]);
  });
  it("previews only consult the captured catalog without preparation or execution; unknown resources and policy-excluded tools have no implementation identity", () => {
    const tool = implement(contract, { call: async () => ({ kind: "succeeded", data: { text: "" } }) });
    const prepare = vi.spyOn(tool, "prepare");
    const snapshot = { ...resource };
    const capabilities = new AgentCapabilities(new ResourceRegistry([]), new ToolRegistry([tool]), [snapshot], () => true);
    snapshot.title = "Changed later";
    expect(previewCoreCall("resource_call", call.arguments, capabilities)).toEqual({
      implementation: reference(contract), resource: { id: "r", kind: "test", title: "At request start" },
    });
    expect(previewCoreCall("resource_call", { ...call.arguments, resource_id: "unknown" }, capabilities)).toEqual({});
    const denied = new AgentCapabilities(new ResourceRegistry([]), new ToolRegistry([tool]), [resource], () => false);
    expect(previewCoreCall("resource_call", call.arguments, denied).implementation).toBeUndefined();
    expect(prepare).not.toHaveBeenCalled();
  });
  it("publish creates independent snapshots projected to the model only at completion; callbacks expire after completion", async () => {
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
    expect(outcome).toMatchObject({ kind: "succeeded", data: { text: "final" }, model: [{ kind: "text", text: "final" }], implementation: reference(contract),
      resource: { id: "r", kind: "test", title: resource.title }, startedAt: expect.any(Number), finishedAt: expect.any(Number) });
    expect(toModel).toHaveBeenCalledWith({ text: "final" });
    expect(() => late({ text: 4 } as never)).not.toThrow();
    expect(updates).toHaveLength(2);
  });

  it.each([
    { kind: "failed", error: { code: "test_failure", message: "Failed after producing text." } },
    { kind: "rejected", error: { code: "test_rejection", message: "Rejected after inspection." } },
    { kind: "cancelled", message: "Stopped after producing text." },
    { kind: "unknown", message: "Effects are unknown." },
  ] as const)("$kind retains the latest valid output and model projection includes outcome and output", async completion => {
    const outcome = await run(async ({ publish }) => { publish({ text: "captured" }); return completion; }, { toModel: data => data.text });
    expect(outcome).toMatchObject({ ...completion, data: { text: "captured" } });
    expect(text(outcome)).toContain(completion.kind);
    expect(text(outcome)).toContain("error" in completion ? completion.error!.message : completion.message);
    expect(text(outcome)).toContain("captured");
  });

  it("partial completion explicitly saves final output; explicit null clears stale intermediate output", async () => {
    await run(async ({ publish }) => {
      publish({ text: "preliminary" });
      return { kind: "partial", data: { text: "committed portion" }, message: "Only some work completed." };
    }).then(outcome => {
      expect(outcome).toMatchObject({ kind: "partial", data: { text: "committed portion" } });
      expect(text(outcome)).toContain("Only some work completed.");
      expect(text(outcome)).toContain("committed portion");
    });
    const cleared = await run(async ({ publish }) => {
      publish({ text: "invalidated preview" });
      return { kind: "failed", data: null, error: { code: "invalidated", message: "Preview is no longer valid." } };
    });
    expect(cleared).toMatchObject({ data: null });
    expect(text(cleared)).not.toContain("invalidated preview");
  });

  it.each([
    { effect: "read", abort: false, kind: "failed" }, { effect: "write", abort: false, kind: "unknown" },
    { effect: "read", abort: true, kind: "cancelled" }, { effect: "write", abort: true, kind: "unknown" },
  ] as const)("$effect execution throws (abort=$abort) are classified by side effects and retain acquired output", async ({ effect, abort, kind }) => {
    const controller = new AbortController();
    const outcome = await run(async ({ publish, signal }) => {
      publish({ text: "captured" });
      if (abort) { controller.abort(); signal.throwIfAborted(); }
      throw new Error("Synthetic execution failure.");
    }, { effect, signal: controller.signal });
    expect(outcome).toMatchObject({ kind, data: { text: "captured" } });
    expect(text(outcome)).toContain(kind); expect(text(outcome)).toContain("captured");
  });

  it.each(["publish", "return"] as const)("invalid %s data does not overwrite the previous valid snapshot", async where => {
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
  ] as const)("$kind without final data cannot treat a preview or null as successful output", async ({ kind, preview }) => {
    const outcome = await run(async ({ publish }) => {
      if (preview) publish({ text: "preview only" });
      return { kind, ...(kind === "partial" ? { message: "Missing final data." } : {}) } as never;
    });
    expect(outcome).toMatchObject({
      kind: "failed", data: preview ? { text: "preview only" } : null,
    });
    expect(text(outcome).includes("preview only")).toBe(preview);
  });

  it("model projection failures preserve known execution outcomes without bypassing projection to send raw data", async () => {
    const outcome = await run(async () => ({ kind: "succeeded", data: { text: "UI only" } }), { effect: "write", toModel() { throw new Error("Internal exception"); } });
    expect(outcome).toMatchObject({ kind: "succeeded", data: { text: "UI only" }, });
    expect(text(outcome)).toContain("succeeded");
    expect(JSON.stringify(outcome.model)).not.toContain("UI only");
    expect(JSON.stringify(outcome)).not.toContain("Internal exception");
  });
});
