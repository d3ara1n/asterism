import { describe, expect, it } from "vitest";
import { ContextSummary } from "@asterism/builtin-api/contracts";
import { sessionSnapshot } from "../../../../../src/plugins/records";
import { nodeView } from "../../../../../src/session/view";
import { agentSource, call, event, message, node, text } from "../../../../../src/session/test-nodes";
import type { CompressionActivity } from "../feedback";
import { ConversationHistoryWindow } from "./history-window";
import { savedTimeline, withLive } from "./timeline";
import { groupTurnProcesses, visibleTurnProcesses } from "./turn-process";

const completion = { finishReason: "stop", rawFinishReason: null, providerResponseId: null, usage: null } as const;
const summary = (keptFrom: string) => event(ContextSummary.id, { summary: "Internal handoff", keptFrom,
  model: "p/m", tokensBefore: 1000, completion }, { source: agentSource("a") });
const snapshot = (path: ReturnType<typeof node>[]) => sessionSnapshot(nodeView("s", "", path, path.at(-1)?.id ?? null));
function project(path: ReturnType<typeof node>[], window: ConversationHistoryWindow, compressions: readonly CompressionActivity[] = []) {
  const view = snapshot(path);
  return savedTimeline(view, "a", false, [], { boundary: window.read(view.records.all({ scope: "timeline" }), "a"), compressions });
}
const ids = (saved: ReturnType<typeof project>) => withLive(saved, []).map(item => item.id);

describe("压缩后的对话阅读范围", () => {
  // 压缩事件通常晚于近期答复；按事件位置裁剪会误删答复，按用户输入裁剪又会漏掉轮次中间的合法保留点。
  it("重载按 keptFrom 裁剪，保留轮次中段与最终答复，较早轮次的计量和导航消息一起移出", () => {
    const path = [
      node("old", null, message("a", "Earlier")),
      node("old-reply", "old", text("a", "old", 0, "Old reply", { completion })),
      node("u", "old-reply", message("a", "Work")),
      node("earlier", "u", call("a", "first", 0, "read")),
      node("kept", "earlier", call("a", "second", 0, "read")),
      node("reply", "kept", text("a", "final", 0, "Final reply", { completion })),
      node("summary", "reply", summary("kept")),
    ];
    const saved = project(path, new ConversationHistoryWindow());
    expect(ids(saved)).toEqual(["compression-boundary:summary", "kept", "reply", "turn-metrics:u"]);
    const grouped = groupTurnProcesses(withLive(saved, []), false);
    expect(visibleTurnProcesses(grouped, new Set()).map(item => item.id))
      .toEqual(["compression-boundary:summary", "turn-process:u", "reply", "turn-metrics:u"]);
    expect(visibleTurnProcesses(grouped, new Set(["turn-process:u"])).map(item => item.id))
      .toEqual(["compression-boundary:summary", "kept", "turn-process:u", "reply", "turn-metrics:u"]);
  });

  // 已打开视图收到新摘要时不能突然删掉前文；同一内存阅读窗口重复取用保持边界，新的窗口才采用最新摘要。
  it("本次阅读保留旧范围并追加压缩标记，重载后从最新保留边界开始", () => {
    const path = [node("u", null, message("a", "Work")), node("reply", "u", text("a", "final", 0, "Done", { completion }))];
    const window = new ConversationHistoryWindow();
    project(path, window);
    path.push(node("summary", "reply", summary("reply")));
    expect(ids(project(path, window))).toEqual(["u", "reply", "summary", "turn-metrics:u"]);
    expect(project(path, window).items.find(item => item.id === "summary")).toEqual({ kind: "compression", id: "summary", status: "completed" });
    const reloaded = new ConversationHistoryWindow();
    expect(ids(project(path, reloaded))).toEqual(["compression-boundary:summary", "reply", "turn-metrics:u"]);
    path.push(node("next", "summary", message("a", "Next")));
    path.push(node("next-reply", "next", text("a", "next", 0, "Next reply", { completion })));
    path.push(node("summary2", "next-reply", summary("next")));
    expect(ids(project(path, reloaded))).toEqual(["compression-boundary:summary", "reply", "turn-metrics:u", "next", "next-reply", "summary2", "turn-metrics:next"]);
    expect(ids(project(path, new ConversationHistoryWindow()))).toEqual(["compression-boundary:summary2", "next", "next-reply", "turn-metrics:next"]);
  });

  // 历史导航会切换真实路径；上一个分支的压缩边界不能继续裁掉回溯后的内容。
  it("回溯与换分支按目标路径重新选择边界，其他代理的摘要不改变本代理阅读范围", () => {
    const shared = [node("u", null, message("a", "Work")), node("reply", "u", text("a", "r", 0, "Done", { completion }))];
    const branch = [...shared, node("summary", "reply", summary("reply"))];
    const window = new ConversationHistoryWindow();
    expect(ids(project(branch, window))[0]).toBe("compression-boundary:summary");
    expect(ids(project(shared, window))).toEqual(["u", "reply", "turn-metrics:u"]);
    const other = [...shared, node("other", "reply", event(ContextSummary.id, { summary: "Other", keptFrom: "reply", model: "p/m",
      tokensBefore: 1000, completion }, { source: agentSource("b") }))];
    expect(ids(project(other, window))).toEqual(["u", "reply", "turn-metrics:u"]);
    expect(ids(project(branch, window))[0]).toBe("compression-boundary:summary");
  });

  // 失败和取消只有瞬态状态，不产生成功摘要；这些状态按原位置展示，分支外活动也不能进入当前对话。
  it("运行与未完成活动可见但不形成裁剪边界", () => {
    const path = [node("u", null, message("a", "Work"))];
    const compressions: CompressionActivity[] = [
      { id: "failed", afterNodeId: "u", status: "failed" },
      { id: "cancelled", afterNodeId: "u", status: "cancelled" },
      { id: "running", afterNodeId: "u", status: "running" },
      { id: "elsewhere", afterNodeId: "other", status: "running" },
    ];
    const saved = project(path, new ConversationHistoryWindow(), compressions);
    expect(ids(saved)).toEqual(["u", "failed", "cancelled", "running"]);
    expect(saved.items.filter(item => item.kind === "compression").map(item => item.status)).toEqual(["failed", "cancelled", "running"]);
  });
});
