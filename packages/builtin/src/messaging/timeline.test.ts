import { describe, expect, it } from "vitest";
import type { MessagingMessage } from "@asterism-app/sdk/contracts";
import { chatEntries, chatEntryKey, chatReadingAnchorIndex, groupTimeline, relativeUnit } from "./timeline.ts";

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

it("projects day separators, system markers, and sender headers into the virtual row order", () => {
  const entries = chatEntries([
    message("1", "a", local(1, 9)), message("2", "a", local(1, 10)),
    message("joined", "system", local(1, 11), "system"), message("3", "a", local(1, 12)),
    message("4", "a", local(2, 9)),
  ]);
  expect(entries.map(entry => entry.kind === "day" ? entry.key
    : entry.kind === "system" ? [entry.kind, entry.message.id] : [entry.message.id, entry.first])).toEqual([
    "day:2026-01-01", ["1", true], ["2", false], ["system", "joined"], ["3", true],
    "day:2026-01-02", ["4", true],
  ]);
  // Message "4" is virtual row 6, not source index 4, because separators also occupy list positions.
  expect(entries.findIndex(entry => entry.kind !== "day" && entry.message.id === "4")).toBe(6);
});

it("keeps message keys distinct from day markers and stable when earlier days are added", () => {
  const current = message("day:2026-01-02", "a", local(2, 9));
  const before = chatEntries([current]).map(chatEntryKey);
  const after = chatEntries([message("earlier", "a", local(1, 9)), current]).map(chatEntryKey);
  expect(new Set(before).size).toBe(2);
  expect(new Set(after).size).toBe(4);
  expect(after.slice(2)).toEqual(before);
});

it("preserves a retained reading anchor when a same-size recent page rolls forward", () => {
  const first = message("1", "a", local(1, 9)), second = message("2", "a", local(1, 10));
  const third = message("3", "a", local(1, 11)), fourth = message("4", "a", local(1, 12));
  const before = chatEntries([first, second, third]);
  const after = chatEntries([second, third, fourth]);
  expect(chatReadingAnchorIndex(before, after, "2")).toBe(1);
  expect(chatReadingAnchorIndex(before, after, "1")).toBeNull();
  expect(chatReadingAnchorIndex(before, chatEntries([first, second, third, fourth]), "2")).toBeNull();
});
