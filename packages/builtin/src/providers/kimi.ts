import { z } from "zod";
import { withValues, type QuotaItem, type UsageItem } from "@asterism-app/sdk/contracts";
import { jsonUsage, parseUsageResponse, timestamp } from "./usage-http.ts";
import { usageMessages as messages } from "../messages/usage.ts";

const count = z.union([z.number(), z.string().regex(/^\d+$/u).transform(Number)])
  .pipe(z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER));
const detail = z.object({
  limit: count.refine(value => value > 0), used: count.optional(), remaining: count.optional(),
  resetTime: timestamp.nullish(), resetAt: timestamp.nullish(), reset_time: timestamp.nullish(), reset_at: timestamp.nullish(),
}).refine(value => value.used !== undefined || value.remaining !== undefined)
  .refine(value => value.remaining === undefined || value.remaining <= value.limit);
const response = z.object({
  usage: detail.nullish(),
  limits: z.array(z.object({ name: z.string().optional(), window: z.object({ duration: count.refine(value => value > 0), timeUnit: z.string().min(1) }), detail })).optional(),
}).refine(value => value.usage !== undefined || value.limits !== undefined);
const minutes: Record<string, number> = { MINUTE: 1, HOUR: 60, DAY: 1440, WEEK: 10080 };
function quota(value: z.infer<typeof detail>, id: string, label: QuotaItem["label"], durationMs: number | null): QuotaItem {
  return { id, label, type: "quota", scope: "plan",
    value: { type: "quantity", limit: value.limit, remaining: value.remaining ?? Math.max(0, value.limit - value.used!), unit: messages.planUnits },
    window: { mode: "unknown", durationMs, resetAt: value.resetTime ?? value.resetAt ?? value.reset_time ?? value.reset_at ?? null } };
}
/** Shows weekly summaries and duplicate weekly windows only once; retains absolute allowances without interpreting unknown units as requests or tokens. */
export function parseKimiQuota(raw: unknown): UsageItem[] {
  const data = parseUsageResponse(response, raw);
  const windows = new Map<string, QuotaItem>();
  if (data.usage) windows.set("10080", quota(data.usage, "window-10080", withValues(messages.weeks, { count: 1 }), 604_800_000));
  for (const row of data.limits ?? []) {
    const unit = row.window.timeUnit.toUpperCase().replace(/^TIME_UNIT_/, "");
    const duration = row.window.duration;
    const length = minutes[unit] === undefined ? null : duration * minutes[unit]!;
    const id = length === null ? `${unit}-${duration}` : String(length);
    if (windows.has(id)) continue;
    const label = length !== null
      ? length % 10080 === 0 ? withValues(messages.weeks, { count: length / 10080 })
        : length % 1440 === 0 ? withValues(messages.days, { count: length / 1440 })
        : length % 60 === 0 ? withValues(messages.hours, { count: length / 60 })
        : withValues(messages.minutes, { count: length })
      : unit === "MONTH" ? withValues(messages.months, { count: duration }) : row.name ?? messages.window;
    windows.set(id, quota(row.detail, `window-${id}`, label, length === null ? null : length * 60_000));
  }
  return [...windows.values()];
}
export const createKimiUsage = (id: "kimi-plan-cn" | "kimi-plan", transport: typeof fetch = fetch) => jsonUsage({
  id, label: id === "kimi-plan-cn" ? "Kimi Code (CN)" : "Kimi Code", path: "/coding/v1/usages", parse: parseKimiQuota,
}, transport);
