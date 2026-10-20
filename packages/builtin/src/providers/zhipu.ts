import { z } from "zod";
import { withValues, type UsageItem } from "@atelier/sdk/contracts";
import { UsageQueryError, type UsageProvider } from "@atelier/sdk/runtime";
import { usageMessages as messages } from "../messages/usage.ts";

const rowSchema = z.object({
  type: z.enum(["TOKENS_LIMIT", "CREDIT_LIMIT"]), percentage: z.number().min(0).max(100),
  number: z.number().positive().optional(), unit: z.number().int().optional(),
  nextResetTime: z.number().nonnegative().nullable().optional(),
});
const responseSchema = z.object({ data: z.object({ limits: z.array(z.object({ type: z.string() }).passthrough()) }) });

/** 百分比只表示比例，不伪造 token 数；未知周期仍保留真实额度与重置时间。 */
export function parseZhipuQuota(raw: unknown): UsageItem[] {
  const data = responseSchema.safeParse(raw);
  if (!data.success) throw new UsageQueryError("protocol");
  return data.data.data.limits.filter(row => row.type === "TOKENS_LIMIT" || row.type === "CREDIT_LIMIT").map(raw => {
    const result = rowSchema.safeParse(raw);
    if (!result.success) throw new UsageQueryError("protocol");
    const row = result.data;
    const hours = row.unit === 3 && row.number !== undefined;
    // unit 6 为每周窗口；已知响应的 number 有 1/7 两种形态，不能解释成周数。
    const weekly = row.unit === 6;
    return { type: "quota", id: `${row.type}-${row.unit ?? "unknown"}-${weekly ? 1 : row.number ?? "unknown"}`,
      label: hours ? withValues(messages.hours, { count: row.number! }) : weekly ? withValues(messages.weeks, { count: 1 }) : messages.window,
      scope: "plan", value: { type: "ratio", remaining: (100 - row.percentage) / 100 },
      window: { mode: "unknown", durationMs: hours ? row.number! * 3_600_000 : weekly ? 604_800_000 : null,
        resetAt: row.nextResetTime ?? null } };
  });
}
export function createZhipuUsage(transport: typeof fetch = fetch): UsageProvider {
  return { id: "zai-plan-cn", label: messages.zhipu, async query({ connection, credential, signal }) {
    if (!credential) throw new UsageQueryError("credential");
    const endpoint = new URL("/api/monitor/usage/quota/limit", connection.endpoint);
    const response = await transport(endpoint, {
      headers: { Authorization: credential, Accept: "application/json" }, signal, redirect: "error",
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new UsageQueryError(response.status === 401 || response.status === 403 ? "authentication"
        : response.status === 404 || response.status === 405 ? "unsupported"
        : response.status === 429 ? "rate_limit" : response.status >= 500 ? "server" : "protocol");
    }
    let raw: unknown;
    try { raw = await response.json(); } catch { throw new UsageQueryError("protocol"); }
    return parseZhipuQuota(raw);
  } };
}
