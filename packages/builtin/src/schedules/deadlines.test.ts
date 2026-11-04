import { describe, expect, it } from "vitest";
import { planWakeup } from "./deadlines.ts";

describe("shared deadline planning", () => {
  it("waits for the earliest active deadline and excludes paused resources", () => {
    const entries = [
      { id: "later", nextAt: 9000 }, { id: "paused", nextAt: null }, { id: "first", nextAt: 4000 },
    ];
    expect(planWakeup(entries, 1000)).toEqual({ due: [], nextAt: 4000, delayMs: 3000 });
  });

  it("selects every overdue resource, including equal deadlines, after a delayed wake", () => {
    const entries = [
      { id: "timer", nextAt: 2000 }, { id: "alarm-a", nextAt: 3000 },
      { id: "alarm-b", nextAt: 3000 }, { id: "future", nextAt: 5000 },
    ];
    const plan = planWakeup(entries, 3000);
    expect(plan.due.map(entry => entry.id)).toEqual(["timer", "alarm-a", "alarm-b"]);
    expect(plan.delayMs).toBe(1);
  });

  it("moves the wakeup earlier or later as schedules change and are removed", () => {
    const entries = new Map([
      ["a", { nextAt: 4000 }], ["b", { nextAt: 9000 }],
    ]);
    entries.set("b", { nextAt: 2000 });
    expect(planWakeup(entries.values(), 1000).delayMs).toBe(1000);
    entries.set("b", { nextAt: 12_000 });
    expect(planWakeup(entries.values(), 1000).delayMs).toBe(3000);
    entries.delete("a");
    expect(planWakeup(entries.values(), 1000).delayMs).toBe(11_000);
  });

  it("has no pending wait when every schedule is disabled or absent", () => {
    expect(planWakeup([{ nextAt: null }], 1000)).toEqual({ due: [], nextAt: null, delayMs: null });
    expect(planWakeup([], 1000)).toEqual({ due: [], nextAt: null, delayMs: null });
  });

  it("splits a long wait without treating the intermediate wake as a trigger", () => {
    const entries = [{ nextAt: 3_000_000_000 }];
    expect(planWakeup(entries, 1000)).toEqual({ due: [], nextAt: 3_000_000_000, delayMs: 2_147_483_647 });
    expect(planWakeup(entries, 2_147_484_647)).toEqual({ due: [], nextAt: 3_000_000_000, delayMs: 852_515_353 });
  });

  it("recalculates the remaining wall-clock delay when resume happens before the deadline", () => {
    const entries = [{ nextAt: 10_000 }];
    expect(planWakeup(entries, 1000).delayMs).toBe(9000);
    expect(planWakeup(entries, 8000).delayMs).toBe(2000);
  });
});
