import { z } from "zod";
import { withValues, type UsageItem } from "@asterism-app/sdk/contracts";
import type { QueryUsageProvider } from "@asterism-app/sdk/runtime";
import { fetchUsageJson, parseUsageResponse, timestamp } from "./usage-http.ts";
import { usageMessages as messages } from "../messages/usage.ts";

const interval = z.enum(["daily", "weekly", "monthly"]);
const budget = z.object({ limit_usd: z.number().nonnegative(), remaining_usd: z.number(),
  reset_interval: interval.nullable(), resets_at: timestamp.nullish() })
  .refine(value => value.remaining_usd <= value.limit_usd);
const keyResponse = z.object({ data: z.object({
  limit: z.number().nonnegative().nullable(), limit_remaining: z.number().nullable(),
  limit_reset: interval.nullish(), effective_budget: budget.nullish(), is_management_key: z.boolean().optional(),
}).refine(value => value.limit === null || value.limit_remaining === null || value.limit_remaining <= value.limit) });
const creditsResponse = z.object({ data: z.object({ total_credits: z.number(), total_usage: z.number() }) });

/** Prioritizes the current key's effective budget; an amount limit without a period is not an account top-up balance. */
export function parseOpenRouterKey(raw: unknown): { items: UsageItem[]; management: boolean } {
  const { data } = parseUsageResponse(keyResponse, raw);
  const remaining = data.effective_budget?.remaining_usd ?? data.limit_remaining;
  if (remaining === null) return { items: [], management: data.is_management_key === true };
  const limit = data.effective_budget?.limit_usd ?? data.limit;
  const reset = data.effective_budget ? data.effective_budget.reset_interval : data.limit_reset ?? null;
  let item: UsageItem;
  if (reset && limit !== null) {
    const label = withValues(messages.keyWindow, { window: reset === "daily" ? "1d" : reset === "weekly" ? "1w" : "1mo" });
    item = { id: "key-budget", type: "quota", scope: "key", label,
      value: limit === 0 ? { type: "ratio", remaining: 0 }
        : { type: "quantity", limit, remaining: Math.max(0, remaining), unit: "USD" },
      window: { mode: "fixed", durationMs: reset === "daily" ? 86400000 : reset === "weekly" ? 604800000 : null,
        resetAt: data.effective_budget?.resets_at ?? null } };
  } else item = { id: "key-budget", type: "balance", scope: "key", label: messages.keyBalance, remaining, currency: "USD" };
  return { items: [item], management: data.is_management_key === true };
}
export function parseOpenRouterCredits(raw: unknown): UsageItem[] {
  const { data } = parseUsageResponse(creditsResponse, raw);
  return [{ id: "account-balance", type: "balance", scope: "account", label: messages.balance,
    remaining: data.total_credits - data.total_usage, currency: "USD" }];
}
export function createOpenRouterUsage(transport: typeof fetch = fetch): QueryUsageProvider {
  return { id: "openrouter", label: "OpenRouter", async query(context) {
    const current = parseOpenRouterKey(await fetchUsageJson(context, "/api/v1/key", transport));
    if (!current.management) return current.items;
    return [...parseOpenRouterCredits(await fetchUsageJson(context, "/api/v1/credits", transport)), ...current.items];
  } };
}
