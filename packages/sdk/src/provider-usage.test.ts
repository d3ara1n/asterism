import { describe, expect, it } from "vitest";
import { primaryQuota, quotaRemaining, usageItemsSchema, type QuotaItem } from "./provider-usage.ts";

const quota = (id: string, durationMs: number | null, resetAt: number): QuotaItem => ({
  id, label: id, type: "quota", scope: "plan", value: { type: "ratio", remaining: 0.6 },
  window: { mode: "rolling", durationMs, resetAt },
});
describe("Public account usage results", () => {
  // The toolbar selects the shortest period; an imminent weekly reset cannot substitute for a five-hour window.
  it("selects the primary window by period length, consumes ratios and absolute quantities consistently, and allows balances to coexist", () => {
    const weekly = quota("week", 604800000, 1), rolling = quota("5h", 18000000, 999999);
    rolling.value = { type: "quantity", remaining: 25, limit: 100, unit: "requests" };
    const items = usageItemsSchema.parse([
      { id: "wallet", type: "balance", scope: "account", label: "Balance", currency: "CNY", remaining: -2 },
      quota("unknown", null, 0), weekly, rolling,
    ]);
    expect(primaryQuota(items)?.id).toBe("5h");
    expect(quotaRemaining(primaryQuota(items)!)).toBe(0.25);
    expect(quotaRemaining(weekly)).toBe(0.6);
    expect(primaryQuota(items.slice(0, 1))).toBeNull();
  });
  // Reject contradictory results that cannot be displayed at the data boundary; UI clamping must not disguise them as valid quotas.
  it("rejects duplicate identities, invalid ratios, and remaining quantities above the limit", () => {
    const item = quota("test", 1000, 1000);
    expect(usageItemsSchema.safeParse([item, item]).success).toBe(false);
    expect(usageItemsSchema.safeParse([{ ...item, value: { type: "ratio", remaining: 1.1 } }]).success).toBe(false);
    expect(usageItemsSchema.safeParse([{ ...item, value: { type: "quantity", remaining: 2, limit: 1, unit: "tokens" } }]).success).toBe(false);
  });
});
