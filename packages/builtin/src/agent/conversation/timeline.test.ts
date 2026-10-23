import { describe, expect, it } from "vitest";
import { sessionSnapshot } from "../../../../../src/plugins/records";
import { nodeView } from "../../../../../src/session/view";
import { node, text, thinking, message as input, notice as noticeNode } from "../../../../../src/session/test-nodes";
import type { ModelLiveBlock, SessionSnapshot } from "@atelier/sdk/contracts";
import { displayedTimeline, generating, mountedTimelineIndexes, savedTimeline, timelineKey, withLive } from "./timeline";

/** 与代理卡片相同的两层组合：已保存部分加实时块。 */
const conversationTimeline = (snapshot: SessionSnapshot, agentId: string, live: readonly ModelLiveBlock[], running = live.length > 0) =>
  withLive(savedTimeline(snapshot, agentId, running), live);

describe("代理的具型记录视图", () => {
  // docs/workbench.md：显示来源读取结构化 sender，正文内的信封字样不决定归属。
  it("输入视图保留代理来源及原始正文，用户写入的标签仍是用户消息", () => {
    const sender = { kind: "agent" as const, resource: { sessionId: "s", id: "relay", kind: "example/relay" }, name: "Reviewer" };
    const body = "<agent-message>Literal text</agent-message>";
    const nodes = [node("external", null, input("a", body, true, sender)), node("user", "external", input("a", body))];
    const timeline = conversationTimeline(sessionSnapshot(nodeView("s", "", nodes, "user")), "a", []);
    expect(timeline).toMatchObject([
      { kind: "message", sender, parts: [{ text: body }] },
      { kind: "message", sender: { kind: "user" }, parts: [{ text: body }] },
    ]);
  });

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

  it("当前路径包含未完成块和执行通知，其他分支与代理隐藏", () => {
    const message = node("input", null, input("a", "Question"));
    const block = node("partial", message.id, text("a", "r", 0, "Partial", { complete: false, requestParentId: message.id }));
    const notice = node("notice", block.id, noticeNode("a", "interrupted", "The response was interrupted.", "error"));
    const nodes = [message, block, { ...block, id: "other-agent", source: { plugin: "atelier.builtin", resource: { sessionId: "s", id: "b", kind: "atelier.builtin/agent" } } }, { ...block, id: "other-branch", parentId: "elsewhere" }, notice];
    const timeline = conversationTimeline(sessionSnapshot(nodeView("s", "", nodes, notice.id)), "a", []);
    expect(timeline.map(item => item.id)).toEqual([message.id, block.id, notice.id, "turn-metrics:input"]);
    expect(timeline.find(item => item.kind === "notice")).toMatchObject({ kind: "notice", code: "interrupted" });
  });

  // docs/workbench.md#对话计量：同轮多个请求只有一份尾部概要，历史概要不因下一轮执行而消失。
  it("各轮计量插入对应轮尾，运行中只隐藏当前轮的概要", () => {
    const completion = { finishReason: "stop", rawFinishReason: null, providerResponseId: null,
      usage: { input: 100, output: 10, total: 110, cacheRead: 50, cacheWrite: null, reasoning: null } };
    const nodes = [
      node("u1", null, input("a", "First")),
      node("a1", "u1", text("a", "r1", 0, "First part", { completion })),
      node("a2", "a1", text("a", "r2", 0, "Second part", { completion })),
      node("u2", "a2", input("a", "Next")),
      node("a3", "u2", text("a", "r3", 0, "Latest", { completion })),
    ];
    const snapshot = sessionSnapshot(nodeView("s", "", nodes, "a3"));
    const running = conversationTimeline(snapshot, "a", [], true);
    expect(running.map(item => item.id)).toEqual(["u1", "a1", "a2", "turn-metrics:u1", "u2", "a3"]);
    expect(running.find(item => item.kind === "turn-metrics")).toMatchObject({ metrics: { count: 2, usage: { output: { value: 20 } } }, replyMarkdown: "Second part" });
    const settled = conversationTimeline(snapshot, "a", [], false);
    expect(settled.map(item => item.id)).toEqual(["u1", "a1", "a2", "turn-metrics:u1", "u2", "a3", "turn-metrics:u2"]);
    expect(settled.at(-1)).toMatchObject({ kind: "turn-metrics", metrics: { count: 1 }, replyMarkdown: "Latest" });
  });

  // 成型块落库后也带 endedAt=null（未结束即收束）；只有实时块才算生成中，否则中断的块会永远以流式渲染、计时不停。
  it("已保存的未结束块保留生成起止但不算生成中，实时块未结束才算", () => {
    const saved = node("cut", null, thinking("a", "r", 0, "partial", { complete: false }));
    Object.assign((saved.data as { block: object }).block, { startedAt: 1000, endedAt: null });
    const [item] = conversationTimeline(sessionSnapshot(nodeView("s", "", [saved], saved.id)), "a", []);
    expect(item).toMatchObject({ kind: "thinking", startedAt: 1000, endedAt: null });
    expect(generating(item!)).toBe(false);
    const live = { id: "r2:0", responseId: "r2", ordinal: 0, kind: "thinking" as const, text: "t", startedAt: 1000, endedAt: null };
    expect(generating(live)).toBe(true);
    expect(generating({ ...live, endedAt: 2000 })).toBe(false);
  });

  // 虚拟列表卸载实时块会重放流式动画并丢失进行中的状态；末项是跟随输出的锚点。
  it("实时块与末项始终挂载，已保存条目随滚动回收；空思考块不占列表位置", () => {
    const nodes = [node("u1", null, input("a", "First")), node("a1", "u1", text("a", "r1", 0, "Saved"))];
    const snapshot = sessionSnapshot(nodeView("s", "", nodes, "a1"));
    const live = [
      { id: "r2:0", responseId: "r2", ordinal: 0, kind: "thinking" as const, text: " ", startedAt: 1, endedAt: null },
      { id: "r2:1", responseId: "r2", ordinal: 1, kind: "text" as const, text: "Live", endedAt: null },
    ];
    const items = displayedTimeline(conversationTimeline(snapshot, "a", live, true));
    expect(items.map(timelineKey)).toEqual(["u1", timelineKey(items[1]!), JSON.stringify(["r2", 1])]);
    expect(mountedTimelineIndexes(items)).toEqual([2]);
    expect(mountedTimelineIndexes(items.slice(0, 2))).toEqual([1]);
    expect(mountedTimelineIndexes([])).toEqual([]);
  });
});
