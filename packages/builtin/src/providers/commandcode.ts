import { z } from "zod";
import type { UsageItem, UsageUnit } from "@asterism-app/sdk/contracts";
import type { QueryUsageProvider } from "@asterism-app/sdk/runtime";
import { fetchUsageJson, parseUsageResponse } from "./usage-http.ts";
import { usageMessages as messages } from "../messages/usage.ts";

const identity = z.object({ success: z.literal(true), org: z.object({ id: z.string().min(1) }).nullable() });
const window = z.object({ used: z.number().nonnegative(), cap: z.number().nonnegative(), resetAt: z.number().nonnegative().nullish() });
const response = z.object({
  credits: z.object({ monthlyCredits: z.number(), purchasedCredits: z.number(), freeCredits: z.number() }),
  windowLimits: z.object({ fiveHour: window.nullish(), weekly: window.nullish() }).nullish(),
});
const credits: UsageUnit = { type: "count", label: messages.credits };

/** Credits are service-defined units, not USD. Only the response supplies balances and caps, independently of the plan. */
export function parseCommandCodeUsage(raw: unknown): UsageItem[] {
  const data = parseUsageResponse(response, raw);
  const items: UsageItem[] = [{ id: "balance", type: "balance", scope: "account", label: messages.balance,
    remaining: data.credits.monthlyCredits + data.credits.purchasedCredits + data.credits.freeCredits, unit: credits }];
  for (const [id, periodSeconds] of [["fiveHour", 18_000], ["weekly", 604_800]] as const) {
    const value = data.windowLimits?.[id];
    if (!value || value.cap === 0) continue;
    items.push({ id, type: "quota", scope: "plan", category: "allowance",
      value: { type: "quantity", limit: value.cap, remaining: Math.max(0, value.cap - value.used), unit: credits },
      // Zero means the window has not opened. A past reset does not manufacture fresh allowance.
      window: { mode: "rolling", periodSeconds, resetAt: value.resetAt || null } });
  }
  return items;
}

export function createCommandCodeUsage(transport: typeof fetch = fetch): QueryUsageProvider {
  return { id: "commandcode", label: "Command Code", async query(context) {
    const account = parseUsageResponse(identity, await fetchUsageJson(context, "/alpha/whoami?limits=1", transport));
    const path = new URL("/alpha/billing/credits", context.connection.endpoint);
    if (account.org) path.searchParams.set("orgId", account.org.id);
    return parseCommandCodeUsage(await fetchUsageJson(context, `${path.pathname}${path.search}`, transport));
  } };
}
