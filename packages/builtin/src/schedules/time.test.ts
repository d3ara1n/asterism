import { describe, expect, it, vi, afterEach } from "vitest";
import type { AlarmData, AlarmSettings, TimerData } from "./contract.ts";
import { controlTimer, expireAlarm, expireTimer, nextAlarmAt, normalizeWeekdays } from "./time.ts";

const timer: TimerData = { durationSeconds: 1800, repeat: true, message: "Check progress.", nextAt: 1_800_000, remainingMs: 1_800_000 };
const everyDay = [0, 1, 2, 3, 4, 5, 6];
const alarm: AlarmSettings = { time: "07:30", weekdays: everyDay, message: "Start the morning review." };
afterEach(() => vi.unstubAllEnvs());

describe("countdown scheduling", () => {
  it("starts the next full interval from the delayed trigger, including time spent asleep", () => {
    const next = expireTimer(timer, 4_800_000)!;
    expect(next.nextAt).toBe(6_600_000);
    expect(expireTimer(next, 4_800_000)).toBeNull();
  });

  it("fires at the deadline and completes a one-time countdown", () => {
    expect(expireTimer({ ...timer, repeat: false }, 1_799_999)).toBeNull();
    expect(expireTimer({ ...timer, repeat: false }, 1_800_000)).toMatchObject({ nextAt: null, remainingMs: 0 });
  });

  it("preserves remaining duration while paused and resumes from that duration", () => {
    const paused = controlTimer(timer, "pause", 600_000);
    expect(paused).toMatchObject({ nextAt: null, remainingMs: 1_200_000 });
    expect(expireTimer(paused, 7_200_000)).toBeNull();
    expect(controlTimer(paused, "start", 7_200_000).nextAt).toBe(8_400_000);
  });

  it("resets to a stopped full countdown and restarts completed countdowns", () => {
    expect(controlTimer(timer, "reset", 600_000)).toMatchObject({ nextAt: null, remainingMs: 1_800_000 });
    expect(controlTimer({ ...timer, nextAt: null, remainingMs: 0 }, "start", 600_000).nextAt).toBe(2_400_000);
  });
});

describe("repeating alarm scheduling", () => {
  it("never selects a past occurrence: a clock time already passed today moves to the next selected day", () => {
    expect(nextAlarmAt(alarm, new Date(2024, 0, 8, 7, 29).getTime())).toBe(new Date(2024, 0, 8, 7, 30).getTime());
    expect(nextAlarmAt(alarm, new Date(2024, 0, 8, 7, 30).getTime())).toBe(new Date(2024, 0, 9, 7, 30).getTime());
    expect(nextAlarmAt({ ...alarm, weekdays: [1] }, new Date(2024, 0, 8, 10).getTime())).toBe(new Date(2024, 0, 15, 7, 30).getTime());
  });

  it("fires an occurrence missed during sleep once, then selects the next future weekday", () => {
    const pending: AlarmData = { ...alarm, weekdays: [1], enabled: true, nextAt: new Date(2024, 0, 8, 7, 30).getTime() };
    expect(expireAlarm(pending, new Date(2024, 0, 9, 10, 10).getTime())?.nextAt)
      .toBe(new Date(2024, 0, 15, 7, 30).getTime());
  });

  it("does not trigger disabled alarms or alarms before their deadline", () => {
    const pending: AlarmData = { ...alarm, enabled: true, nextAt: 1000 };
    expect(expireAlarm(pending, 999)).toBeNull();
    expect(expireAlarm({ ...pending, enabled: false }, 2000)).toBeNull();
  });

  it("orders and deduplicates selected weekdays", () => {
    expect(normalizeWeekdays([3, 0, 3, 6, 1])).toEqual([0, 1, 3, 6]);
  });

  it("keeps a repeating alarm at its local clock time across daylight-saving changes", () => {
    vi.stubEnv("TZ", "America/New_York");
    const nextAt = nextAlarmAt(alarm, new Date(2024, 2, 9, 8).getTime());
    expect(nextAt).toBe(new Date("2024-03-10T07:30:00-04:00").getTime());
  });

  it("does not carry a skipped daylight-saving hour into a later selected weekday", () => {
    vi.stubEnv("TZ", "America/New_York");
    const nextAt = nextAlarmAt({ ...alarm, time: "02:30", weekdays: [1] }, new Date("2024-03-09T12:00:00-05:00").getTime());
    expect(nextAt).toBe(new Date("2024-03-11T02:30:00-04:00").getTime());
  });
});
