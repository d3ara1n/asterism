import { describe, expect, it } from "vitest";
import { primaryQuota, quotaRemaining, usageItemLevel, usageItemsSchema, usageLevel, usagePeriodParts, type BalanceItem, type QuotaItem } from "./provider-usage.ts";

const quota = (id: string, periodSeconds: number | null, resetAt: number): QuotaItem => ({
  id, label: id, type: "quota", scope: "plan", value: { type: "ratio", remaining: 0.6 },
  window: { mode: "rolling", periodSeconds, resetAt },
});
describe("Public account usage results", () => {
  // The toolbar selects the shortest period; an imminent weekly reset cannot substitute for a five-hour window.
  it("selects the primary window by period length, consumes ratios and absolute quantities consistently, and allows balances to coexist", () => {
    const weekly = quota("week", 604800, 1), rolling = quota("5h", 18000, 999999);
    rolling.value = { type: "quantity", remaining: 25, limit: 100, unit: { type: "count", label: "requests" } };
    const items = usageItemsSchema.parse([
      { id: "wallet", type: "balance", scope: "account", label: "Balance", unit: { type: "symbol", symbol: "🍪" }, remaining: -2 },
      quota("unknown", null, 0), weekly, rolling,
    ]);
    expect(primaryQuota(items)?.id).toBe("5h");
    expect(quotaRemaining(primaryQuota(items)!)).toBe(0.25);
    expect(quotaRemaining(weekly)).toBe(0.6);
    expect(primaryQuota(items.slice(0, 1))).toBeNull();
  });
  // Reject contradictory results that cannot be displayed at the data boundary; UI clamping must not disguise them as valid quotas.
  it("rejects duplicate identities, remaining quantities above the limit, and windows with neither label nor period", () => {
    const item = quota("test", 1000, 1000);
    expect(usageItemsSchema.safeParse([item, item]).success).toBe(false);
    expect(usageItemsSchema.safeParse([{ ...item, value: { type: "quantity", remaining: 2, limit: 1, unit: { type: "count", label: "tokens" } } }]).success).toBe(false);
    const { label: _, ...unlabeled } = item;
    expect(usageItemsSchema.safeParse([unlabeled]).success).toBe(true);
    expect(usageItemsSchema.safeParse([{ ...unlabeled, window: { ...item.window, periodSeconds: null } }]).success).toBe(false);
  });
  // A window at a quarter still reads available, ten balance units likewise; anything at zero blocks requests whatever the other items say.
  it("grades windows by remaining share and balances by bare amount, letting the most constrained item decide", () => {
    const share = (remaining: number) => usageItemLevel({ ...quota("q", 60, 0), value: { type: "ratio", remaining } });
    const balance = (remaining: number): BalanceItem => ({ id: `b${remaining}`, type: "balance", scope: "account", label: "Balance",
      unit: { type: "symbol", symbol: "M$" }, remaining });
    expect([share(0.25), share(0.249), share(0)]).toEqual(["available", "low", "exhausted"]);
    expect([balance(10), balance(9.99), balance(0), balance(-1)].map(usageItemLevel)).toEqual(["available", "low", "exhausted", "exhausted"]);
    expect(usageLevel([quota("week", 604800, 0), balance(5)])).toBe("low");
    expect(usageLevel([balance(0), quota("week", 604800, 0)])).toBe("exhausted");
    expect(usageLevel([])).toBeNull();
  });
  // Exact multiples pick the largest unit; uneven lengths fall back to a smaller unit instead of rounding into a misleading fraction.
  it.each([
    [18_000, 5, "hour"], [5_400, 1.5, "hour"], [604_800, 1, "week"], [864_000, 10, "day"],
    [2_592_000, 1, "month"], [47_304_000, 1.5, "year"], [45, 45, "second"],
  ])("states %s seconds as %s %s", (seconds, value, unit) => {
    expect(usagePeriodParts(seconds)).toEqual({ value, unit });
  });
});
