import { describe, expect, it } from "vitest";
import { sessionSnapshot } from "../../../../../src/plugins/records";
import { nodeView } from "../../../../../src/session/view";
import { call, message, node, text, thinking } from "../../../../../src/session/test-nodes";
import { initialShareSelection, prependEarlierShareMessages, shareMessages, shareTurnGroups, toggleShareSelection, type ShareMessage } from "./share-content";
import { shareImageScale } from "./share-image";
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

const item = (id: string, turnId = id): ShareMessage => ({ id, turnId, sender: null, createdAt: null, markdown: id, attachments: [] });
const list = ["a", "b", "c", "d", "e"].map(id => item(id));

describe("Excerpt selection", () => {
  it("toggles a single message without a range origin", () => {
    expect([...toggleShareSelection(list, new Set(["a"]), "c", null)].sort()).toEqual(["a", "c"]);
    expect([...toggleShareSelection(list, new Set(["a", "c"]), "c", null)]).toEqual(["a"]);
  });

  it("applies the clicked message's new state across a range in either direction", () => {
    expect([...toggleShareSelection(list, new Set(["b"]), "d", "b")].sort()).toEqual(["b", "c", "d"]);
    expect([...toggleShareSelection(list, new Set(["a", "b", "c", "d", "e"]), "b", "d")].sort()).toEqual(["a", "e"]);
  });

  it("falls back to a single toggle when the range origin is no longer a candidate", () => {
    expect([...toggleShareSelection(list, new Set(), "c", "gone")]).toEqual(["c"]);
  });
});

describe("Earlier excerpt pages", () => {
  it("prepends only messages before the captured range and keeps captured messages unchanged", () => {
    const current = [item("c"), item("d")];
    const loaded = [item("a"), item("b"), { ...item("c"), markdown: "reread" }, item("d"), item("later")];
    const merged = prependEarlierShareMessages(loaded, current);
    expect(merged.map(message => message.id)).toEqual(["a", "b", "c", "d"]);
    expect(merged[2]).toBe(current[0]);
  });
});

describe("Excerpt turn groups", () => {
  it("groups adjacent messages of one turn and separates turns", () => {
    const groups = shareTurnGroups([item("u1", "1"), item("r1", "1"), item("u2", "2"), item("r2", "2")]);
    expect(groups.map(group => group.map(message => message.id))).toEqual([["u1", "r1"], ["u2", "r2"]]);
  });
});

describe("Excerpt image scale", () => {
  it("exports at 2x, reduces long excerpts toward 1x, and rejects excerpts beyond the canvas limit", () => {
    expect(shareImageScale(960, 4000)).toBe(2);
    expect(shareImageScale(960, 20000)).toBeCloseTo(32767 / 20000);
    expect(shareImageScale(960, 32767)).toBe(1);
    expect(shareImageScale(960, 40000)).toBeNull();
  });
});
