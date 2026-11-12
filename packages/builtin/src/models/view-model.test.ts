import { describe, expect, it } from "vitest";
import { emptyModalityRates, emptyModelRates, type UnitPrice } from "@asterism-app/sdk/contracts";
import { groupByProvider, priceSections } from "./view-model.ts";

const price = (amount: number, per: number, unit: UnitPrice["unit"] = "token"): UnitPrice => ({ amount, per, unit });

describe("model listing groups", () => {
  it("splits at the first slash and keeps first-seen provider and model order", () => {
    expect(groupByProvider(["b/x", "a/org/model", "b/y"])).toEqual([
      { provider: "b", models: [{ expression: "b/x", model: "x" }, { expression: "b/y", model: "y" }] },
      { provider: "a", models: [{ expression: "a/org/model", model: "org/model" }] },
    ]);
  });
});

describe("price bars", () => {
  it("normalizes amounts by their quoted base before comparing", () => {
    // $1 per 1k tokens is $1000 per 1M, twice the $500 per 1M input price.
    const rates = { ...emptyModelRates(), text: { ...emptyModalityRates(), input: price(500, 1_000_000), output: price(1, 1000) } };
    expect(priceSections(rates)[0]!.rows.map(row => [row.item, row.share])).toEqual([["input", 0.5], ["output", 1]]);
  });

  it("compares only within one billing unit and omits modalities without prices", () => {
    const rates = { ...emptyModelRates(), image: { ...emptyModalityRates(), input: price(2, 1_000_000), output: price(0.04, 1, "image") } };
    expect(priceSections(rates).map(section => [section.modality, section.rows.map(row => row.share)])).toEqual([["image", [1, 1]]]);
  });

  it("keeps free prices at an empty bar instead of dividing by zero", () => {
    const rates = { ...emptyModelRates(), text: { ...emptyModalityRates(), input: price(0, 1_000_000) } };
    expect(priceSections(rates)[0]!.rows[0]!.share).toBe(0);
  });
});
