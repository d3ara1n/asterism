import { z } from "zod";
import { emptyModelRates, modelCostSchema, type ModelRates, type UnitPrice } from "@atelier/sdk/contracts";

/** 旧配置的平铺单价均为 USD / 百万 token；只在存储边界转换，不进入公共配置契约。 */
const price = z.number().nonnegative().nullable();
const legacyRatesSchema = z.strictObject({
  input: price, output: price, cacheRead: price, cacheWrite: price, reasoning: price,
  inputAudio: price, outputAudio: price,
  inputImage: price.default(null), outputImage: price.default(null),
  inputVideo: price.default(null), outputVideo: price.default(null),
});
const legacyCostSchema = z.strictObject({
  currency: z.literal("USD"), rates: legacyRatesSchema,
  tiers: z.array(z.strictObject({ fromInputTokens: z.number(), rates: legacyRatesSchema })),
});
const tokenPrice = (amount: number | null): UnitPrice | null => amount === null ? null : { amount, unit: "token", per: 1_000_000 };
function modelRates(old: z.infer<typeof legacyRatesSchema>): ModelRates {
  const rates = emptyModelRates();
  rates.text = {
    input: tokenPrice(old.input), output: tokenPrice(old.output),
    cacheRead: tokenPrice(old.cacheRead), cacheWrite: tokenPrice(old.cacheWrite), reasoning: tokenPrice(old.reasoning),
  };
  rates.image.input = tokenPrice(old.inputImage);
  rates.image.output = tokenPrice(old.outputImage);
  rates.audio.input = tokenPrice(old.inputAudio);
  rates.audio.output = tokenPrice(old.outputAudio);
  rates.video.input = tokenPrice(old.inputVideo);
  rates.video.output = tokenPrice(old.outputVideo);
  return rates;
}
export function migrateModelCost(raw: unknown): unknown {
  const legacy = legacyCostSchema.safeParse(raw);
  if (!legacy.success) return raw;
  return modelCostSchema.parse({
    currency: legacy.data.currency, rates: modelRates(legacy.data.rates),
    tiers: legacy.data.tiers.map(tier => ({ fromInputTokens: tier.fromInputTokens, rates: modelRates(tier.rates) })),
  });
}
