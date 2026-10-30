import { describe, expect, it } from "vitest";
import type { Json, ModelLiveBlock } from "@asterism-app/sdk/contracts";
import { activityOf } from "./activity.ts";
import type { ProcessBlock } from "./contract.ts";

const source = { model: "test/model", adapter: "test", scope: "test" };
function tool(responseId: string, ordinal: number, name: string, args: Json,
  outcome: "succeeded" | "failed" | null = "succeeded"): ProcessBlock {
  return { responseId, requestParentId: null, ordinal, complete: true, continuation: null, source,
    kind: "toolcall", callId: `${responseId}-${ordinal}`, name, argumentsText: null, arguments: args,
    outcome: outcome === null ? null : outcome === "succeeded"
      ? { kind: "succeeded", data: null, model: [] } : { kind: "failed", data: null, error: { code: "x", message: "x" }, model: [] } } as ProcessBlock;
}
function thinking(responseId: string, ordinal: number): ProcessBlock {
  return { responseId, requestParentId: null, ordinal, complete: true, continuation: null, source,
    kind: "thinking", text: "…", summary: "" } as ProcessBlock;
}

describe("Subagent activity log", () => {
  // Parallel tool calls finalize in completion order; the log must follow the response's own order.
  it("orders steps by response then ordinal and places steering before the response that received it", () => {
    const blocks = [thinking("r1", 0), tool("r1", 2, "grep", { pattern: "auth" }), tool("r1", 1, "read", { path: "src/a.ts" }, "failed"),
      tool("r2", 0, "resource_call", { resource_id: "note", tool: "read", target: null, args: { section: "intro" } })];
    expect(activityOf(blocks, [], [{ at: 0, text: "First" }, { at: 3, text: "Second" }])).toEqual([
      { kind: "steer", text: "First" },
      { kind: "thinking", state: "done" },
      { kind: "tool", name: "read", implementation: null, subject: "src/a.ts", state: "failed" },
      { kind: "tool", name: "grep", implementation: null, subject: "auth", state: "succeeded" },
      { kind: "steer", text: "Second" },
      { kind: "tool", name: "read", implementation: null, subject: "intro", state: "succeeded" },
    ]);
  });

  // A live block that has also been finalized must appear once, with its final state.
  it("adds only unfinalized live steps and marks a finalized call without outcome as cancelled", () => {
    const live: ModelLiveBlock[] = [
      { id: "a", responseId: "r1", ordinal: 0, kind: "toolcall", name: "exec", argumentsText: "", arguments: { command: "ls" },
        state: "executing", invocation: null, result: null },
      { id: "b", responseId: "r1", ordinal: 1, kind: "thinking", text: "", startedAt: 0, endedAt: null },
      { id: "c", responseId: "r1", ordinal: 2, kind: "text", text: "Report", endedAt: null },
    ];
    expect(activityOf([tool("r1", 0, "exec", { command: "ls" }, null)], live, [{ at: 1, text: "Late" }])).toEqual([
      { kind: "tool", name: "exec", implementation: null, subject: "ls", state: "cancelled" },
      { kind: "steer", text: "Late" },
      { kind: "thinking", state: "running" },
    ]);
  });
});
