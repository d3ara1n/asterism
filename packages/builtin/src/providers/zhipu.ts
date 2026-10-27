import { z } from "zod";
import { withValues, type UsageItem } from "@asterism-app/sdk/contracts";
import type { QueryUsageProvider } from "@asterism-app/sdk/runtime";
import { jsonUsage, parseUsageResponse } from "./usage-http.ts";
import { usageMessages as messages } from "../messages/usage.ts";

const rowSchema = z.object({
  type: z.enum(["TOKENS_LIMIT", "CREDIT_LIMIT"]), percentage: z.number().min(0).max(100),
  number: z.number().positive().optional(), unit: z.number().int().optional(),
  nextResetTime: z.number().nonnegative().nullable().optional(),
});
const responseSchema = z.object({ data: z.object({ limits: z.array(z.object({ type: z.string() }).passthrough()) }) });

/** Percentages express ratios only, without fabricating token counts; unknown periods still retain actual allowances and reset times. */
export function parseZhipuQuota(raw: unknown): UsageItem[] {
  const data = parseUsageResponse(responseSchema, raw);
  return data.data.limits.filter(row => row.type === "TOKENS_LIMIT" || row.type === "CREDIT_LIMIT").map(raw => {
    const row = parseUsageResponse(rowSchema, raw);
    const hours = row.unit === 3 && row.number !== undefined;
    // unit 6 is a weekly window; known responses use both 1/7 for number, which must not be interpreted as a number of weeks.
    const weekly = row.unit === 6;
    return { type: "quota", id: `${row.type}-${row.unit ?? "unknown"}-${weekly ? 1 : row.number ?? "unknown"}`,
      label: hours ? withValues(messages.hours, { count: row.number! }) : weekly ? withValues(messages.weeks, { count: 1 }) : messages.window,
      scope: "plan", value: { type: "ratio", remaining: (100 - row.percentage) / 100 },
      window: { mode: "unknown", durationMs: hours ? row.number! * 3_600_000 : weekly ? 604_800_000 : null,
        resetAt: row.nextResetTime ?? null } };
  });
}
export function createZhipuUsage(transport: typeof fetch = fetch, id: "zai-plan-cn" | "zai-plan" = "zai-plan-cn"): QueryUsageProvider {
  return jsonUsage({ id, label: id === "zai-plan-cn" ? messages.zhipu : "Z.ai Coding Plan",
    path: "/api/monitor/usage/quota/limit", auth: "raw", parse: parseZhipuQuota }, transport);
}
