import { describe, expect, it } from "vitest";
import { dateKeyStart, hourMs, localWeekday } from "../../../shared/telemetry-time";
import { budgetPace, calendarStart, monthsBefore, rangeWindow, streaks } from "./range";

const offset = 480;
const at = (key: string, hour: number) => dateKeyStart(key, offset) + hour * hourMs;

describe("Dashboard ranges", () => {
  it("compares a partial day with the same hours of the previous day", () => {
    const now = at("2026-03-10", 15);
    expect(rangeWindow("today", now, offset, null)).toEqual({
      from: at("2026-03-10", 0), to: null, granularity: "hour",
      compare: { from: at("2026-03-09", 0), to: at("2026-03-09", 15) },
    });
  });

  it("includes today in day ranges and compares the preceding days up to the same elapsed time", () => {
    const now = at("2026-03-10", 15);
    const window = rangeWindow("7d", now, offset, null);
    expect(window.from).toBe(at("2026-03-04", 0));
    expect(window.compare).toEqual({ from: at("2026-02-25", 0), to: at("2026-03-03", 15) });
  });

  it("chooses the bucket size of an unbounded range from the recorded span", () => {
    const now = at("2026-03-10", 15);
    expect(rangeWindow("all", now, offset, now - 30 * 24 * hourMs).granularity).toBe("day");
    expect(rangeWindow("all", now, offset, now - 400 * 24 * hourMs).granularity).toBe("week");
    expect(rangeWindow("all", now, offset, now - 1000 * 24 * hourMs).granularity).toBe("month");
  });

  it("deletes from the same local day months earlier, clamping to shorter months and crossing years", () => {
    expect(monthsBefore(at("2026-03-31", 15), 1, offset)).toBe(at("2026-02-28", 0));
    expect(monthsBefore(at("2026-01-15", 15), 3, offset)).toBe(at("2025-10-15", 0));
    expect(monthsBefore(at("2028-02-29", 15), 12, offset)).toBe(at("2027-02-28", 0));
  });

  it("starts the calendar on the Monday of the week 364 days ago", () => {
    const start = calendarStart(at("2026-03-10", 1), offset);
    // 2025-03-11 is a Tuesday, so the calendar opens on Monday 2025-03-10.
    expect(start).toBe(dateKeyStart("2025-03-10", offset));
    expect(localWeekday(start, offset)).toBe(0);
  });
});

describe("Dashboard activity and budget", () => {
  it("keeps the current streak alive until today passes without usage", () => {
    const active = new Set(["2026-03-01", "2026-03-02", "2026-03-03", "2026-03-07", "2026-03-08", "2026-03-09"]);
    expect(streaks(active, "2026-03-10")).toEqual({ current: 3, longest: 3 });
    expect(streaks(new Set([...active, "2026-03-10"]), "2026-03-10")).toEqual({ current: 4, longest: 4 });
    expect(streaks(active, "2026-03-11")).toEqual({ current: 0, longest: 3 });
  });

  it("projects month spending from the average so far and damps the first day", () => {
    // Ten of thirty-one March days have passed.
    expect(budgetPace(20, 100, at("2026-03-11", 0), offset).projected).toBeCloseTo(62);
    // Six hours into the month counts as one day rather than a quarter of one.
    expect(budgetPace(2, 100, at("2026-03-01", 6), offset).projected).toBeCloseTo(62);
  });
});
