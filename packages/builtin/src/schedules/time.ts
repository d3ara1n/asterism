import type { AlarmData, AlarmSettings, TimerData, TimerSettings } from "./contract.ts";

/** Local calendar arithmetic preserves the chosen clock time across daylight-saving changes. */
export function nextAlarmAt(settings: AlarmSettings, now: number): number {
  const [hours, minutes] = settings.time.split(":").map(Number) as [number, number];
  if (settings.date && !settings.weekdays.length) {
    const [year, month, day] = settings.date.split("-").map(Number) as [number, number, number];
    return new Date(year, month - 1, day, hours, minutes).getTime();
  }
  const candidate = new Date(now);
  for (let day = 0; day <= 7; day++) {
    candidate.setHours(hours, minutes, 0, 0);
    if (candidate.getTime() > now && (!settings.weekdays.length || settings.weekdays.includes(candidate.getDay())))
      return candidate.getTime();
    candidate.setDate(candidate.getDate() + 1);
  }
  throw new Error("The alarm has no next occurrence.");
}

/** An overdue countdown fires once; a repeating countdown begins again at its actual trigger time. */
export function expireTimer(state: TimerData, now: number): TimerData | null {
  if (state.nextAt === null || state.nextAt > now) return null;
  return { ...state, nextAt: state.repeat ? now + state.durationSeconds * 1000 : null,
    remainingMs: state.repeat ? state.durationSeconds * 1000 : 0 };
}

/** Each alarm owns its pending occurrence independently of every other schedule. */
export function expireAlarm(state: AlarmData, now: number): AlarmData | null {
  if (!state.enabled || state.nextAt === null || state.nextAt > now) return null;
  return state.weekdays.length
    ? { ...state, nextAt: nextAlarmAt(state, now) }
    : { ...state, enabled: false, nextAt: null };
}

export function controlTimer(state: TimerData, action: "start" | "pause" | "reset", now: number): TimerData {
  if (action === "reset") return { ...state, nextAt: null, remainingMs: state.durationSeconds * 1000 };
  if (action === "pause") return state.nextAt === null ? state
    : { ...state, nextAt: null, remainingMs: Math.max(0, state.nextAt - now) };
  return state.nextAt !== null ? state
    : { ...state, nextAt: now + (state.remainingMs || state.durationSeconds * 1000) };
}

export function configureTimer(state: TimerData, settings: TimerSettings, now: number): TimerData {
  if (state.durationSeconds === settings.durationSeconds) return { ...state, ...settings };
  return { ...settings, nextAt: state.nextAt === null ? null : now + settings.durationSeconds * 1000,
    remainingMs: settings.durationSeconds * 1000 };
}

export function configureAlarm(state: AlarmData, settings: AlarmSettings, now: number): AlarmData {
  const changed = state.time !== settings.time || state.date !== settings.date
    || [...new Set(state.weekdays)].sort().join() !== [...new Set(settings.weekdays)].sort().join();
  return { ...state, ...settings,
    nextAt: changed && state.enabled ? nextAlarmAt(settings, now) : state.nextAt };
}
