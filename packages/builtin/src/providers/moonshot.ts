import { z } from "zod";
import type { UsageItem } from "@asterism/sdk/contracts";
import { jsonUsage, parseUsageResponse } from "./usage-http.ts";
import { usageMessages as messages } from "../messages/usage.ts";

const response = z.object({ code: z.literal(0), status: z.literal(true), data: z.object({ available_balance: z.number() }) });
/** Moonshot returns no currency; the selected regional query defines it. available_balance is already the total available amount. */
export function parseMoonshotBalance(raw: unknown, currency: "CNY" | "USD"): UsageItem[] {
  const { data } = parseUsageResponse(response, raw);
  return [{ id: "balance", type: "balance", scope: "account", label: messages.balance, remaining: data.available_balance, currency }];
}
export const createMoonshotUsage = (id: "kimi-cn" | "kimi", transport: typeof fetch = fetch) => jsonUsage({
  id, label: id === "kimi-cn" ? "Kimi (CN)" : "Kimi", path: "/v1/users/me/balance",
  parse: raw => parseMoonshotBalance(raw, id === "kimi-cn" ? "CNY" : "USD"),
}, transport);
