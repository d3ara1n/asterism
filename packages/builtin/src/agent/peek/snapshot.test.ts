import { describe, expect, it } from "vitest";
import { ContextSummary } from "@asterism/builtin-api/contracts";
import { sessionView } from "../../../../../src/plugins/records.ts";
import { nodeView } from "../../../../../src/session/view.ts";
import { agentSource, attached, call, event, message, node, text, thinking } from "../../../../../src/session/test-nodes.ts";
import type { NewNode } from "../../../../../src/shared/session.ts";
import { projectPeekRecords, peekOverview } from "./snapshot.ts";
import { retrieve } from "./retrieval.ts";

function snapshot(...values: NewNode[]) {
  const path = values.map((value, index) => node(String(index), index ? String(index - 1) : null, value));
  return sessionView(nodeView("s", "", path, path.at(-1)?.id ?? null));
}
const summary = event(ContextSummary.id, {
  summary: "Compressed history", keptFrom: "1", model: "p/m", tokensBefore: 100,
  completion: { usage: null, finishReason: "stop", rawFinishReason: null, providerResponseId: null },
}, { source: agentSource("a") });

// 代理调查契约：记录投影保留原文、时间线顺序和状态，访问范围封闭在目标快照。
describe("peek 记录投影与检索", () => {
  it("压缩前原文和不完整记录仍可读，其他代理及私有事件不进入投影", () => {
    const records = projectPeekRecords(snapshot(
      message("a", "Original decision"), message("b", "Other agent"),
      call("a", "r", 1, "c", { arguments: { path: "/saved/path" }, outcome: { kind: "failed", data: { diff: "Evidence" },
        error: { code: "failed", message: "Failed" }, model: [{ kind: "text", text: "Saved result" }] } }),
      attached("a", "during"), text("a", "r", 0, "Partial answer", { complete: false }),
      summary, attached("b", "other"), event("private", { secret: "Private event" }),
    ), "a", false);
    expect(records.map(record => [record.id, record.kind])).toEqual([
      ["0", "user"], ["2", "tool"], ["3", "context"], ["4", "assistant"], ["5", "summary"],
    ]);
    expect(records[0]!.text).toBe("Original decision");
    expect(records[1]).toMatchObject({ status: "failed", text: expect.stringContaining("Evidence") });
    expect(records[3]).toMatchObject({ status: "incomplete", text: "Partial answer" });
    expect(JSON.stringify(records)).not.toMatch(/Other agent|other attached|Private event/);
  });

  it("思考默认在概览、搜索和读取中一致排除；显式纳入也只读取公开文字", () => {
    const view = snapshot(thinking("a", "r", 0, "Readable reasoning", {
      summary: "Thinking summary", continuation: { anthropic: { signature: "secret-signature" } },
    }));
    const excluded = projectPeekRecords(view, "a", false);
    expect(excluded).toEqual([]);
    expect(retrieve(excluded, { name: "read_records", callId: "read", arguments: { id: "0" } }).result.outcome.kind).toBe("rejected");
    const admitted = projectPeekRecords(view, "a", true);
    expect(admitted[0]!.text).toContain("Readable reasoning");
    expect(admitted[0]!.text).toContain("Thinking summary");
    expect(JSON.stringify(admitted)).not.toContain("secret-signature");
  });

  it("概览省略仍可枚举及分页读取，查询越界返回具型错误", () => {
    const records = projectPeekRecords(snapshot(message("a", "First evidence"), message("a", "Second EVIDENCE")), "a", false);
    expect(peekOverview(records, 0)).toContain("Recent entries shown: 0");
    const first = retrieve(records, { name: "search_records", callId: "s1", arguments: { query: "evidence", limit: 1 } });
    expect(first.ids).toEqual(["0"]);
    expect(first.result.outcome.data).toMatchObject({ nextCursor: 1 });
    expect(retrieve(records, { name: "search_records", callId: "s2", arguments: { query: "", cursor: 1 } }).ids).toEqual(["1"]);
    const part = retrieve(records, { name: "read_records", callId: "r1", arguments: { id: "0", limit: 6 } });
    expect(part.result.outcome.data).toMatchObject({ text: "First ", nextOffset: 6 });
    expect(retrieve(records, { name: "read_records", callId: "r2", arguments: { id: "0", offset: 6 } }).result.outcome.data)
      .toMatchObject({ text: "evidence", nextOffset: null });
    expect(retrieve(records, { name: "read_records", callId: "bad", arguments: { id: "other-agent" } }).result.outcome.kind).toBe("rejected");
  });
});
