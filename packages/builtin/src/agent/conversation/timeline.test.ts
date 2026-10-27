import { describe, expect, it } from "vitest";
import { sessionSnapshot } from "../../../../../src/plugins/records";
import { nodeView } from "../../../../../src/session/view";
import { node, text, thinking, message as input } from "../../../../../src/session/test-nodes";
import type { ModelLiveBlock, SessionSnapshot } from "@asterism/sdk/contracts";
import { displayedTimeline, generating, mountedTimelineIndexes, savedTimeline, timelineKey, withLive } from "./timeline";
import type { InlineFeedback } from "../feedback";

/** The same two-layer composition as the agent card: saved content plus live blocks. */
const conversationTimeline = (snapshot: SessionSnapshot, agentId: string, live: readonly ModelLiveBlock[], running = live.length > 0) =>
  withLive(savedTimeline(snapshot, agentId, running), live);

describe("Agent typed record views", () => {
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
    expect(timeline[0]).toMatchObject({ kind: "thinking", text: "Saved reasoning summary", summary: "Saved reasoning summary" });
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
    const items = savedTimeline(snapshot, "a", false, feedback).items;
    expect(items.map(item => item.id)).toEqual(["input", "early", "partial", "interrupted", "retried"]);
    expect(snapshot.records.all({ scope: "timeline" }).map(record => record.id)).toEqual(["input", "partial", "retried"]);
    expect(savedTimeline(snapshot, "a", false).items.map(item => item.id)).toEqual(["input", "partial", "retried"]);
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
