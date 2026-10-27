import { z } from "zod";

export const priceUnits = ["token", "image", "second"] as const;
/** Amounts use the price table's common currency; amount is the price per per units of unit, and 0 means free. */
export const unitPriceSchema = z.strictObject({
  amount: z.number().nonnegative(),
  unit: z.enum(priceUnits),
  per: z.number().positive(),
});
export type UnitPrice = z.infer<typeof unitPriceSchema>;

/** Billing items within a modality can use different units; missing items and null both mean unknown. */
const itemPrice = unitPriceSchema.nullable().default(null);
export const modalityRatesSchema = z.strictObject({
  input: itemPrice, output: itemPrice, cacheRead: itemPrice, cacheWrite: itemPrice, reasoning: itemPrice,
});
export type ModalityRates = z.infer<typeof modalityRatesSchema>;
export const emptyModalityRates = (): ModalityRates => ({ input: null, output: null, cacheRead: null, cacheWrite: null, reasoning: null });
export const modelRatesSchema = z.strictObject({
  text: modalityRatesSchema.default(emptyModalityRates),
  image: modalityRatesSchema.default(emptyModalityRates),
  audio: modalityRatesSchema.default(emptyModalityRates),
  video: modalityRatesSchema.default(emptyModalityRates),
});
export type ModelRates = z.infer<typeof modelRatesSchema>;
export const emptyModelRates = (): ModelRates => ({
  text: emptyModalityRates(), image: emptyModalityRates(), audio: emptyModalityRates(), video: emptyModalityRates(),
});

/** Select a tier using the entire request's total input tokens; reaching a threshold applies all prices in that tier, without progressive pricing across tiers. */
export const modelCostSchema = z.strictObject({
  currency: z.literal("USD"),
  rates: modelRatesSchema,
  tiers: z.array(z.strictObject({
    fromInputTokens: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    rates: modelRatesSchema,
  })),
}).superRefine((cost, context) => {
  cost.tiers.forEach((tier, index) => {
    if (index > 0 && tier.fromInputTokens <= cost.tiers[index - 1]!.fromInputTokens)
      context.addIssue({ code: "custom", path: ["tiers", index, "fromInputTokens"], message: "Price thresholds must be strictly increasing." });
  });
});
export type ModelCost = z.infer<typeof modelCostSchema>;
