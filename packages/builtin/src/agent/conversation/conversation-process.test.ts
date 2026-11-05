import { describe, expect, it } from "vitest";
import type { ModelCompletion, ModelLiveBlock } from "@asterism-app/sdk/contracts";
import { ContextSummary } from "@asterism-app/builtin-api/contracts";
import { sessionSnapshot } from "../../../../../src/plugins/records";
import { nodeView } from "../../../../../src/session/view";
import { agentSource, call, event, message, node, text, thinking } from "../../../../../src/session/test-nodes";
import type { InlineFeedback } from "../feedback";
import { displayedTimeline, savedTimeline, withLive } from "./timeline";
import { groupConversationProcesses, visibleConversationProcesses } from "./conversation-process";

const completion = { finishReason: "stop", rawFinishReason: null, providerResponseId: null,
  usage: { input: 100, output: 20, total: 120, cacheRead: null, cacheWrite: null, reasoning: null } } satisfies ModelCompletion;
function project(path: ReturnType<typeof node>[], running = false, live: readonly ModelLiveBlock[] = [], feedback: readonly InlineFeedback[] = []) {
  const snapshot = sessionSnapshot(nodeView("s", "", path, path.at(-1)?.id ?? null));
  return groupConversationProcesses(displayedTimeline(withLive(savedTimeline(snapshot.records.all({ scope: "timeline" }), "a", running, feedback), live)), running);
}
const ids = (grouped: ReturnType<typeof project>, open: readonly string[] = []) =>
  visibleConversationProcesses(grouped, new Set(open)).map(item => item.id);

