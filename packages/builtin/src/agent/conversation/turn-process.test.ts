import { describe, expect, it } from "vitest";
import type { ModelCompletion, ModelLiveBlock } from "@asterism-app/sdk/contracts";
import { ContextSummary } from "@asterism-app/builtin-api/contracts";
import { sessionSnapshot } from "../../../../../src/plugins/records";
import { nodeView } from "../../../../../src/session/view";
import { agentSource, call, event, message, node, text, thinking } from "../../../../../src/session/test-nodes";
import type { InlineFeedback } from "../feedback";
import { displayedTimeline, savedTimeline, withLive } from "./timeline";
import { groupTurnProcesses, visibleTurnProcesses } from "./turn-process";

const completion = { finishReason: "stop", rawFinishReason: null, providerResponseId: null,
  usage: { input: 100, output: 20, total: 120, cacheRead: null, cacheWrite: null, reasoning: null } } satisfies ModelCompletion;
function project(path: ReturnType<typeof node>[], running = false, live: readonly ModelLiveBlock[] = [], feedback: readonly InlineFeedback[] = []) {
  const snapshot = sessionSnapshot(nodeView("s", "", path, path.at(-1)?.id ?? null));
  return groupTurnProcesses(displayedTimeline(withLive(savedTimeline(snapshot, "a", running, feedback), live)), running);
}
const ids = (grouped: ReturnType<typeof project>, open: readonly string[] = []) =>
  visibleTurnProcesses(grouped, new Set(open)).map(item => item.id);

