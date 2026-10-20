import { z } from "zod";
import { pluginNamespace, type UsageItem } from "@atelier/sdk/contracts";
import { definePlugin, UsageQueryError, type HeadersUsageProvider } from "@atelier/sdk/runtime";

const ns = pluginNamespace("example.header-usage");
const balance = z.coerce.number();
const currency = z.string().regex(/^[A-Z]{3}$/u);
/** 示例网关把账户余额放进推理响应头；来源和 balance/quota 结果类型相互独立。 */
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
export default definePlugin({ namespace: ns, version: "1.0.0", setup: () => ({ usageProviders: [usage] }) });
