import { describe, expect, it } from "vitest";
import type { DeadlineServices } from "@asterism-app/sdk/runtime";
import { planSessionSleep, SessionSleepPolicy, type SleepCandidate } from "./session-sleep.ts";

const day = 86_400_000;
const candidate = (id: string, opened: number): SleepCandidate => ({ id, lastOpenedAt: new Date(opened).toISOString() });

describe("session sleep deadlines", () => {
  it("becomes due at the threshold and selects the earliest open deadline", () => {
    const sessions = [candidate("later", 2 * day), candidate("first", day)];
    expect(planSessionSleep(sessions, 7, 8 * day - 1)).toEqual({ due: [], nextAt: 8 * day });
    expect(planSessionSleep(sessions, 7, 8 * day)).toEqual({ due: ["first"], nextAt: 8 * day });
    expect(planSessionSleep(sessions, null, 100 * day)).toEqual({ due: [], nextAt: null });
  });

  // An overdue busy session must not pin the wait to an immediate deadline; it sleeps once it settles.
  it("defers overdue unsettled sessions without rescheduling immediately", async () => {
    const now = Date.now(), scheduled: { at: number; run: () => void | Promise<void> }[] = [];
    const deadlines: DeadlineServices = { schedule: (at, run) => { scheduled.push({ at, run }); return () => {}; } };
    const busy = new Set(["overdue"]), slept: string[] = [];
    const policy = new SessionSleepPolicy({
      deadlines, sleepDays: () => 7, failed: error => { throw error; },
      candidates: () => [candidate("overdue", now - 10 * day), candidate("recent", now)].filter(item => !slept.includes(item.id)),
      settled: id => !busy.has(id), sleep: async id => { slept.push(id); },
    });
    policy.refresh();
    expect(policy.isWaiting("overdue")).toBe(true);
    expect(scheduled.at(-1)!.at).toBe(now + 7 * day);
    busy.clear();
    policy.refresh();
    expect(scheduled.at(-1)!.at).toBe(now - 3 * day);
    await scheduled.at(-1)!.run();
    expect(slept).toEqual(["overdue"]);
    expect(scheduled.at(-1)!.at).toBe(now + 7 * day);
  });
});
