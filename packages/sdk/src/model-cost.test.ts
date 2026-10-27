import { describe, expect, it } from "vitest";
import { emptyModelRates, modelCostSchema, unitPriceSchema } from "./model-cost.ts";

// The pricing structure represents modalities, billing items, and units separately.
describe("Model API reference pricing contract", () => {
  // Each billing item owns its unit and base quantity, keeping image input tokens, output image counts, and audio durations distinct.
  it("supports different units within one modality and preserves units and base quantities in base prices and tiers", () => {
    const image = { input: { amount: 3, unit: "token", per: 1_000_000 }, output: { amount: 0.04, unit: "image", per: 1 } };
    const audio = { input: { amount: 0.006, unit: "second", per: 60 } };
    const video = { output: { amount: 0.1, unit: "second", per: 1 } };
    const parsed = modelCostSchema.parse({
      currency: "USD", rates: { image, audio, video },
      tiers: [{ fromInputTokens: 200000, rates: { image: { ...image, cacheRead: { amount: 1, unit: "token", per: 1_000_000 } } } }],
    });
    expect(parsed.rates.image).toMatchObject(image);
    expect(parsed.rates.audio).toMatchObject(audio);
    expect(parsed.rates.video).toMatchObject(video);
    expect(parsed.rates.text.input).toBeNull();
    expect(parsed.rates.image.cacheRead).toBeNull();
    expect(parsed.tiers[0]?.rates.image).toMatchObject({ ...image, cacheRead: { amount: 1, unit: "token", per: 1_000_000 } });
    expect(parsed.tiers[0]?.rates.audio.input).toBeNull();
  });

  // Unknown differs from free; non-finite amounts, invalid units, and zero base quantities make downstream calculations incorrect or uninterpretable and must be rejected at the configuration boundary.
  it("preserves zero prices and unknown values, rejecting invalid amounts, units, base quantities, and per-item currencies", () => {
    const free = { amount: 0, unit: "token", per: 1_000_000 };
    const parsed = modelCostSchema.parse({ currency: "USD", rates: { text: { input: free, output: null } }, tiers: [] });
    expect(parsed.rates.text).toMatchObject({ input: free, output: null });
    for (const amount of [-1, Infinity, NaN]) expect(unitPriceSchema.safeParse({ ...free, amount }).success).toBe(false);
    for (const per of [0, -1, Infinity, NaN]) expect(unitPriceSchema.safeParse({ ...free, per }).success).toBe(false);
    expect(unitPriceSchema.safeParse({ ...free, unit: "USD" }).success).toBe(false);
    expect(unitPriceSchema.safeParse({ ...free, currency: "CNY" }).success).toBe(false);
    expect(modelCostSchema.safeParse({ ...parsed, currency: "CNY" }).success).toBe(false);
    expect(modelCostSchema.safeParse({ ...parsed, rates: { input: 1, output: 2 } }).success).toBe(false);
  });

  // Input token tier thresholds are inclusive, increasing, and unique; a price's unit does not change the dimension used to select a tier.
  it("requires explicit, ordered, unique integer thresholds", () => {
    const tiers = (thresholds: number[]) => thresholds.map(fromInputTokens => ({ fromInputTokens, rates: emptyModelRates() }));
    const cost = { currency: "USD", rates: emptyModelRates(), tiers: tiers([0, 128000, 272000]) };
    expect(modelCostSchema.safeParse(cost).success).toBe(true);
    for (const thresholds of [[128000, 128000], [272000, 128000], [-1], [1.5]])
      expect(modelCostSchema.safeParse({ ...cost, tiers: tiers(thresholds) }).success).toBe(false);
  });
});
