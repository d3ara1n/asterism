import { z } from "zod";
import type { UsageItem } from "@asterism-app/sdk/contracts";
import { jsonUsage, parseUsageResponse } from "./usage-http.ts";
import { usageMessages as messages } from "../messages/usage.ts";

const response = z.union([z.object({ balance: z.number() }), z.object({ balance_usd: z.number() })]);

export function parseCharmHyperCredits(raw: unknown): UsageItem[] {
  const credits = parseUsageResponse(response, raw);
  // Charm's own clients suppress the balance when Hypercredit display is disabled for the team.
  if (!("balance" in credits)) return [];
  return [{
    id: "balance", type: "balance", scope: "account", label: messages.balance,
    remaining: credits.balance, unit: { type: "count", label: "Hypercredits" },
  }];
}

export const createCharmHyperUsage = (transport: typeof fetch = fetch) => jsonUsage({
  id: "charm-hyper", label: "Charm Hyper", path: "/v1/credits", parse: parseCharmHyperCredits,
}, transport);
