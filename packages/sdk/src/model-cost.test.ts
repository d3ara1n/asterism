import { describe, expect, it } from "vitest";
import { emptyModelRates, modelCostSchema } from "./model-cost.ts";

describe("Model API reference pricing contract", () => {
  // Ambiguous tier ordering would make price selection depend on declaration order.
  it("rejects duplicate or decreasing price thresholds", () => {
    const tiers = (thresholds: number[]) => thresholds.map(fromInputTokens => ({ fromInputTokens, rates: emptyModelRates() }));
    const cost = { currency: "USD", rates: emptyModelRates(), tiers: tiers([0, 128000, 272000]) };
    expect(modelCostSchema.safeParse(cost).success).toBe(true);
    for (const thresholds of [[128000, 128000], [272000, 128000]])
      expect(modelCostSchema.safeParse({ ...cost, tiers: tiers(thresholds) }).success).toBe(false);
  });
});
