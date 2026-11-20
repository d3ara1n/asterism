/**
 * Local calendar arithmetic for usage statistics. Times are UTC milliseconds; offsets are minutes east of UTC.
 * Runtime SQL bucketing and renderer ranges share these keys, so both sides agree on day, week, and month boundaries.
 */
export type Granularity = "hour" | "day" | "week" | "month";

const minute = 60_000;
export const hourMs = 3_600_000;
export const dayMs = 86_400_000;

const pad = (value: number) => String(value).padStart(2, "0");
const local = (ms: number, offset: number) => new Date(ms + offset * minute);
const dateText = (date: Date) => `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;

/** YYYY-MM-DD of the local calendar day containing ms. */
export function localDateKey(ms: number, offset: number): string {
  return dateText(local(ms, offset));
}

/** UTC milliseconds of local midnight that starts a YYYY-MM-DD key. */
export function dateKeyStart(key: string, offset: number): number {
  const [year, month, day] = key.split("-").map(Number);
  return Date.UTC(year!, month! - 1, day!) - offset * minute;
}

/** The calendar day `days` after key; negative values move backwards. */
export function shiftDateKey(key: string, days: number): string {
  const [year, month, day] = key.split("-").map(Number);
  return dateText(new Date(Date.UTC(year!, month! - 1, day! + days)));
}

export function localMonthStart(ms: number, offset: number): number {
  const date = local(ms, offset);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1) - offset * minute;
}

/** Bucket key: `YYYY-MM-DD HH:00` for hours, the day for days, the Monday for weeks, and `YYYY-MM` for months. */
export function bucketKey(ms: number, granularity: Granularity, offset: number): string {
  const date = local(ms, offset);
  if (granularity === "hour") return `${dateText(date)} ${pad(date.getUTCHours())}:00`;
  if (granularity === "day") return dateText(date);
  if (granularity === "week") return shiftDateKey(dateText(date), -((date.getUTCDay() + 6) % 7));
  return dateText(date).slice(0, 7);
}

/** UTC milliseconds where a bucket key starts. */
export function bucketStart(key: string, granularity: Granularity, offset: number): number {
  if (granularity === "hour") return dateKeyStart(key.slice(0, 10), offset) + Number(key.slice(11, 13)) * hourMs;
  if (granularity === "month") return dateKeyStart(`${key}-01`, offset);
  return dateKeyStart(key, offset);
}

function nextBucketStart(key: string, granularity: Granularity, offset: number): number {
  if (granularity === "hour") return bucketStart(key, granularity, offset) + hourMs;
  if (granularity === "day") return dateKeyStart(shiftDateKey(key, 1), offset);
  if (granularity === "week") return dateKeyStart(shiftDateKey(key, 7), offset);
  const [year, month] = key.split("-").map(Number);
  return Date.UTC(year!, month!, 1) - offset * minute;
}

/** Every bucket key overlapping [from, to), in order. */
export function bucketKeys(from: number, to: number, granularity: Granularity, offset: number): string[] {
  const keys: string[] = [];
  if (to <= from) return keys;
  let key = bucketKey(from, granularity, offset);
  while (bucketStart(key, granularity, offset) < to) {
    keys.push(key);
    key = bucketKey(nextBucketStart(key, granularity, offset), granularity, offset);
  }
  return keys;
}

/** Monday = 0 … Sunday = 6. */
export function localWeekday(ms: number, offset: number): number {
  return (local(ms, offset).getUTCDay() + 6) % 7;
}
