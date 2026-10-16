import { describe, expect, it } from "vitest";
import { sessionSnapshot } from "../../../../../src/plugins/records";
import { nodeView } from "../../../../../src/session/view";
import { node, text, thinking, message as input, notice as noticeNode } from "../../../../../src/session/test-nodes";
import { conversationTimeline, timelineKey } from "./timeline";

const base = { sessionId: "s", createdAt: "2026-10-12T00:00:00Z", source: { plugin: "atelier.builtin", resource: { sessionId: "s", id: "a", kind: "atelier.builtin/agent" } } };
describe("代理的具型记录视图", () => {
  // 模型可能只交付思考摘要；显示转换须保留可读内容，但不能改写历史里的明文／摘要字段。
  it("只有摘要的思考块仍可阅读", () => {
    const saved = node("summary-only", null, thinking("a", "r", 0, "", { summary: "Saved reasoning summary" }));
    const timeline = conversationTimeline(sessionSnapshot(nodeView("s", "", [saved], saved.id)), "a", []);
    expect(timeline[0]).toMatchObject({ kind: "thinking", text: "Saved reasoning summary", summary: "Saved reasoning summary" });
    expect(saved.data).toMatchObject({ block: { text: "", summary: "Saved reasoning summary" } });
  });
  it("同一块从内存转入历史时展示身份不变，过渡快照不重复展示", () => {
    const live = { id: "r:0", responseId: "r", ordinal: 0, kind: "thinking" as const, text: "thinking", startedAt: 1000, endedAt: null };
    const saved = node("saved-id", null, thinking("a", "r", 0, live.text));
    const before = conversationTimeline(sessionSnapshot(nodeView("s", "", [], null)), "a", [live]);
    const after = conversationTimeline(sessionSnapshot(nodeView("s", "", [saved], saved.id)), "a", [live]);
    expect(before.map(timelineKey)).toEqual(after.map(timelineKey));
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ id: saved.id, kind: "thinking", text: "thinking", complete: true });
  });

  it("当前路径包含未完成块，其他分支与代理隐藏；空响应通知保留用量", () => {
    const message = node("input", null, input("a", "Question"));
    const block = node("partial", message.id, text("a", "r", 0, "Partial", { complete: false, requestParentId: message.id }));
    const notice = node("notice", block.id, noticeNode("a", "empty_response", "Empty", "error", { response: { responseId: "empty", requestParentId: message.id, model: "p/m", finishReason: "stop", rawFinishReason: null, providerResponseId: null,
      usage: { input: 4, output: 0, total: 4, reasoning: null, cacheRead: null, cacheWrite: null } } }));
    const nodes = [message, block, { ...block, id: "other-agent", source: { plugin: "atelier.builtin", resource: { sessionId: "s", id: "b", kind: "atelier.builtin/agent" } } }, { ...block, id: "other-branch", parentId: "elsewhere" }, notice];
    const timeline = conversationTimeline(sessionSnapshot(nodeView("s", "", nodes, notice.id)), "a", []);
    expect(timeline.map(item => item.id)).toEqual([message.id, block.id, notice.id]);
    expect(timeline.at(-1)).toMatchObject({ kind: "notice", response: { usage: { input: 4, output: 0 } } });
  });
});
