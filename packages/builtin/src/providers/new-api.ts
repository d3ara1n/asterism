import { z } from "zod";
import type { UsageItem } from "@asterism-app/sdk/contracts";
import type { QueryUsageProvider } from "@asterism-app/sdk/runtime";
import { fetchUsageJson, parseUsageResponse } from "./usage-http.ts";
import { usageMessages as messages } from "../messages/usage.ts";

const response = z.object({ code: z.literal(true), data: z.object({
  total_available: z.number(), unlimited_quota: z.boolean(),
}) });

export function parseNewApiBalance(raw: unknown): UsageItem[] {
  const { data } = parseUsageResponse(response, raw);
  if (data.unlimited_quota) return [];
  // New API's default quota scale supplies a reference USD amount for this key.
  return [{ id: "key-balance", type: "balance", scope: "key", label: messages.keyBalance,
    remaining: data.total_available / 500_000, currency: "USD" }];
}

export function createNewApiUsage(transport: typeof fetch = fetch): QueryUsageProvider {
  return { id: "new-api", label: "New API", async query(context) {
    const basePath = new URL(context.connection.endpoint).pathname.replace(/\/+$/u, "").replace(/\/v1$/u, "");
    return parseNewApiBalance(await fetchUsageJson(context, `${basePath}/api/usage/token/`, transport));
  } };
}
