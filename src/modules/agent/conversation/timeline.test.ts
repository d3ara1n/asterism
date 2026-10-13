import { describe, expect, it } from "vitest";
import { sessionSnapshot } from "../../../plugins/records";
import { emptyCompletion, type SessionNode } from "../../../shared/session";
import { conversationTimeline, timelineKey } from "./timeline";

const base = { sessionId: "s", createdAt: "2026-10-12T00:00:00Z", source: { plugin: "atelier.core", resource: { id: "a", kind: "atelier.core/agent" } } };
describe("代理的具型记录视图", () => {
  it("同一块从内存转入历史时展示身份不变，过渡快照不重复展示", () => {
    const live = { id: "r:0", responseId: "r", ordinal: 0, kind: "thinking" as const, text: "thinking", startedAt: 1000 };
    const saved: SessionNode = { ...base, ...emptyCompletion, id: "saved-id", parentId: null, kind: "thinking", text: live.text,
      responseId: "r", ordinal: 0, requestParentId: null, model: "p/m", complete: true, continuation: null, adapter: "test", scope: "s" };
    const before = conversationTimeline(sessionSnapshot("s", "", [], [], false), "a", [live]);
    const after = conversationTimeline(sessionSnapshot("s", "", [saved], [saved], false), "a", [live]);
    expect(before.map(timelineKey)).toEqual(after.map(timelineKey));
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ id: saved.id, kind: "thinking", text: "thinking", complete: true });
  });

  it("挂在当前路径的未完成块保留，其他分支与代理隐藏；空响应通知保留用量", () => {
    const message: SessionNode = { ...base, id: "input", parentId: null, kind: "message", parts: [{ kind: "text", text: "Question" }] };
    const block: SessionNode = { ...base, ...emptyCompletion, id: "partial", parentId: message.id, kind: "text", text: "Partial",
      responseId: "r", ordinal: 0, requestParentId: message.id, model: "p/m", complete: false, continuation: null, adapter: "test", scope: "s" };
    const notice: SessionNode = { ...base, id: "notice", parentId: message.id, kind: "notice", code: "empty_response", message: "Empty", level: "error",
      response: { responseId: "empty", requestParentId: message.id, model: "p/m", finishReason: "stop", rawFinishReason: null, providerResponseId: null,
        usage: { input: 4, output: 0, total: 4, reasoning: null, cacheRead: null, cacheWrite: null } } };
    const nodes = [message, block, { ...block, id: "other-agent", source: { plugin: "atelier.core", resource: { id: "b", kind: "atelier.core/agent" } } }, { ...block, id: "other-branch", parentId: "elsewhere" }, notice];
    const timeline = conversationTimeline(sessionSnapshot("s", "", nodes, [message, notice], false), "a", []);
    expect(timeline.map(item => item.id)).toEqual([message.id, block.id, notice.id]);
    expect(timeline.at(-1)).toMatchObject({ kind: "notice", response: { usage: { input: 4, output: 0 } } });
  });
});
