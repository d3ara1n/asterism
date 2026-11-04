import type { AlarmData, AlarmSettings, TimerData, TimerSettings } from "./contract.ts";

/** Distinct weekdays in Sunday-first order. */
export function normalizeWeekdays(weekdays: readonly number[]): number[] {
  return [...new Set(weekdays)].sort((a, b) => a - b);
}

/**
 * The first selected weekday occurrence strictly after now. Local calendar arithmetic preserves the chosen
 * clock time across daylight-saving changes; a skipped local hour resolves through Date normalization.
 */
export function nextAlarmAt(settings: Pick<AlarmSettings, "time" | "weekdays">, now: number): number {
  const [hours, minutes] = settings.time.split(":").map(Number) as [number, number];
  const candidate = new Date(now);
  for (let day = 0; day <= 7; day++) {
    candidate.setHours(hours, minutes, 0, 0);
    if (candidate.getTime() > now && settings.weekdays.includes(candidate.getDay())) return candidate.getTime();
    candidate.setDate(candidate.getDate() + 1);
  }
  throw new Error("The alarm has no selected weekday.");
}

/** An overdue countdown fires once; a repeating countdown begins again at its actual trigger time. */
export function expireTimer(state: TimerData, now: number): TimerData | null {
  if (state.nextAt === null || state.nextAt > now) return null;
  return { ...state, nextAt: state.repeat ? now + state.durationSeconds * 1000 : null,
    remainingMs: state.repeat ? state.durationSeconds * 1000 : 0 };
}

/** An overdue alarm fires once, then waits for its next future occurrence. */
export function expireAlarm(state: AlarmData, now: number): AlarmData | null {
  if (!state.enabled || state.nextAt === null || state.nextAt > now) return null;
  return { ...state, nextAt: nextAlarmAt(state, now) };
}

export function controlTimer(state: TimerData, action: "start" | "pause" | "reset", now: number): TimerData {
  if (action === "reset") return { ...state, nextAt: null, remainingMs: state.durationSeconds * 1000 };
  if (action === "pause") return state.nextAt === null ? state
    : { ...state, nextAt: null, remainingMs: Math.max(0, state.nextAt - now) };
  return state.nextAt !== null ? state
    : { ...state, nextAt: now + (state.remainingMs || state.durationSeconds * 1000) };
}

/** A configured timer is stopped at its full duration. */
export function configureTimer(settings: TimerSettings): TimerData {
  return { ...settings, nextAt: null, remainingMs: settings.durationSeconds * 1000 };
}

export function setAlarmEnabled(state: AlarmData, enabled: boolean, now: number): AlarmData {
  return { ...state, enabled, nextAt: enabled ? nextAlarmAt(state, now) : null };
}
