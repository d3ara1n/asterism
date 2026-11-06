import { z } from "zod";
import type { UsageItem, UsageUnit } from "@asterism-app/sdk/contracts";
import { UsageQueryError, type QueryUsageProvider } from "@asterism-app/sdk/runtime";
import { fetchUsageJson, parseUsageResponse } from "./usage-http.ts";
import { usageMessages as messages } from "../messages/usage.ts";

const tokenResponse = z.object({ code: z.literal(true), data: z.object({
  total_available: z.number(), unlimited_quota: z.boolean(),
  // Present only when the key owner allows account queries through this key.
  user_quota: z.object({ total_available: z.number() }).optional(),
}) });
const statusResponse = z.object({ success: z.literal(true), data: z.object({
  quota_per_unit: z.number().positive(), quota_display_type: z.enum(["USD", "CNY", "TOKENS", "CUSTOM"]),
  usd_exchange_rate: z.number().positive(), custom_currency_symbol: z.string(), custom_currency_exchange_rate: z.number().positive(),
}) });

/** Mirrors the site's balance display: quota converts to its USD reference, then to the configured currency, custom symbol, or raw quota. */
export function newApiDisplay(raw: unknown): (quota: number) => { remaining: number; unit: UsageUnit } {
  const { data } = parseUsageResponse(statusResponse, raw);
  const usd = (quota: number) => quota / data.quota_per_unit;
  switch (data.quota_display_type) {
    case "CNY": return quota => ({ remaining: usd(quota) * data.usd_exchange_rate, unit: { type: "currency", code: "CNY" } });
    case "CUSTOM": return quota => ({ remaining: usd(quota) * data.custom_currency_exchange_rate,
      unit: { type: "symbol", symbol: data.custom_currency_symbol.trim() || "¤" } });
    case "TOKENS": return quota => ({ remaining: quota, unit: { type: "count", label: "tokens" } });
    case "USD": return quota => ({ remaining: usd(quota), unit: { type: "currency", code: "USD" } });
  }
}
/**
 * Reports whichever amounts the site exposes. An unlimited key has no meaningful remaining amount (its counter only runs negative),
 * so it is omitted; when neither the key nor the account yields an amount, the query has nothing to report and fails.
 */
export function parseNewApiBalance(token: unknown, status: unknown): UsageItem[] {
  const { data } = parseUsageResponse(tokenResponse, token);
  const display = newApiDisplay(status);
  const items: UsageItem[] = [];
  if (!data.unlimited_quota) items.push({ id: "key-balance", type: "balance", scope: "key", label: messages.keyBalance, ...display(data.total_available) });
  if (data.user_quota) items.push({ id: "account-balance", type: "balance", scope: "account", label: messages.balance, ...display(data.user_quota.total_available) });
  if (!items.length) throw new UsageQueryError("unsupported");
  return items;
}
export function createNewApiUsage(transport: typeof fetch = fetch): QueryUsageProvider {
  return { id: "new-api", label: "New API", async query(context) {
    const basePath = new URL(context.connection.endpoint).pathname.replace(/\/+$/u, "").replace(/\/v1$/u, "");
    const [token, status] = await Promise.all([
      fetchUsageJson(context, `${basePath}/api/usage/token/`, transport),
      fetchUsageJson(context, `${basePath}/api/status`, transport),
    ]);
    return parseNewApiBalance(token, status);
  } };
}
