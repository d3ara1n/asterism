import { describe, expect, it } from "vitest";
import { sessionSnapshot } from "../../../../../src/plugins/records";
import { nodeView } from "../../../../../src/session/view";
import { call, message, node, text, thinking } from "../../../../../src/session/test-nodes";
import { initialShareSelection, shareMessages } from "./share-content";
import { savedTimeline, withLive } from "./timeline";

const completion = { finishReason: "stop", rawFinishReason: null, providerResponseId: null, usage: null } as const;
function messages(path: ReturnType<typeof node>[], from?: string) {
  const snapshot = sessionSnapshot(nodeView("s", "", path, path.at(-1)?.id ?? null));
  return shareMessages(withLive(savedTimeline(snapshot.records.all({ scope: "timeline" }), "a", false, [], { from }), []));
}

describe("Conversation excerpts", () => {
  it("selects the anchored exchange, excluding process text, reasoning, tools, and adjacent exchanges", () => {
    const candidates = messages([
      node("u1", null, message("a", "First question")),
      node("process", "u1", text("a", "work", 0, "Private intermediate output")),
      node("tool", "process", call("a", "work", 1, "read")),
      node("reason", "tool", thinking("a", "answer", 0)),
      node("r1", "reason", text("a", "answer", 1, "First answer", { completion })),
      node("u2", "r1", message("a", "Second question")),
      node("r2", "u2", text("a", "next", 0, "Second answer", { completion })),
    ]);
    expect(candidates.map(item => item.markdown)).toEqual(["First question", "First answer", "Second question", "Second answer"]);
    expect([...initialShareSelection(candidates, "turn-metrics:u1")]).toEqual(["u1", "turn-metrics:u1"]);
    expect([...initialShareSelection(candidates, "u2")]).toEqual(["u2", "turn-metrics:u2"]);
    expect([...initialShareSelection(candidates, "missing")]).toEqual([]);
  });

  it("retains the original turn identity when a window begins at a steer message", () => {
    const steer = message("a", "Keep the answer short");
    const data = steer.data as { startsTurn: boolean };
    data.startsTurn = false;
    const candidates = messages([
      node("u", null, message("a", "Question outside the visible window")),
      node("tool", "u", call("a", "work", 0, "read")),
      node("steer", "tool", steer),
      node("reply", "steer", text("a", "final", 0, "Short answer", { completion })),
    ], "steer");
    expect(candidates.map(item => [item.id, item.turnId])).toEqual([["steer", "u"], ["turn-metrics:u", "u"]]);
    expect([...initialShareSelection(candidates, "turn-metrics:u")]).toEqual(["steer", "turn-metrics:u"]);
  });

  it("does not pull an unanswered input into the following turn", () => {
    const candidates = messages([
      node("unanswered", null, message("a", "Abandoned question")),
      node("next", "unanswered", message("a", "New question")),
      node("reply", "next", text("a", "final", 0, "New answer", { completion })),
    ]);
    expect([...initialShareSelection(candidates, "turn-metrics:next")]).toEqual(["next", "turn-metrics:next"]);
  });
});
