import { describe, expect, it } from "vitest";
import type { MessagingMessage } from "@asterism-app/sdk/contracts";
import { groupTimeline, relativeUnit } from "./timeline.ts";

const local = (day: number, hour: number) => new Date(2026, 0, day, hour).toISOString();
const message = (id: string, sender: string, sentAt: string, role: MessagingMessage["sender"]["role"] = "participant"): MessagingMessage =>
  ({ id, parts: [{ kind: "text", text: id }], sentAt, sender: { id: sender, name: sender, role } });

describe("Chat timeline", () => {
  // Grouping must break on a sender change, a later return of the same sender, and a local day boundary.
  it("groups consecutive messages by sender within a local day", () => {
    const groups = groupTimeline([
      message("1", "a", local(1, 9)), message("2", "a", local(1, 10)), message("3", "bot", local(1, 11), "self"),
      message("4", "a", local(1, 12)), message("5", "a", local(2, 9)),
    ]);
    expect(groups.map(group => group.messages.map(item => item.id))).toEqual([["1", "2"], ["3"], ["4"], ["5"]]);
  });
  // The largest whole unit is chosen, and sub-minute differences read as now rather than a seconds count.
  it("reports activity in the largest whole unit", () => {
    const now = Date.UTC(2026, 0, 10);
    expect(relativeUnit(now - 30_000, now)).toEqual({ value: 0, unit: "second" });
    expect(relativeUnit(now - 5 * 60_000, now)).toEqual({ value: -5, unit: "minute" });
    expect(relativeUnit(now - 26 * 3_600_000, now)).toEqual({ value: -1, unit: "day" });
  });
});
