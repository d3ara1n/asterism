import { z } from "zod";
import { pluginNamespace, type UsageItem } from "@asterism-app/sdk/contracts";
import { definePlugin, UsageQueryError, type HeadersUsageProvider } from "@asterism-app/sdk/runtime";

const ns = pluginNamespace("example.header-usage");
const balance = z.coerce.number();
const currency = z.string().regex(/^[A-Z]{3}$/u);
/** The example gateway puts account balances in inference response headers; the source and balance/quota result types are independent. */
const usage: HeadersUsageProvider = {
  id: "example-header-balance", label: "Example gateway balance", source: "headers",
  parseHeaders({ headers }) {
    const amount = headers["x-account-balance"], unit = headers["x-account-currency"];
    if (amount === undefined || unit === undefined) return null;
    const value = balance.safeParse(amount), code = currency.safeParse(unit);
    if (!amount.trim() || !value.success || !code.success) throw new UsageQueryError("protocol");
    return [{ id: "wallet", type: "balance", scope: "account", label: "Account balance",
      remaining: value.data, currency: code.data }] satisfies UsageItem[];
  },
};
export default definePlugin({ namespace: ns, setup: () => ({ usageProviders: [usage] }) });
