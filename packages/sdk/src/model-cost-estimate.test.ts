import { describe, expect, it } from "vitest";
import { modelCostSchema } from "./model-cost.ts";
import { estimateModelCost, totalEstimatedCost, type CostQuantity } from "./model-cost-estimate.ts";

const price = (amount: number) => ({ amount, unit: "token", per: 1_000_000 });
const quantities = (input: number, output: number): CostQuantity[] => [
  { modality: "text", item: "input", quantity: input, unit: "token" },
  { modality: "text", item: "output", quantity: output, unit: "token" },
];
// Select a tier for each entire request before aggregation; quantities and unit prices must use matching units, and unknown data must not become free.
describe("Reference cost calculation", () => {
  it("aggregates after selecting a tier per request, includes threshold boundaries, and recalculates when prices change", () => {
    const cost = modelCostSchema.parse({ currency: "USD", rates: { text: { input: price(2), output: price(10) } },
      tiers: [{ fromInputTokens: 100, rates: { text: { input: price(4), output: price(20) } } }] });
    const first = estimateModelCost(cost, 99, quantities(99, 10));
    const second = estimateModelCost(cost, 100, quantities(100, 10));
    expect(first).toMatchObject({ status: "complete", fromInputTokens: null });
    expect(first.amount).toBeCloseTo(0.000298, 10);
    expect(second).toMatchObject({ status: "complete", fromInputTokens: 100 });
    expect(second.amount).toBeCloseTo(0.0006, 10);
    expect(totalEstimatedCost([first, second]).amount).toBeCloseTo(0.000898, 10);
    cost.rates.text.input!.amount = 3;
    expect(estimateModelCost(cost, 99, quantities(99, 10)).amount).toBeCloseTo(0.000397, 10);
    expect(first.amount).toBeCloseTo(0.000298, 10);
  });

  it("calculates image counts and durations using each billing item's base quantity and rejects tokens as a substitute for seconds", () => {
    const cost = modelCostSchema.parse({ currency: "USD", rates: {
      image: { output: { amount: 0.04, unit: "image", per: 1 } }, audio: { input: { amount: 0.006, unit: "second", per: 60 } },
    }, tiers: [] });
    const result = estimateModelCost(cost, null, [
      { modality: "image", item: "output", quantity: 2, unit: "image" },
      { modality: "audio", item: "input", quantity: 90, unit: "second" },
    ]);
    expect(result.status).toBe("complete");
    expect(result.amount).toBeCloseTo(0.089, 10);
    const mismatch = estimateModelCost(cost, null, [{ modality: "audio", item: "input", quantity: 90, unit: "token" }]);
    expect(mismatch).toMatchObject({ amount: null, status: "unknown", lines: [{ issue: "unit" }] });
    expect(estimateModelCost(cost, null, [{ modality: "audio", item: "input", quantity: 0, unit: "token" }]))
      .toMatchObject({ amount: null, status: "unknown", lines: [{ issue: "unit" }] });
  });

  it("marks results incomplete when prices, quantities, or tier selection data are missing, while distinguishing known free usage and zero quantities", () => {
    const cost = modelCostSchema.parse({ currency: "USD", rates: { text: { input: price(0) } }, tiers: [] });
    const result = estimateModelCost(cost, 10, quantities(10, 3));
    expect(result).toMatchObject({ amount: 0, status: "partial" });
    expect(result.lines[1]?.issue).toBe("price");
    expect(estimateModelCost(null, 0, quantities(0, 0))).toMatchObject({ amount: 0, status: "complete" });
    expect(estimateModelCost(cost, null, [{ modality: "text", item: "input", quantity: null, unit: "token" }]))
      .toMatchObject({ amount: null, status: "unknown" });
    const tiered = { ...cost, tiers: [{ fromInputTokens: 100, rates: cost.rates }] };
    expect(estimateModelCost(tiered, null, quantities(10, 3)).lines.every(line => line.issue === "tier")).toBe(true);
    expect(totalEstimatedCost([result, estimateModelCost(null, 5, quantities(5, 1))])).toEqual({ amount: 0, incomplete: 2 });
  });
});
