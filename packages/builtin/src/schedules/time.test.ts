import { describe, expect, it, vi, afterEach } from "vitest";
import type { AlarmData, AlarmSettings, TimerData } from "./contract.ts";
import { configureAlarm, configureTimer, controlTimer, expireAlarm, expireTimer, nextAlarmAt } from "./time.ts";

const timer: TimerData = { durationSeconds: 1800, repeat: true, message: "Check progress.", nextAt: 1_800_000, remainingMs: 1_800_000 };
const alarm: AlarmSettings = { time: "07:30", date: null, weekdays: [], message: "Start the morning review." };
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

  it("preserves a pending countdown when only its message or repeat setting changes", () => {
    expect(configureTimer(timer, { durationSeconds: 1800, message: "Updated.", repeat: false }, 600_000))
      .toMatchObject({ nextAt: 1_800_000, message: "Updated.", repeat: false });
  });

  it("applies a new full duration while preserving whether the timer is running or paused", () => {
    const settings = { durationSeconds: 60, message: timer.message, repeat: false };
    expect(configureTimer(timer, settings, 600_000)).toMatchObject({ nextAt: 660_000, remainingMs: 60_000 });
    expect(configureTimer({ ...timer, nextAt: null, remainingMs: 12_000 }, settings, 600_000))
      .toMatchObject({ nextAt: null, remainingMs: 60_000 });
  });
});

describe("calendar alarm scheduling", () => {
  it("retains an explicit date after its time has passed so startup can deliver it", () => {
    const now = new Date(2024, 0, 9, 10, 10).getTime();
    const nextAt = nextAlarmAt({ ...alarm, date: "2024-01-09" }, now);
    expect(nextAt).toBe(new Date(2024, 0, 9, 7, 30).getTime());
    const pending: AlarmData = { ...alarm, date: "2024-01-09", enabled: true, nextAt };
    expect(expireAlarm(pending, now)).toMatchObject({ enabled: false, nextAt: null });
  });

  it("selects the next clock time when a one-time alarm has no date", () => {
    expect(nextAlarmAt(alarm, new Date(2024, 0, 8, 7, 29).getTime())).toBe(new Date(2024, 0, 8, 7, 30).getTime());
    expect(nextAlarmAt(alarm, new Date(2024, 0, 8, 7, 30).getTime())).toBe(new Date(2024, 0, 9, 7, 30).getTime());
  });

  it("selects a configured weekday across a week boundary after a delayed trigger", () => {
    const settings = { ...alarm, weekdays: [1] };
    const pending: AlarmData = { ...settings, enabled: true, nextAt: new Date(2024, 0, 8, 7, 30).getTime() };
    expect(expireAlarm(pending, new Date(2024, 0, 9, 10, 10).getTime())?.nextAt)
      .toBe(new Date(2024, 0, 15, 7, 30).getTime());
  });

  it("does not trigger disabled alarms or alarms before their deadline", () => {
    const pending: AlarmData = { ...alarm, enabled: true, nextAt: 1000 };
    expect(expireAlarm(pending, 999)).toBeNull();
    expect(expireAlarm({ ...pending, enabled: false }, 2000)).toBeNull();
  });

  it("preserves an overdue occurrence when editing only its message", () => {
    const pending: AlarmData = { ...alarm, enabled: true, nextAt: new Date(2024, 0, 9, 7, 30).getTime() };
    const updated = configureAlarm(pending, { ...alarm, message: "Updated." }, new Date(2024, 0, 9, 10, 10).getTime());
    expect(updated.nextAt).toBe(new Date(2024, 0, 9, 7, 30).getTime());
    expect(expireAlarm(updated, new Date(2024, 0, 9, 10, 10).getTime())?.message).toBe("Updated.");
  });

  it("keeps a repeating alarm at its local clock time across daylight-saving changes", () => {
    vi.stubEnv("TZ", "America/New_York");
    const now = new Date(2024, 2, 9, 8).getTime();
    const nextAt = nextAlarmAt({ ...alarm, weekdays: [0, 1, 2, 3, 4, 5, 6] }, now);
    expect(nextAt).toBe(new Date("2024-03-10T07:30:00-04:00").getTime());
  });

  it("does not carry a skipped daylight-saving hour into a later selected weekday", () => {
    vi.stubEnv("TZ", "America/New_York");
    const nextAt = nextAlarmAt({ ...alarm, time: "02:30", weekdays: [1] }, new Date("2024-03-09T12:00:00-05:00").getTime());
    expect(nextAt).toBe(new Date("2024-03-11T02:30:00-04:00").getTime());
  });
});
