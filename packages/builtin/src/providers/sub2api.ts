import { z } from "zod";
import type { QuotaItem, UsageItem, UsageUnit } from "@asterism-app/sdk/contracts";
import { UsageQueryError, type QueryUsageProvider } from "@asterism-app/sdk/runtime";
import { fetchUsageJson, parseUsageResponse, timestamp } from "./usage-http.ts";
import { usageMessages as messages } from "../messages/usage.ts";

const usd: UsageUnit = { type: "currency", code: "USD" };
const allowance = z.object({ limit: z.number().positive(), remaining: z.number().nonnegative() })
  .refine(value => value.remaining <= value.limit);
const periods = { "5h": 18_000, "1d": 86_400, "7d": 604_800 } as const;
const response = z.object({
  mode: z.enum(["quota_limited", "unrestricted"]), isValid: z.boolean(),
  quota: allowance.optional(),
  rate_limits: z.array(allowance.safeExtend({ window: z.enum(["5h", "1d", "7d"]), reset_at: timestamp.nullish() })).optional(),
  balance: z.number().optional(), remaining: z.number().optional(),
  subscription: z.object({
    daily_limit_usd: z.number().nonnegative().nullish(), daily_usage_usd: z.number().nonnegative().optional(),
    weekly_limit_usd: z.number().nonnegative().nullish(), weekly_usage_usd: z.number().nonnegative().optional(),
    monthly_limit_usd: z.number().nonnegative().nullish(), monthly_usage_usd: z.number().nonnegative().optional(),
  }).optional(),
});

function quota(id: string, scope: QuotaItem["scope"], limit: number, remaining: number,
  periodSeconds: number | null, resetAt: number | null = null): QuotaItem {
  return { id, type: "quota", scope, category: "allowance",
    ...(periodSeconds === null && { label: messages.keyBalance }),
    value: { type: "quantity", limit, remaining, unit: usd },
    window: { mode: "unknown", periodSeconds, resetAt } };
}

/** The endpoint exposes key limits or the backing subscription/wallet, not necessarily all three. */
export function parseSub2ApiUsage(raw: unknown): UsageItem[] {
  const data = parseUsageResponse(response, raw);
  if (!data.isValid) throw new UsageQueryError("authentication");
  const items: UsageItem[] = [];
  if (data.mode === "quota_limited") {
    if (data.quota) items.push(quota("key-quota", "key", data.quota.limit, data.quota.remaining, null));
    for (const row of data.rate_limits ?? []) {
      items.push({ ...quota(`key-${row.window}`, "key", row.limit, row.remaining, periods[row.window], row.reset_at ?? null),
        category: "rate_limit", window: { mode: "fixed", periodSeconds: periods[row.window], resetAt: row.reset_at ?? null } });
    }
  } else if (data.subscription) {
    const sub = data.subscription;
    for (const [id, limit, used, period] of [
      ["plan-daily", sub.daily_limit_usd, sub.daily_usage_usd, 86_400],
      ["plan-weekly", sub.weekly_limit_usd, sub.weekly_usage_usd, 604_800],
      ["plan-monthly", sub.monthly_limit_usd, sub.monthly_usage_usd, 2_592_000],
    ] as const) {
      if (limit == null || limit === 0) continue;
      if (used === undefined) throw new UsageQueryError("protocol");
      items.push(quota(id, "plan", limit, Math.max(0, limit - used), period));
    }
  } else {
    const remaining = data.balance ?? data.remaining;
    if (remaining !== undefined && (data.balance !== undefined || remaining >= 0)) {
      items.push({ id: "account-balance", type: "balance", scope: "account", label: messages.balance, remaining, unit: usd });
    }
  }
  return items;
}

export function createSub2ApiUsage(transport: typeof fetch = fetch): QueryUsageProvider {
  return { id: "sub2api", label: "Sub2API", async query(context) {
    const basePath = new URL(context.connection.endpoint).pathname.replace(/\/+$/u, "").replace(/\/v1$/u, "");
    return parseSub2ApiUsage(await fetchUsageJson(context, `${basePath}/v1/usage`, transport));
  } };
}
