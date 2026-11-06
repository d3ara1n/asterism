import { z } from "zod";
import type { QuotaItem, UiText, UsageItem } from "@asterism-app/sdk/contracts";
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
/** Calendar months count as 30 days. */
const seconds: Record<string, number> = { MINUTE: 60, HOUR: 3_600, DAY: 86_400, WEEK: 604_800, MONTH: 2_592_000 };
function quota(value: z.infer<typeof detail>, id: string, periodSeconds: number | null, label?: UiText): QuotaItem {
  return { id, ...(label !== undefined && { label }), type: "quota", scope: "plan",
    value: { type: "quantity", limit: value.limit, remaining: value.remaining ?? Math.max(0, value.limit - value.used!),
      unit: { type: "count", label: messages.planUnits } },
    window: { mode: "unknown", periodSeconds, resetAt: value.resetTime ?? value.resetAt ?? value.reset_time ?? value.reset_at ?? null } };
}
/** Shows weekly summaries and duplicate weekly windows only once; retains absolute allowances without interpreting unknown units as requests or tokens. */
export function parseKimiQuota(raw: unknown): UsageItem[] {
  const data = parseUsageResponse(response, raw);
  const windows = new Map<string, QuotaItem>();
  if (data.usage) windows.set("604800", quota(data.usage, "window-604800", 604_800));
  for (const row of data.limits ?? []) {
    const unit = row.window.timeUnit.toUpperCase().replace(/^TIME_UNIT_/, "");
    const length = seconds[unit] === undefined ? null : row.window.duration * seconds[unit]!;
    const id = length === null ? `${unit}-${row.window.duration}` : String(length);
    if (windows.has(id)) continue;
    windows.set(id, quota(row.detail, `window-${id}`, length, length === null ? row.name ?? messages.window : undefined));
  }
  return [...windows.values()];
}
export const createKimiUsage = (id: "kimi-plan-cn" | "kimi-plan", transport: typeof fetch = fetch) => jsonUsage({
  id, label: id === "kimi-plan-cn" ? "Kimi Code (CN)" : "Kimi Code", path: "/coding/v1/usages", parse: parseKimiQuota,
}, transport);
