import { z } from "zod";
import { UsageQueryError, type QueryUsageProvider } from "@asterism-app/sdk/runtime";
import { fetchUsageJson, parseUsageResponse } from "./usage-http.ts";
import { usageMessages as messages } from "../messages/usage.ts";

const response = z.object({ balance: z.number() });

export const createKiloUsage = (transport: typeof fetch = fetch): QueryUsageProvider => ({
  id: "kilo-gateway", label: "Kilo Gateway",
  async query(context) {
    // Kilo's official personal balance API is on a different origin from inference. Never forward a custom site's key to it.
    if (new URL(context.connection.endpoint).origin !== "https://ai-gateway.kilo.ai") throw new UsageQueryError("unsupported");
    const { balance } = parseUsageResponse(response, await fetchUsageJson(context, "https://api.kilo.ai/api/profile/balance", transport));
    return [{ id: "balance", type: "balance", scope: "account", label: messages.balance, remaining: balance,
      unit: { type: "currency", code: "USD" } }];
  },
});
