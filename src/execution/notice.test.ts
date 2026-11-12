import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { defineData, defineImplementation, defineResource, defineTool, type ToolOutcome } from "@asterism-app/sdk/contracts";
import type { BoundTopLevelTool } from "../plugins/top-level-tools.ts";
import { ResourceRegistry } from "../resources/registry.ts";
import { ToolRegistry } from "../tools/registry.ts";
import { implement, toolCaller } from "../tools/testing.ts";
import { AgentCapabilities } from "./capabilities.ts";
import { executeCoreBatch, type PendingCall, type ToolObserver } from "./core.ts";

const resource = { id: "r", kind: "test.notice/item", title: "Target", data: {} };
const contract = defineImplementation({
  ...defineData("test.notice/result", z.string().describe("The response.")),
  resource: defineResource(resource.kind, z.strictObject({})),
  tool: defineTool({ id: "test.notice/prompt", name: "prompt", description: "Request attention.", guidelines: [],
    argsSchema: z.strictObject({}).describe("No arguments."), requiresNotice: true }),
  targetSchema: z.null().describe("The whole item."), effect: "read", execution: "sequential",
});
const direct: PendingCall = { callId: "call", name: "resource_call", arguments: { resource_id: resource.id, tool: "prompt", args: {} } };
function setup(options: { requiresNotice?: boolean; topLevel?: boolean; execute?: () => Promise<void> } = {}) {
  const order: string[] = [];
  const tool = { ...contract.tool, requiresNotice: options.requiresNotice ?? true };
  const execute = async (publish: (data: string) => void) => {
    order.push("execute"); publish("First"); publish("Second");
    await options.execute?.();
    return { kind: "succeeded" as const, data: "Done" };
  };
  const implementation = implement({ ...contract, tool }, { call: (_state, _target, _args, { publish }) => execute(publish) });
  const capabilities = new AgentCapabilities(new ResourceRegistry([]), new ToolRegistry([implementation]), [resource], () => true, toolCaller);
  const tools: BoundTopLevelTool[] = options.topLevel ? [{ tool, available: true,
    resolve: () => ({ effect: "read", execution: "sequential", execute: async (_signal, publish) => execute(data => publish?.(data)) }),
  }] : [];
  const call = options.topLevel ? { callId: "call", name: tool.name, arguments: {} } : direct;
  const notice = vi.fn(() => { order.push("notice"); });
  const observer: ToolObserver = {
    started: () => { order.push("started"); },
    noticed: () => { order.push("noticed"); },
    published: () => { order.push("progress"); },
  };
  const run = async (calls: PendingCall[] = [call], signal = new AbortController().signal) => {
    const outcomes: ToolOutcome[] = [];
    await executeCoreBatch(calls, capabilities, signal, (_call, outcome) => outcomes.push(outcome), observer, undefined, tools, notice);
    return outcomes;
  };
  return { run, notice, order, call };
}

describe("Tool attention at execution start", () => {
  // Notices belong to accepted execution, not progress updates or completion; resource dispatch must use the selected tool's declaration.
  it.each([false, true])("notices once before execution for a top-level tool=%s", async topLevel => {
    const f = setup({ topLevel });
    expect((await f.run())[0]?.kind).toBe("succeeded");
    expect(f.order).toEqual(["started", "noticed", "notice", "execute", "progress", "progress"]);
    expect(f.notice).toHaveBeenCalledTimes(1);
  });

  // A declaration cannot turn rejected arguments, unavailable identities, ordinary calls, or pre-start cancellation into attention requests.
  it.each(["invalid-resource-args", "invalid-top-level-args", "unknown-resource", "ordinary", "cancelled"] as const)("does not notice %s", async mode => {
    const f = setup({ topLevel: mode === "invalid-top-level-args", requiresNotice: mode !== "ordinary" });
    const controller = new AbortController();
    if (mode === "cancelled") controller.abort();
    const call: PendingCall = mode === "invalid-resource-args" ? { ...direct, arguments: { resource_id: resource.id, tool: "prompt", args: { extra: true } } }
      : mode === "invalid-top-level-args" ? { ...f.call, arguments: { extra: true } }
        : mode === "unknown-resource" ? { ...direct, arguments: { resource_id: "missing", tool: "prompt", args: {} } } : f.call;
    const result = (await f.run([call], controller.signal))[0]!;
    expect(result.kind).toBe(mode === "ordinary" ? "succeeded" : mode === "cancelled" ? "cancelled" : "rejected");
    expect(f.notice).not.toHaveBeenCalled();
    expect(f.order).not.toContain("noticed");
  });

  // Queued work is not yet actionable; aborting it must not flash a second notice while a previous call settles.
  it("does not notice a sequential call cancelled while queued", async () => {
    let entered!: () => void, release!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    const f = setup({ execute: async () => { entered(); await gate; } });
    const controller = new AbortController();
    const running = f.run([direct, { ...direct, callId: "queued" }], controller.signal);
    await started;
    controller.abort(); release();
    expect((await running).map(outcome => outcome.kind).sort()).toEqual(["cancelled", "succeeded"]);
    expect(f.notice).toHaveBeenCalledTimes(1);
  });

  // Script children use local progress observers but still share the same host notice sink as direct operations.
  it("notices script child operations without requiring a direct model call", async () => {
    const f = setup();
    const outcomes = await f.run([{ callId: "script", name: "resource_script", arguments: {
      code: 'return await resources.get("r").prompt({ args: {} });',
    } }]);
    expect(outcomes[0]?.kind).toBe("succeeded");
    expect(f.notice).toHaveBeenCalledTimes(1);
  });
});
