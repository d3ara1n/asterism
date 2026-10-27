import { z } from "zod";
import { pluginNamespace, type ModelProviderPreset, type UsageItem } from "@asterism/sdk/contracts";
import { definePlugin, UsageQueryError, type UsageProvider } from "@asterism/sdk/runtime";

const ns = pluginNamespace("example.allowance");
// Example site contract: GET /account/allowance returns the balance and remaining fraction of a five-hour window; the provider handles protocol parsing.
const response = z.object({ balance: z.number(), currency: z.string().regex(/^[A-Z]{3}$/u), remainingRatio: z.number().min(0).max(1), resetAt: z.number() });
const usage: UsageProvider = {
  id: "example-plan", label: "Example plan",
  async query({ connection, credential, signal }) {
    if (!credential) throw new UsageQueryError("credential");
    const result = await fetch(new URL("/account/allowance", connection.endpoint), {
      headers: { Authorization: `Bearer ${credential}` }, signal, redirect: "error",
    });
    if (!result.ok) throw new UsageQueryError(result.status === 401 ? "authentication" : "server");
    const parsed = response.safeParse(await result.json());
    if (!parsed.success) throw new UsageQueryError("protocol");
    const value = parsed.data;
    return [
      { id: "wallet", type: "balance", scope: "account", label: "Balance", remaining: value.balance, currency: value.currency },
      { id: "five-hours", type: "quota", scope: "plan", label: "5h", value: { type: "ratio", remaining: value.remainingRatio },
        window: { mode: "rolling", durationMs: 18_000_000, resetAt: value.resetAt } },
    ] satisfies UsageItem[];
  },
};
const preset: ModelProviderPreset = {
  id: "example-plan", name: "Example plan", billing: "subscription",
  connection: { protocol: "openai-responses", baseUrl: "https://example.invalid/v1", auth: "api_key", compatibility: [],
    usage: usage.id, fixedFields: ["protocol", "baseUrl", "auth", "compatibility", "usage"] },
  sources: ["https://example.invalid/docs"], verifiedOn: "2026-10-20",
};
export default definePlugin({ namespace: ns, version: "1.0.0", setup: () => ({
  usageProviders: [usage], modelProviderPresets: [{ type: "add", preset }],
}) });