describe("Conversation process folding by input groups", () => {
  // A completed final response may contain multiple body blocks interleaved with thinking; retain all body blocks in ordinal order.
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
    expect(ids(grouped)).toEqual(["u", "conversation-process:final", "part1", "part2", "turn-metrics:u"]);
    expect(ids(grouped, [...grouped.processIds]))
      .toEqual(["u", "progress", "tool", "thinking", "conversation-process:final", "part1", "part2", "turn-metrics:u"]);
    expect(grouped.items.find(item => item.kind === "conversation-process")).toMatchObject({ tools: [{ name: "read" }], incomplete: false });
    expect(grouped.owners.get(JSON.stringify(["work", 1]))).toBe("conversation-process:final");
    expect(grouped.owners.has(JSON.stringify(["final", 1]))).toBe(false);
  });

  // Steer splits presentation without splitting execution measurements; errors retain their original position.
  it("Supplemental inputs create separate processes while errors and a single turn footer remain visible", () => {
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
    expect(ids(grouped)).toEqual(["u", "conversation-process:work", "error", "steer", "conversation-process:final", "reply", "turn-metrics:u"]);
    expect(ids(grouped, [...grouped.processIds]))
      .toEqual(["u", "progress", "conversation-process:work", "error", "steer", "tool", "conversation-process:final", "reply", "turn-metrics:u"]);
  });

  // The boundary follows input position, including when the previous response completed before steer arrived.
  it.each([
    { position: "before model content", prefix: [], visible: ["u"] },
    { position: "after thinking", prefix: [
      node("reason", "u", thinking("a", "work", 0)),
    ], visible: ["u", "conversation-process:work"] },
    { position: "after tools", prefix: [
      node("reason", "u", thinking("a", "work", 0)),
      node("tool", "reason", call("a", "work", 1, "read")),
    ], visible: ["u", "conversation-process:work"] },
    { position: "before the reply", prefix: [
      node("reason", "u", thinking("a", "work", 0)),
      node("tool", "reason", call("a", "work", 1, "read")),
      node("final-reason", "tool", thinking("a", "final", 0)),
    ], visible: ["u", "conversation-process:final"] },
    { position: "after the reply", prefix: [
      node("reason", "u", thinking("a", "work", 0)),
      node("tool", "reason", call("a", "work", 1, "read")),
      node("final-reason", "tool", thinking("a", "final", 0)),
      node("reply", "final-reason", text("a", "final", 1, "First answer", { completion })),
    ], visible: ["u", "conversation-process:final", "reply"] },
  ])("Steer $position separates completed groups from the running tail without changing turn scope", ({ prefix, visible }) => {
    const path = [
      node("u", null, message("a", "Work")),
      ...prefix,
      node("steer", prefix.at(-1)?.id ?? "u", message("a", "Correction", false)),
      node("tool2", "steer", call("a", "work2", 0, "read")),
      node("reason2", "tool2", thinking("a", "final2", 0)),
      node("reply2", "reason2", text("a", "final2", 1, "Second answer", { completion })),
    ];
    expect(ids(project(path, true))).toEqual([...visible, "steer", "tool2", "reason2", "reply2"]);
    const settled = project(path);
    expect(ids(settled)).toEqual([...visible, "steer", "conversation-process:final2", "reply2", "turn-metrics:u"]);
    expect(settled.items.filter(item => item.kind === "turn-metrics")).toMatchObject([{ inputId: "u" }]);
    const second = settled.items.find(item => item.id === "conversation-process:final2");
    expect(second).toMatchObject({ tools: [{ id: "tool2" }], incomplete: false });
    expect(ids(settled, ["conversation-process:final2"]))
      .toEqual([...visible, "steer", "tool2", "reason2", "conversation-process:final2", "reply2", "turn-metrics:u"]);
  });

  // Execution turn markers can differ among batched inputs; folding groups all inputs until model content occurs.
  it("Consecutive inputs share one process regardless of sender or startsTurn", () => {
    const path = [
      node("u", null, message("a", "First")),
      node("next", "u", message("a", "Second")),
      node("event", "next", message("a", "Update", false,
        { kind: "event", name: "Schedule", resource: { sessionId: "s", id: "schedule", kind: "example/schedule" } })),
      node("tool", "event", call("a", "work", 0, "read")),
      node("reply", "tool", text("a", "final", 0, "Done", { completion })),
    ];
    expect(ids(project(path))).toEqual(["u", "next", "event", "conversation-process:final", "reply", "turn-metrics:next"]);
  });

  // A later input leaves the execution turn incomplete but must not erase a preceding direct answer or create an empty fold.
  it("Input, direct answer, input remains visible with no process summary", () => {
    const path = [
      node("u", null, message("a", "Hello")),
      node("reply", "u", text("a", "final", 0, "Hello", { completion })),
      node("steer", "reply", message("a", "More", false)),
    ];
    expect(ids(project(path))).toEqual(["u", "reply", "steer", "turn-metrics:u"]);
    expect(project(path).processIds.size).toBe(0);
  });

  // Multiple steer deliveries can split one execution turn into more than two independently expandable groups.
  it("Repeated steer preserves each completed reply and each group's tool ownership", () => {
    const path = [
      node("u", null, message("a", "First")),
      node("tool1", "u", call("a", "work1", 0, "read")),
      node("reply1", "tool1", text("a", "final1", 0, "One", { completion })),
      node("steer1", "reply1", message("a", "Second", false)),
      node("tool2", "steer1", call("a", "work2", 0, "write")),
      node("reply2", "tool2", text("a", "final2", 0, "Two", { completion })),
      node("steer2", "reply2", message("a", "Third", false)),
      node("tool3", "steer2", call("a", "work3", 0, "search")),
      node("reply3", "tool3", text("a", "final3", 0, "Three", { completion })),
    ];
    const grouped = project(path);
    expect(ids(grouped)).toEqual([
      "u", "conversation-process:final1", "reply1", "steer1", "conversation-process:final2", "reply2",
      "steer2", "conversation-process:final3", "reply3", "turn-metrics:u",
    ]);
    expect(grouped.owners.get(JSON.stringify(["work1", 0]))).toBe("conversation-process:final1");
    expect(grouped.owners.get(JSON.stringify(["work2", 0]))).toBe("conversation-process:final2");
    expect(grouped.owners.get(JSON.stringify(["work3", 0]))).toBe("conversation-process:final3");
  });

  // A failed last response must not make earlier progress text appear to be a completed reply.
  it("A failed group hides intermediate body text without affecting an earlier group's reply", () => {
    const path = [
      node("u", null, message("a", "First")),
      node("reply1", "u", text("a", "final1", 0, "One", { completion })),
      node("steer", "reply1", message("a", "Second", false)),
      node("progress", "steer", text("a", "progress", 0, "Inspecting", { completion })),
      node("partial", "progress", text("a", "failed", 0, "Partial", { complete: false, completion: {
        ...completion, finishReason: null,
        termination: { reason: "failed", origin: "model", code: "provider_error", message: "Disconnected", retryable: true },
      } })),
    ];
    expect(ids(project(path))).toEqual(["u", "reply1", "steer", "conversation-process:failed", "response-error:failed", "turn-metrics:u"]);
    expect(project(path).items.find(item => item.kind === "conversation-process")).toMatchObject({ incomplete: true });
  });

  // Hidden empty thinking still contributes to a response's ordinal count when establishing normal completion.
  it("Filtering empty thinking preserves a completed reply and omits an empty summary", () => {
    const path = [
      node("u", null, message("a", "Hello")),
      node("empty", "u", thinking("a", "final", 0, " ")),
      node("reply", "empty", text("a", "final", 1, "Hello", { completion })),
      node("steer", "reply", message("a", "More", false)),
    ];
    expect(ids(project(path))).toEqual(["u", "reply", "steer", "turn-metrics:u"]);
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
    expect(ids(grouped)).toEqual(["old", "conversation-process:old-final", "old-reply", "turn-metrics:old", "u", "progress", "question"]);
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
    expect(ids(stopped)).toEqual(["u", "conversation-process:cut", "stopped", "turn-metrics:u"]);
    expect(stopped.items.find(item => item.kind === "conversation-process")).toMatchObject({ incomplete: true });
    expect(ids(project(path, true, [], feedback))).toEqual(["u", "partial", "stopped"]);
    path.push(node("done", "partial", text("a", "resumed", 0, "Done", { completion })));
    expect(ids(project(path, false, [], feedback))).toEqual(["u", "conversation-process:resumed", "stopped", "done", "turn-metrics:u"]);
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
    expect(ids(project(path))).toEqual(["u", "conversation-process:final", "before", "reply", "after", "turn-metrics:u"]);
    expect(ids(project(path), ["conversation-process:final"])).toEqual(["u", "tool", "conversation-process:final", "before", "reply", "after", "turn-metrics:u"]);
  });

  // A direct answer has nothing to hide, while a thinking-only completion has no final body; neither may generate fabricated output.
  it("Direct answers omit empty summaries; without a final body, the summary still opens the actual process", () => {
    const direct = [node("u", null, message("a", "Hello")), node("reply", "u", text("a", "final", 0, "Hello", { completion }))];
    expect(ids(project(direct))).toEqual(["u", "reply", "turn-metrics:u"]);
    const reasoning = [direct[0]!, node("thinking", "u", thinking("a", "final", 0, "Reasoning", { completion }))];
    const grouped = project(reasoning);
    expect(ids(grouped)).toEqual(["u", "conversation-process:final", "turn-metrics:u"]);
    expect(ids(grouped, [...grouped.processIds])).toEqual(["u", "thinking", "conversation-process:final", "turn-metrics:u"]);
  });
});
