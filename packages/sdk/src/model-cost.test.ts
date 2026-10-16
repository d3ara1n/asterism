import { describe, expect, it } from "vitest";
import { emptyModelRates, modelCostSchema, unitPriceSchema } from "./model-cost.ts";

// 价格结构的预期依据为 docs/model-configuration.md「API 参考价格」。
describe("模型 API 参考价格契约", () => {
  // 各计费项独立持有单位和基数，避免图片输入 token 与输出张数、音频时长被混为一类数量。
  it("同一模态支持不同单位，基础价和档位保留单位与基数", () => {
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

  // 未知与免费不同；非有限金额、无效单位、零基数会让下游计算错误或无法解释，须在配置边界拒绝。
  it("保留零价与未知，拒绝无效金额、单位、基数和分项币种", () => {
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

  // 输入 token 档位含边界、递增且唯一；单价的 unit 不改变档位判断维度。
  it("要求明确、有序且唯一的整数阈值", () => {
    const tiers = (thresholds: number[]) => thresholds.map(fromInputTokens => ({ fromInputTokens, rates: emptyModelRates() }));
    const cost = { currency: "USD", rates: emptyModelRates(), tiers: tiers([0, 128000, 272000]) };
    expect(modelCostSchema.safeParse(cost).success).toBe(true);
    for (const thresholds of [[128000, 128000], [272000, 128000], [-1], [1.5]])
      expect(modelCostSchema.safeParse({ ...cost, tiers: tiers(thresholds) }).success).toBe(false);
  });
});
