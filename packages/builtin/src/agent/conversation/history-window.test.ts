import { describe, expect, it } from "vitest";
import { ContextSummary } from "@asterism-app/builtin-api/contracts";
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

describe("Conversation reading range after compression", () => {
  // Compression events usually follow recent replies; trimming at the event would remove replies, while trimming at user input would miss valid retention points within a turn.
  it("Reloading trims at keptFrom, preserves mid-turn content and the final reply, and removes earlier turns' measurements and navigation messages together", () => {
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

  // A new summary must not abruptly remove earlier content from an open view; reusing the same in-memory reading window preserves its boundary, and only a new window adopts the latest summary.
  it("The current reading session retains its old range and adds a compression marker; reloading starts at the latest retention boundary", () => {
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

  // History navigation switches the actual path; the previous branch's compression boundary must not keep trimming content after rewinding.
  it("Rewinding and switching branches select the boundary from the target path; other agents' summaries do not change this agent's reading range", () => {
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

  // Failure and cancellation have only transient state and produce no successful summary; these states appear at their original positions, and activity outside the branch cannot enter the current conversation.
  it("Running and incomplete activities remain visible without establishing a trimming boundary", () => {
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
