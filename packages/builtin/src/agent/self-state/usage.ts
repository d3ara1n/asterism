import { usageItemLevel, type UsageLevel, type UsageUnit } from "@asterism-app/sdk/contracts";

/** The state contract flattens a balance's currency code or monetary symbol into one string; currency codes are three capital letters. */
export function balanceUnit(unit: string): UsageUnit {
  return /^[A-Z]{3}$/u.test(unit) ? { type: "currency", code: unit } : { type: "symbol", symbol: unit };
}
/** Balances and quotas share the provider usage thresholds so they read the same here as in the conversation toolbar. */
export function balanceLevel(remaining: number, unit: UsageUnit): UsageLevel {
  return usageItemLevel({ type: "balance", id: "balance", scope: "account", label: "", remaining, unit });
}
export function quotaLevel(remaining: number): UsageLevel {
  return usageItemLevel({ type: "quota", id: "quota", scope: "plan", label: "", value: { type: "ratio", remaining },
    window: { mode: "unknown", periodSeconds: null, resetAt: null } });
}
