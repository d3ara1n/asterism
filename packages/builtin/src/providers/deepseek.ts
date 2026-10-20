import { z } from "zod";
import type { UsageItem } from "@atelier/sdk/contracts";
import { decimal, jsonUsage, parseUsageResponse } from "./usage-http.ts";
import { usageMessages as messages } from "../messages/usage.ts";

const response = z.object({ balance_infos: z.array(z.object({
  currency: z.string().regex(/^[A-Z]{3}$/u), total_balance: decimal,
})) });
/** total_balance 已包含赠送和充值部分；按币种展示，不再累加子项。 */
export function parseDeepSeekBalance(raw: unknown): UsageItem[] {
  return parseUsageResponse(response, raw).balance_infos.map(info => ({
    id: `balance-${info.currency}`, type: "balance", scope: "account", label: messages.balance,
    remaining: info.total_balance, currency: info.currency,
  }));
}
export const createDeepSeekUsage = (transport: typeof fetch = fetch) => jsonUsage({
  id: "deepseek", label: "DeepSeek", path: "/user/balance", parse: parseDeepSeekBalance,
}, transport);