describe("Execution process folding for settled turns", () => {
  // The final response may contain multiple body blocks interleaved with thinking; identify it by the last completed response to avoid missing blocks or treating earlier text as the result.
  it("Collapses all process items while preserving every body block of the final response, and restores original items above the summary when expanded", () => {
    const path = [
      node("u", null, message("a", "Work")),
      node("progress", "u", text("a", "work", 0, "Inspecting")),
      node("tool", "progress", call("a", "work", 1, "read")),
      node("thinking", "tool", thinking("a", "final", 0, "Reasoning")),
      node("part2", "thinking", text("a", "final", 2, "Second", { completion })),
      node("part1", "part2", text("a", "final", 1, "First")),
    ];
    const grouped = project(path);
    expect(ids(grouped)).toEqual(["u", "turn-process:u", "part1", "part2", "turn-metrics:u"]);
    expect(ids(grouped, [...grouped.processIds]))
      .toEqual(["u", "progress", "tool", "thinking", "turn-process:u", "part1", "part2", "turn-metrics:u"]);
    expect(grouped.items.find(item => item.kind === "turn-process")).toMatchObject({ toolCount: 1, incomplete: false });
    expect(grouped.owners.get(JSON.stringify(["work", 1]))).toBe("turn-process:u");
    expect(grouped.owners.has(JSON.stringify(["final", 1]))).toBe(false);
  });

  // Same-turn steer messages must not disappear with the process or split it into two turns; errors must remain directly readable with accessible details.
  it("Supplemental messages and errors remain visible, and expansion preserves their order relative to process items", () => {
    const path = [
      node("u", null, message("a", "Work")),
      node("progress", "u", text("a", "work", 0, "Inspecting")),
      node("steer", "progress", message("a", "Correction", false)),
      node("tool", "steer", call("a", "work2", 0, "read")),
      node("reply", "tool", text("a", "final", 0, "Done", { completion })),
    ];
    const feedback: InlineFeedback[] = [
      { id: "error", afterNodeId: "progress", origin: "model", level: "error", code: "provider_error", message: "HTTP 429" },
    ];
    const grouped = project(path, false, [], feedback);
    expect(ids(grouped)).toEqual(["u", "error", "steer", "turn-process:u", "reply", "turn-metrics:u"]);
    expect(ids(grouped, [...grouped.processIds]))
      .toEqual(["u", "progress", "error", "steer", "tool", "turn-process:u", "reply", "turn-metrics:u"]);
  });

  // ask_user may wait after process items have already been persisted; completion of one tool or body block does not mean the turn has settled.
  it("Historical turns can collapse, while turns awaiting interaction and their live tools remain visible", () => {
    const path = [
      node("old", null, message("a", "Earlier")),
      node("old-tool", "old", call("a", "old-work", 0, "read")),
      node("old-reply", "old-tool", text("a", "old-final", 0, "Done", { completion })),
      node("u", "old-reply", message("a", "Work")),
      node("progress", "u", text("a", "work", 0, "Need your answer")),
    ];
    const live: ModelLiveBlock = { id: "question", responseId: "work", ordinal: 1, kind: "toolcall",
      name: "ask_user", arguments: {}, argumentsText: "{}", state: "executing", invocation: null, result: null };
    const grouped = project(path, true, [live]);
    expect(ids(grouped)).toEqual(["old", "turn-process:old", "old-reply", "turn-metrics:old", "u", "progress", "question"]);
    expect(grouped.owners.has(JSON.stringify(["work", 1]))).toBe(false);
  });

  // Stopping leaves no final reply; resuming continues the original turn, whose process must reappear, with folding offered again only when the turn settles anew.
  it("Interruption collapses process items and preserves feedback; resuming restores the original stream without presenting partial output as a final reply", () => {
    const path = [
      node("u", null, message("a", "Work")),
      node("partial", "u", text("a", "cut", 0, "Partial", { complete: false })),
    ];
    const feedback: InlineFeedback[] = [
      { id: "stopped", afterNodeId: "partial", origin: "model", level: "error", code: "interrupted", message: "Stopped" },
    ];
    const stopped = project(path, false, [], feedback);
    expect(ids(stopped)).toEqual(["u", "turn-process:u", "stopped", "turn-metrics:u"]);
    expect(stopped.items.find(item => item.kind === "turn-process")).toMatchObject({ incomplete: true });
    expect(ids(project(path, true, [], feedback))).toEqual(["u", "partial", "stopped"]);
    path.push(node("done", "partial", text("a", "resumed", 0, "Done", { completion })));
    expect(ids(project(path, false, [], feedback))).toEqual(["u", "turn-process:u", "stopped", "done", "turn-metrics:u"]);
  });

  // Compression markers represent events and do not participate in process folding; a fold button should not appear out of nowhere when there is no body text.
  it("A turn containing only compression retains its independent marker and errors, and the next turn does not absorb it", () => {
    const path = [
      node("u", null, message("a", "Work")),
      node("summary", "u", event(ContextSummary.id, { summary: "Context", keptFrom: "u", model: "p/m",
        tokensBefore: 1000, completion }, { source: agentSource("a") })),
    ];
    const feedback: InlineFeedback[] = [
      { id: "error", afterNodeId: "summary", origin: "model", level: "error", code: "provider_error", message: "HTTP 429" },
    ];
    expect(ids(project(path, true, [], feedback))).toEqual(["u", "summary", "error"]);
    expect(ids(project(path, false, [], feedback))).toEqual(["u", "summary", "error"]);
    path.push(node("next", "summary", message("a", "Next")));
    path.push(node("reply", "next", text("a", "final", 0, "Done", { completion })));
    const grouped = project(path, false, [], feedback);
    expect(ids(grouped)).toEqual(["u", "summary", "error", "next", "reply", "turn-metrics:next"]);
    expect(grouped.processIds.size).toBe(0);
  });

  // Compression may also follow a normal final response; organizing final body text must not move compression markers before the reply or fold them into the process.
  it("Compression during the process and after the reply both remain visible in their original relative order", () => {
    const summary = (keptFrom: string) => event(ContextSummary.id, { summary: "Internal summary", keptFrom,
      model: "p/m", tokensBefore: 1000, completion }, { source: agentSource("a") });
    const path = [
      node("u", null, message("a", "Work")),
      node("tool", "u", call("a", "work", 0, "read")),
      node("before", "tool", summary("u")),
      node("reply", "before", text("a", "final", 0, "Done", { completion })),
      node("after", "reply", summary("reply")),
    ];
    expect(ids(project(path))).toEqual(["u", "turn-process:u", "before", "reply", "after", "turn-metrics:u"]);
    expect(ids(project(path), ["turn-process:u"])).toEqual(["u", "tool", "turn-process:u", "before", "reply", "after", "turn-metrics:u"]);
  });

  // A direct answer has nothing to hide, while a thinking-only completion has no final body; neither may generate fabricated output.
  it("Direct answers omit empty summaries; without a final body, the summary still opens the actual process", () => {
    const direct = [node("u", null, message("a", "Hello")), node("reply", "u", text("a", "final", 0, "Hello", { completion }))];
    expect(ids(project(direct))).toEqual(["u", "reply", "turn-metrics:u"]);
    const reasoning = [direct[0]!, node("thinking", "u", thinking("a", "final", 0, "Reasoning", { completion }))];
    const grouped = project(reasoning);
    expect(ids(grouped)).toEqual(["u", "turn-process:u", "turn-metrics:u"]);
    expect(ids(grouped, [...grouped.processIds])).toEqual(["u", "thinking", "turn-process:u", "turn-metrics:u"]);
  });
});
