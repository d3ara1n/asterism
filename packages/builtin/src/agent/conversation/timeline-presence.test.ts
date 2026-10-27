import { describe, expect, it } from "vitest";
import { retainExitingItems } from "./timeline-presence";
import { timelineKey, type TimelineItem } from "./timeline";

const text = (id: string): TimelineItem => ({ kind: "text", id, responseId: id, ordinal: 0, text: id, endedAt: 1 });
const process: TimelineItem = { kind: "turn-process", id: "process", open: false, incomplete: false, toolCount: 2 };

describe("Exiting item order in the virtual list", () => {
  // Automatic folding adds a new summary row; retained visible process items should stay above it, while offscreen content occupies no exit position.
  it("Visible process items stay above the new summary, while offscreen process items are removed immediately", () => {
    const hidden = text("offscreen"), visible = text("visible"), answer = text("answer");
    const result = retainExitingItems([hidden, visible, answer], [process, answer],
      new Set([timelineKey(visible), timelineKey(answer)]),
      new Map([[timelineKey(hidden), process.id], [timelineKey(visible), process.id]]));
    expect(result.map(item => item.id)).toEqual(["visible", "process", "answer"]);
  });

  // Same-turn steer messages remain visible; earlier process items must not first move past a supplemental message merely to group them above the summary.
  it("Exiting process items do not cross intervening supplemental messages", () => {
    const before = text("before"), after = text("after"), answer = text("answer");
    const steer: TimelineItem = { kind: "message", id: "steer", parts: [], sender: { kind: "user" }, startsTurn: false };
    const result = retainExitingItems([before, steer, after, answer], [steer, process, answer],
      new Set([timelineKey(before), timelineKey(after)]),
      new Map([[timelineKey(before), process.id], [timelineKey(after), process.id]]));
    expect(result.map(item => item.id)).toEqual(["before", "steer", "after", "process", "answer"]);
  });

  // Repeated clicks can restore an item before its exit completes; reuse the target version without duplicating the old item or losing the latest content.
  it("Restoring an item during exit uses the target content and shows it exactly once", () => {
    const old = text("visible"), updated = { ...text("visible"), text: "Updated" };
    const target = [updated, { ...process, open: true }];
    const result = retainExitingItems([old, process], target, new Set([timelineKey(old), process.id]), new Map());
    expect(result).toEqual(target);
    expect(result[0]).toBe(updated);
  });

  // Compression activity and successful records have different identities; the exiting running row must precede the new completed row so local stacking can replace them in place.
  it("When successful compression replaces the running indicator, the exiting activity sits immediately before the success record", () => {
    const running: TimelineItem = { kind: "compression", id: "activity", status: "running" };
    const completed: TimelineItem = { kind: "compression", id: "saved", status: "completed" };
    expect(retainExitingItems([running], [completed], new Set(["activity"]), new Map()).map(item => item.id))
      .toEqual(["activity", "saved"]);
  });

  // Path switches also remove visible items; without a folding summary, position them relative to their original successor, keeping trailing exit items at the end.
  it("Ordinary removal preserves relative order and newly added items in the target", () => {
    const a = text("a"), b = text("b"), c = text("c"), d = text("d"), added = text("new");
    expect(retainExitingItems([a, b, c, d], [a, added, c], new Set([timelineKey(b), timelineKey(d)]), new Map()).map(item => item.id))
      .toEqual(["a", "new", "b", "c", "d"]);
  });
});
