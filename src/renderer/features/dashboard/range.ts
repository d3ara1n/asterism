import { bucketKey, dateKeyStart, dayMs, localDateKey, localMonthStart, shiftDateKey, type Granularity } from "../../../shared/telemetry-time";

export const rangePresets = ["today", "7d", "30d", "90d", "365d", "all"] as const;
export type RangePreset = typeof rangePresets[number];

export interface RangeWindow {
  from: number | null;
  to: number | null;
  /** The preceding period with the same elapsed length, for change indicators; null for an unbounded range. */
  compare: { from: number; to: number } | null;
  granularity: Granularity;
}

const days: Record<Exclude<RangePreset, "today" | "all">, number> = { "7d": 7, "30d": 30, "90d": 90, "365d": 365 };

/** Positive-east offset of the local time zone at `now`. */
export function localOffset(now: number): number {
  return -new Date(now).getTimezoneOffset();
}

/**
 * Calendar-aligned range ending now. Day ranges start at local midnight `n - 1` days ago, so "7 days" includes today.
 * Comparison shifts the range back by its length and stops at the same elapsed point: today until now is compared with yesterday until the same time.
 */
export function rangeWindow(preset: RangePreset, now: number, offset: number, firstEventAt: number | null): RangeWindow {
  const today = localDateKey(now, offset);
  if (preset === "all") {
    const span = firstEventAt === null ? 0 : now - firstEventAt;
    return { from: null, to: null, compare: null, granularity: span <= 2 * dayMs ? "hour" : span <= 62 * dayMs ? "day" : span <= 730 * dayMs ? "week" : "month" };
  }
  const length = preset === "today" ? 1 : days[preset];
  const from = dateKeyStart(shiftDateKey(today, 1 - length), offset);
  const shift = length * dayMs;
  return { from, to: null, compare: { from: from - shift, to: now - shift }, granularity: preset === "today" ? "hour" : preset === "365d" ? "week" : "day" };
}

/** Local midnight on the same calendar day `months` months before now, clamped to that month's last day. */
export function monthsBefore(now: number, months: number, offset: number): number {
  const [year, month, day] = localDateKey(now, offset).split("-").map(Number);
  const target = new Date(Date.UTC(year!, month! - 1 - months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  const key = `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(day!, last)).padStart(2, "0")}`;
  return dateKeyStart(key, offset);
}

/** The calendar heatmap covers the last 53 weeks, starting on a Monday and ending today. */
export function calendarStart(now: number, offset: number): number {
  return dateKeyStart(bucketKey(dateKeyStart(shiftDateKey(localDateKey(now, offset), -364), offset), "week", offset), offset);
}

/** Active-day streaks over day keys with usage; the current streak may end yesterday when today has no usage yet. */
export function streaks(active: ReadonlySet<string>, today: string): { current: number; longest: number } {
  let longest = 0, run = 0;
  for (const key of [...active].sort()) {
    run = active.has(shiftDateKey(key, -1)) ? run + 1 : 1;
    longest = Math.max(longest, run);
  }
  let current = 0;
  for (let key = active.has(today) ? today : shiftDateKey(today, -1); active.has(key); key = shiftDateKey(key, -1)) current++;
  return { current, longest };
}

/**
 * Month-to-date spending against a monthly target. The projection extrapolates the average daily spend so far over the whole month;
 * elapsed time counts at least one day so the first hours of a month do not project extreme values.
 */
export function budgetPace(spent: number, budget: number, now: number, offset: number): { ratio: number; projected: number; elapsedRatio: number } {
  const start = localMonthStart(now, offset);
  const end = localMonthStart(start + 32 * dayMs, offset);
  const elapsedDays = Math.max(1, (now - start) / dayMs);
  const monthDays = (end - start) / dayMs;
  return { ratio: spent / budget, projected: spent / elapsedDays * monthDays, elapsedRatio: Math.min(1, (now - start) / (end - start)) };
}
