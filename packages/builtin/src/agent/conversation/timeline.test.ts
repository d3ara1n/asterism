import { describe, expect, it } from "vitest";
import { sessionSnapshot } from "../../../../../src/plugins/records";
import { nodeView } from "../../../../../src/session/view";
import { node, text, thinking, message as input } from "../../../../../src/session/test-nodes";
import type { ModelLiveBlock, SessionSnapshot } from "@asterism-app/sdk/contracts";
import { displayedTimeline, generating, isModelBlock, liveTimeline, mountedTimelineIndexes, savedTimeline, timelineKey, withLive } from "./timeline";
import type { InlineFeedback } from "../feedback";

/** The same two-layer composition as the agent card: saved content plus live blocks. */
const conversationTimeline = (snapshot: SessionSnapshot, agentId: string, live: readonly ModelLiveBlock[], running = live.length > 0) =>
  withLive(savedTimeline(snapshot.records.all({ scope: "timeline" }), agentId, running), live);

describe("Agent typed record views", () => {
  it.each(["model", "software"] as const)("restores one %s error notice and marks only partial context, preserving complete text in a failed response", origin => {
    const completion = { usage: null, finishReason: null, rawFinishReason: null, providerResponseId: null,
      termination: { reason: "failed" as const, origin, code: "provider_error", message: "Disconnected", retryable: true } };
    const path = [
      node("u", null, input("a", "Question")),
      node("text", "u", text("a", "r", 0, "Complete text", { requestParentId: "u" })),
      node("thinking", "text", thinking("a", "r", 1, "Partial", { requestParentId: "u", complete: false, completion })),
    ];
    const snapshot = sessionSnapshot(nodeView("s", "", path, "thinking"));
    const items = savedTimeline(snapshot.records.all({ scope: "timeline" }), "a", false, [{
      id: "live-error", afterNodeId: "thinking", responseId: "r", origin, level: "error", code: "provider_error", message: "Disconnected",
    }]).items;
    expect(items.find(item => item.kind === "text")).not.toHaveProperty("partialContext");
    expect(items.find(item => item.kind === "text")).not.toHaveProperty("failed");
    expect(items.find(item => item.kind === "thinking")).toMatchObject({ partialContext: true, failed: true });
    expect(items.filter(item => item.kind === "notice")).toMatchObject([{ origin, message: "Disconnected" }]);
  });

  // A record update may precede its body read and the removal of its live block; preserve one item until the saved view catches up.
  it("retains live output through a pending history read and releases it when that read settles or resets", () => {
    const first: ModelLiveBlock = { id: "live", responseId: "r", ordinal: 0, kind: "text", text: "Partial", endedAt: null };
    const newest: ModelLiveBlock = { ...first, id: "another-display-id", text: "Complete", endedAt: 100 };
    const initial = liveTimeline(null, [first], false);
    const waiting = liveTimeline(initial, [newest], true);
    expect(waiting.visible).toEqual([newest]);
    const removed: ModelLiveBlock[] = [];
    const retained = liveTimeline(waiting, removed, true);
    expect(retained.visible).toEqual([newest]);
    expect(liveTimeline(retained, removed, true)).toBe(retained);
    expect(liveTimeline(retained, removed, false).visible).toEqual([]);
    const saved = node("saved", null, text("a", "r", 0, "Complete"));
    const timeline = savedTimeline(sessionSnapshot(nodeView("s", "", [saved], saved.id)).records.all({ scope: "timeline" }), "a", false);
    expect(withLive(timeline, retained.visible).filter(isModelBlock)).toHaveLength(1);
  });
  // Displayed source comes from structured sender data; envelope text within the body does not determine attribution.
  it("Input views preserve agent source and original body text; user-written tags remain part of a user message", () => {
    const sender = { kind: "agent" as const, resource: { sessionId: "s", id: "relay", kind: "example/relay" }, name: "Reviewer" };
    const body = "<agent-message>Literal text</agent-message>";
    const nodes = [node("external", null, input("a", body, true, sender)), node("user", "external", input("a", body))];
    const timeline = conversationTimeline(sessionSnapshot(nodeView("s", "", nodes, "user")), "a", []);
    expect(timeline).toMatchObject([
      { kind: "message", sender, parts: [{ text: body }] },
      { kind: "message", sender: { kind: "user" }, parts: [{ text: body }] },
    ]);
  });

  // A model may deliver only a thinking summary; display conversion must preserve readable content without rewriting the plain-text/summary fields in history.
  it("Thinking blocks containing only a summary remain readable", () => {
    const saved = node("summary-only", null, thinking("a", "r", 0, "", { summary: "Saved reasoning summary" }));
    const timeline = conversationTimeline(sessionSnapshot(nodeView("s", "", [saved], saved.id)), "a", []);
    expect(timeline[0]).toMatchObject({ kind: "thinking", text: "Saved reasoning summary" });
    expect(saved.data).toMatchObject({ block: { text: "", summary: "Saved reasoning summary" } });
  });
  it("A block keeps its display identity when moving from memory to history, without duplicate display in transitional snapshots", () => {
    const live = { id: "r:0", responseId: "r", ordinal: 0, kind: "thinking" as const, text: "thinking", startedAt: 1000, endedAt: null };
    const saved = node("saved-id", null, thinking("a", "r", 0, live.text));
    const before = conversationTimeline(sessionSnapshot(nodeView("s", "", [], null)), "a", [live]);
    const after = conversationTimeline(sessionSnapshot(nodeView("s", "", [saved], saved.id)), "a", [live]);
    expect(before.map(timelineKey)).toEqual(after.map(timelineKey));
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ id: saved.id, kind: "thinking", text: "thinking", complete: true });
  });

  it("Temporary feedback stays at its occurrence position through retries, is hidden on other branches, and creates no history", () => {
    const message = node("input", null, input("a", "Question"));
    const block = node("partial", message.id, text("a", "r", 0, "Partial", { complete: false, requestParentId: message.id }));
    const retried = node("retried", block.id, text("a", "next-response", 0, "Retried", { requestParentId: block.id }));
    const nodes = [message, block, retried];
    const feedback: InlineFeedback[] = [
      { id: "early", afterNodeId: message.id, origin: "model", code: "provider_error", level: "error", message: "HTTP 429" },
      { id: "interrupted", afterNodeId: block.id, origin: "model", code: "interrupted", level: "error", message: "Interrupted" },
      { id: "other", afterNodeId: "other-branch", origin: "model", code: "provider_error", level: "error", message: "Other branch" },
    ];
    const snapshot = sessionSnapshot(nodeView("s", "", nodes, retried.id));
    const items = savedTimeline(snapshot.records.all({ scope: "timeline" }), "a", false, feedback).items;
    expect(items.map(item => item.id)).toEqual(["input", "early", "partial", "interrupted", "retried"]);
    expect(snapshot.records.all({ scope: "timeline" }).map(record => record.id)).toEqual(["input", "partial", "retried"]);
    expect(savedTimeline(snapshot.records.all({ scope: "timeline" }), "a", false).items.map(item => item.id)).toEqual(["input", "partial", "retried"]);
  });

  // Multiple requests in one turn have only one trailing summary; historical summaries do not disappear when the next turn runs.
  it("Inserts each turn's measurements at its end and hides only the current turn's summary while running", () => {
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

  // Persisted formed blocks may also have endedAt=null (settled before completion); only live blocks count as generating, or interrupted blocks would stream-render and keep timing forever.
  it("Saved unfinished blocks retain generation start and end data without counting as generating; only unfinished live blocks do", () => {
    const saved = node("cut", null, thinking("a", "r", 0, "partial", { complete: false }));
    Object.assign((saved.data as { block: object }).block, { startedAt: 1000, endedAt: null });
    const [item] = conversationTimeline(sessionSnapshot(nodeView("s", "", [saved], saved.id)), "a", []);
    expect(item).toMatchObject({ kind: "thinking", startedAt: 1000, endedAt: null });
    expect(generating(item!)).toBe(false);
    const live = { id: "r2:0", responseId: "r2", ordinal: 0, kind: "thinking" as const, text: "t", startedAt: 1000, endedAt: null };
    expect(generating(live)).toBe(true);
    expect(generating({ ...live, endedAt: 2000 })).toBe(false);
  });

  // Unmounting live blocks in the virtual list replays streaming animations and loses in-progress state; the last item anchors output following.
  it("Live blocks and the last item stay mounted while saved items are recycled during scrolling; empty thinking blocks occupy no list position", () => {
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
