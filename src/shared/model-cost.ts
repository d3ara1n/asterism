import { z } from "zod";

export const priceUnits = ["token", "image", "second"] as const;
/** 金额使用价格表的统一币种；amount 是每 per 个 unit 的价格，0 表示免费。 */
export const unitPriceSchema = z.strictObject({
  amount: z.number().nonnegative(),
  unit: z.enum(priceUnits),
  per: z.number().positive(),
});
export type UnitPrice = z.infer<typeof unitPriceSchema>;

/** 模态内的计费项可以采用不同单位；缺项或 null 均表示未知。 */
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

/** 按整次请求的输入 token 总量选档；达到阈值即使用该档全部单价，不做分段累进。 */
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
