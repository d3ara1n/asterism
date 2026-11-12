import { describe, expect, it } from "vitest";
import type { BalanceItem, QuotaItem } from "@asterism-app/sdk/contracts";
import { leadingItem } from "./leading-item";

const quota = (id: string, periodSeconds: number, remaining: number): QuotaItem => ({
  id, type: "quota", scope: "plan", value: { type: "ratio", remaining }, window: { mode: "rolling", periodSeconds, resetAt: null },
});
const balance = (id: string, remaining: number): BalanceItem => ({
  id, type: "balance", scope: "account", label: id, unit: { type: "currency", code: "USD" }, remaining,
});

describe("leadingItem", () => {
  // The headline must explain the lamp color: a drained wallet outranks a healthy short window that would otherwise lead.
  it("takes the most constrained item over the shortest window", () => {
    expect(leadingItem([quota("5h", 18_000, 0.9), balance("wallet", 0)])?.id).toBe("wallet");
  });
  it("breaks ties by the shortest window, then by source order", () => {
    expect(leadingItem([quota("week", 604_800, 0.1), quota("5h", 18_000, 0.2), balance("wallet", 3)])?.id).toBe("5h");
    expect(leadingItem([balance("key", 50), balance("account", 80)])?.id).toBe("key");
    expect(leadingItem([])).toBeNull();
  });
});
