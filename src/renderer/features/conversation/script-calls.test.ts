import { describe, expect, it } from "vitest";
import type { ScriptCall } from "../../../tools/core";
import { groupScriptCalls, scriptCallTotals } from "./script-calls";

const docs = { id: "docs", kind: "directory", title: "Docs" };
const notes = { id: "notes", kind: "directory", title: "Notes" };
let next = 0;
const call = (fields: Partial<ScriptCall>): ScriptCall =>
  ({ id: `s/${next++}`, name: "resource_call", tool: "read", kind: "succeeded", ...fields });

describe("Script call grouping", () => {
  it("merges calls by tool and resource in first-submission order", () => {
    const groups = groupScriptCalls([
      call({ resource: docs }), call({ resource: notes }), call({ tool: "write", resource: docs }), call({ resource: docs }),
    ]);
    expect(groups.map(group => [group.call.tool, group.call.resource?.id, group.count])).toEqual([
      ["read", "docs", 2], ["read", "notes", 1], ["write", "docs", 1],
    ]);
  });

  it("reports the most severe settled outcome and each distinct diagnostic once", () => {
    const [group] = groupScriptCalls([
      call({ resource: docs }),
      call({ resource: docs, kind: "partial", message: "Truncated." }),
      call({ resource: docs, kind: "failed", error: { code: "missing", message: "Not found." } }),
      call({ resource: docs, kind: "failed", error: { code: "missing", message: "Not found." } }),
    ]);
    expect(group?.worst).toBe("failed");
    expect(group?.settled).toEqual({ succeeded: 1, partial: 1, failed: 2 });
    expect(group?.diagnostics).toEqual(["Truncated.", "Not found."]);
  });

  it("spans the earliest start and leaves the finish open while any call runs", () => {
    const calls = [
      call({ resource: docs, startedAt: 200, finishedAt: 300 }),
      call({ resource: docs, startedAt: 100, finishedAt: 400 }),
    ];
    expect(groupScriptCalls(calls)[0]).toMatchObject({ startedAt: 100, finishedAt: 400 });
    const running = groupScriptCalls([...calls, call({ resource: docs, kind: "running", startedAt: 350 })])[0];
    expect(running?.startedAt).toBe(100);
    expect(running).not.toHaveProperty("finishedAt");
  });

  it("counts error and warning outcomes among settled calls only", () => {
    expect(scriptCallTotals([
      call({}), call({ kind: "rejected" }), call({ kind: "unknown" }), call({ kind: "partial" }),
      call({ kind: "cancelled" }), call({ kind: "running" }), call({ kind: "queued" }),
    ])).toEqual({ total: 7, settled: 5, failed: 2, partial: 1 });
  });
});
