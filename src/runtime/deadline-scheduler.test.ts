import { describe, expect, it } from "vitest";
import { DeadlineScheduler, planDeadlineWakeup } from "./deadline-scheduler.ts";

describe("absolute deadline planning", () => {
  it("waits for the earliest pending deadline", () => {
    const entries = [
      { id: "later", at: 9000 }, { id: "first", at: 4000 },
    ];
    expect(planDeadlineWakeup(entries, 1000)).toEqual({ due: [], nextAt: 4000, delayMs: 3000 });
  });

  it("selects all overdue deadlines, including ties, after a delayed wake", () => {
    const entries = [
      { id: "first", at: 2000 }, { id: "tie-a", at: 3000 },
      { id: "tie-b", at: 3000 }, { id: "future", at: 5000 },
    ];
    const plan = planDeadlineWakeup(entries, 3000);
    expect(plan.due.map(entry => entry.id)).toEqual(["first", "tie-a", "tie-b"]);
    expect(plan.delayMs).toBe(1);
  });

  it("moves the wakeup earlier or later as deadlines change and are removed", () => {
    const entries = new Map([
      ["a", { at: 4000 }], ["b", { at: 9000 }],
    ]);
    entries.set("b", { at: 2000 });
    expect(planDeadlineWakeup(entries.values(), 1000).delayMs).toBe(1000);
    entries.set("b", { at: 12_000 });
    expect(planDeadlineWakeup(entries.values(), 1000).delayMs).toBe(3000);
    entries.delete("a");
    expect(planDeadlineWakeup(entries.values(), 1000).delayMs).toBe(11_000);
  });

  it("has no pending wait when no deadlines remain", () => {
    expect(planDeadlineWakeup([], 1000)).toEqual({ due: [], nextAt: null, delayMs: null });
  });

  it("splits a long wait without treating the intermediate wake as a trigger", () => {
    const entries = [{ at: 3_000_000_000 }];
    expect(planDeadlineWakeup(entries, 1000)).toEqual({ due: [], nextAt: 3_000_000_000, delayMs: 2_147_483_647 });
    expect(planDeadlineWakeup(entries, 2_147_484_647)).toEqual({ due: [], nextAt: 3_000_000_000, delayMs: 852_515_353 });
  });

  it("recalculates the remaining wall-clock delay when resume happens before the deadline", () => {
    const entries = [{ at: 10_000 }];
    expect(planDeadlineWakeup(entries, 1000).delayMs).toBe(9000);
    expect(planDeadlineWakeup(entries, 8000).delayMs).toBe(2000);
    // A backward clock adjustment must extend the wait instead of triggering early.
    expect(planDeadlineWakeup(entries, -2000)).toEqual({ due: [], nextAt: 10_000, delayMs: 12_000 });
  });
});

// Explicit rechecks dispatch already-overdue work without waiting on real or fake clocks.
describe("deadline cancellation and dispatch", () => {
  it("does not dispatch a due sibling cancelled by an earlier callback", () => {
    const scheduler = new DeadlineScheduler(error => { throw error; });
    const seen: string[] = [];
    try {
      let cancelSibling = () => {};
      scheduler.schedule(0, () => { seen.push("first"); cancelSibling(); });
      cancelSibling = scheduler.schedule(0, () => { seen.push("cancelled"); });
      scheduler.schedule(0, () => { seen.push("last"); });
      scheduler.recheck();
      scheduler.recheck();
      expect(seen).toEqual(["first", "last"]);
    } finally { scheduler.close(); }
  });

  it("removes an aborted registration and closing within a callback cancels remaining due work", () => {
    const scheduler = new DeadlineScheduler(error => { throw error; });
    const lifetime = new AbortController(), seen: string[] = [];
    try {
      scheduler.schedule(0, () => { seen.push("aborted"); }, { signal: lifetime.signal });
      lifetime.abort();
      scheduler.schedule(0, () => { seen.push("close"); scheduler.close(); });
      scheduler.schedule(0, () => { seen.push("closed"); });
      scheduler.recheck();
      expect(seen).toEqual(["close"]);
    } finally { scheduler.close(); }
  });

  it("reports one failed callback without dropping other due callbacks", () => {
    const failures: unknown[] = [], seen: string[] = [];
    const scheduler = new DeadlineScheduler(error => failures.push(error));
    const failure = new Error("Callback failed.");
    try {
      scheduler.schedule(0, () => { throw failure; });
      scheduler.schedule(0, () => { seen.push("healthy"); });
      scheduler.recheck();
      expect(failures).toEqual([failure]);
      expect(seen).toEqual(["healthy"]);
    } finally { scheduler.close(); }
  });
});
