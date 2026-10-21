import { describe, expect, it } from "vitest";
import { projectForAgent } from "./projection.ts";
import { sessionView } from "../../../../src/plugins/records.ts";
import { nodeView } from "../../../../src/session/view.ts";
import { attached, call, event, message, node, text, thinking } from "../../../../src/session/test-nodes.ts";
import type { NewNode, SessionNode } from "../../../../src/shared/session.ts";
import { projectPeekRecords } from "./peek/snapshot.ts";
import { contextInsight } from "./context/insight.ts";
import { serializeForSummary } from "./compression-prompt.ts";
import { sessionSnapshot } from "../../../../src/plugins/records.ts";

function records(...values: NewNode[]): SessionNode[] {
  return values.map((value, index) => node(String(index), index ? String(index - 1) : null, value));
}
const project = (path: SessionNode[], agent = "a") => projectForAgent(sessionView(nodeView("s", "", path, path.at(-1)?.id ?? null)), agent);

// 预期来自时间线投影契约；存储、路径选择和通用信封转换由各自边界守护。
describe("代理模型投影", () => {
  // docs/runtime.md#代理通信：地址允许中继类型，身份与正文分别转义，UI 与历史调查消费同一保存来源。
  it("中继资源与具名代理的信封只在模型投影生成，展示保留原文与来源", () => {
    const sender = { kind: "agent" as const, resource: { sessionId: "s", id: "relay", kind: "example/relay" }, name: '审查 "A" & B' };
    const body = "  <agent-message>raw & text</agent-message>\n";
    const path = records(message("a", "User"), message("a", body, false, sender));
    const snapshot = sessionSnapshot(nodeView("s", "", path, "1"));
    const projected = project(path);
    expect(projected[1]).toEqual({ kind: "input", parts: [
      { kind: "text", text: '<agent-message sender-id="relay" sender-name="审查 &quot;A&quot; &amp; B">' },
      { kind: "text", text: "  &lt;agent-message&gt;raw &amp; text&lt;/agent-message&gt;\n" },
      { kind: "text", text: "</agent-message>" },
    ] });
    expect(projectPeekRecords(snapshot, "a", false).at(-1)).toMatchObject({ kind: "agent", text: expect.stringContaining('sender-id="relay"') });
    expect(contextInsight(snapshot, "a").conversation.characters).toMatchObject({ user: 4, agentMessage: expect.any(Number) });
    expect(contextInsight(snapshot, "a").conversation.characters.agentMessage).toBeGreaterThan(body.length);
    expect(serializeForSummary(projected)).toContain('[Input]: <agent-message sender-id="relay"');
    expect(path[1]!.data).toMatchObject({ sender, parts: [{ text: body }] });
  });

  // 公共载荷经过 Execution 解码和重建后，摘要与全文仍须独立，不能由展示选择覆写。
  it("历史思考保留独立的全文、摘要和续接资料", () => {
    const continuation = { openai: { reasoningEncryptedContent: "cipher" } };
    const path = records(
      message("a", "go"),
      thinking("a", "r", 0, "Full thought", { summary: "Summary", continuation, requestParentId: "0" }),
      text("a", "r", 1, "Answer", { requestParentId: "0" }),
    );
    expect(project(path)[1]).toMatchObject({ kind: "output", parts: [
      { kind: "thinking", text: "Full thought", summary: "Summary", continuation },
      { kind: "text", text: "Answer" },
    ] });
  });
  it("请求起点后的事件置于响应之后，下一请求保留已发送前缀", () => {
    const path = records(message("a", "go"), attached("a", "before"));
    const sent = project(path);
    path.push(node("during", "1", attached("a", "during")));
    path.push(node("tool", "during", call("a", "r1", 0, "c1", { requestParentId: "1" })));
    const next = project(path);
    expect(next.slice(0, sent.length)).toEqual(sent);
    expect(next.slice(sent.length).map(item => item.kind)).toEqual(["output", "result", "context"]);
    path.push(node("later", "tool", attached("a", "later")));
    path.push(node("answer", "later", text("a", "r2", 0, "answer", { requestParentId: "tool" })));
    const final = project(path);
    expect(final.slice(0, next.length)).toEqual(next);
    expect(final.slice(next.length).map(item => item.kind)).toEqual(["output", "context"]);
    expect(project(path.slice(0, 3)).at(-1)).toMatchObject({ kind: "context", parts: [{ kind: "text", text: "during attached" }] });
  });

  it("请求起点可以属于其他代理，各代理只投影自身记录与模型可见事件", () => {
    const path = records(
      message("a", "for A"), message("b", "for B"),
      event("resource_attached", { id: "shared" }, { model: "shared attached", recipient: null }),
      event("example.plugin/private", { title: "not model content" }),
      text("a", "ra", 0, "A", { requestParentId: "1" }),
      text("b", "rb", 0, "B", { requestParentId: "1" }),
    );
    for (const agent of ["a", "b"]) {
      const items = project(path, agent);
      expect(items.map(item => item.kind)).toEqual(["input", "output", "context"]);
      expect(items[0]).toMatchObject({ parts: [{ text: agent === "a" ? "for A" : "for B" }] });
      expect(items[1]).toMatchObject({ parts: [{ text: agent.toUpperCase() }] });
    }
  });

  it("响应按 ordinal 归组，工具结果随后，期间事件延后且其他代理输出不可见", () => {
    const path = records(
      message("a", "go"),
      call("a", "r1", 1, "c2", { requestParentId: "0" }),
      attached("a", "dir"), text("b", "rb", 0, "other agent"),
      call("a", "r1", 0, "c1", { requestParentId: "0" }),
    );
    expect(project(path).map(item => item.kind === "output"
      ? item.parts.map(part => part.kind === "toolcall" ? part.callId : part.kind).join()
      : item.kind === "result" ? item.callId : item.kind)).toEqual(["input", "c1,c2", "c1", "c2", "context"]);
  });

  it("只投影查看路径上的调用，每个调用都有对应结果", () => {
    const path = records(message("a", "go"), call("a", "r1", 0, "c1"), call("a", "r1", 1, "c2"));
    const items = project(path.slice(0, 2));
    expect(items.filter(item => item.kind === "result").map(item => item.callId)).toEqual(["c1"]);
  });

  it("末尾思考不作为续接输出结尾", () => {
    expect(project(records(message("a", "go"), thinking("a", "r1", 0, "reasoning"))).map(item => item.kind)).toEqual(["input"]);
  });
});
