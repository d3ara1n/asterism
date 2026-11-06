import { z } from "zod";
import type { UsageItem } from "@asterism-app/sdk/contracts";
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
    // unit 3 counts hours; unit 6 is a weekly window whose number is reported as both 1 and 7, so it is not a number of weeks.
    const periodSeconds = row.unit === 3 && row.number !== undefined ? row.number * 3_600 : row.unit === 6 ? 604_800 : null;
    return { type: "quota", id: `${row.type}-${row.unit ?? "unknown"}-${row.unit === 6 ? 1 : row.number ?? "unknown"}`,
      ...(periodSeconds === null && { label: messages.window }),
      scope: "plan", value: { type: "ratio", remaining: (100 - row.percentage) / 100 },
      window: { mode: "unknown", periodSeconds, resetAt: row.nextResetTime ?? null } };
  });
}
export function createZhipuUsage(transport: typeof fetch = fetch, id: "zai-plan-cn" | "zai-plan" = "zai-plan-cn"): QueryUsageProvider {
  return jsonUsage({ id, label: id === "zai-plan-cn" ? messages.zhipu : "Z.ai Coding Plan",
    path: "/api/monitor/usage/quota/limit", auth: "raw", parse: parseZhipuQuota }, transport);
}
