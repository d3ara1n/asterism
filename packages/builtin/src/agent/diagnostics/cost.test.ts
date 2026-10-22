import { describe, expect, it } from "vitest";
import type { Usage } from "@atelier/sdk/contracts";
import { createModelInput } from "../../../../../src/shared/configuration.ts";
import { modelCostSchema } from "@atelier/sdk/contracts";
import { diagnosticModel, estimateUsageCost } from "./cost.ts";

const usage: Usage = { input: 1000, output: 100, total: 1100, cacheRead: 200, cacheWrite: 100, reasoning: 40 };
const price = (amount: number) => ({ amount, unit: "token", per: 1_000_000 });
const cost = modelCostSchema.parse({ currency: "USD", rates: { text: {
  input: price(2), output: price(10), cacheRead: price(0.2), cacheWrite: price(3), reasoning: price(20),
} }, tiers: [] });
// 依据模型配置的计价契约与 runtime 的 usage 总量口径；不重复计算缓存／思考子项。
describe("代理用量到费用的消费适配", () => {
  it("从总量扣除已报告的缓存和思考，未独立定价的思考只计入输出一次", () => {
    const result = estimateUsageCost(usage, cost, false);
    expect(result.status).toBe("complete");
    expect(result.lines.map(line => line.quantity)).toEqual([700, 200, 100, 60, 40]);
    expect(result.amount).toBeCloseTo(0.00314, 10);
    const ordinary = structuredClone(cost); ordinary.rates.text.reasoning = null;
    const included = estimateUsageCost(usage, ordinary, false);
    expect(included.lines.map(line => line.item)).not.toContain("reasoning");
    expect(included.amount).toBeCloseTo(0.00274, 10);
    expect(usage).toEqual({ input: 1000, output: 100, total: 1100, cacheRead: 200, cacheWrite: 100, reasoning: 40 });
  });

  it("缓存细分缺失、多模态输入和矛盾数量不伪装成完整文本费用", () => {
    const missing = estimateUsageCost({ ...usage, cacheWrite: null }, cost, false);
    expect(missing.status).toBe("partial");
    expect(missing.lines[0]?.quantity).toBeNull();
    expect(missing.amount).toBeCloseTo(0.00144, 10);
    const media = estimateUsageCost(usage, cost, true);
    expect(media.status).toBe("partial");
    expect(media.lines.slice(0, 3).every(line => line.quantity === null)).toBe(true);
    expect(media.amount).toBeCloseTo(0.0014, 10);
    const invalid = estimateUsageCost({ ...usage, input: 100 }, cost, false);
    expect(invalid.lines.slice(0, 3).every(line => line.issue === "invalid")).toBe(true);
    expect(estimateUsageCost(null, cost, false)).toMatchObject({ amount: null, status: "unknown" });
    expect(estimateUsageCost({ input: 0, output: 0, total: 0, cacheRead: null, cacheWrite: null, reasoning: null }, null, false))
      .toMatchObject({ amount: 0, status: "complete" });
  });

  it("按历史身份寻找当前价格，停用仍可查价，歧义或已删除模型不借用其他模型", () => {
    const model = { ...createModelInput("p", { modelId: "m", name: "Model" }), enabled: false, cost };
    const namedLikeThinking = { ...model, modelId: "m:high" };
    const request = { model: "p/m:high", modelScope: null };
    expect(diagnosticModel(request, [model])).toBe(model);
    expect(diagnosticModel(request, [model, namedLikeThinking])).toBeNull();
    const withScope = { ...request, modelScope: JSON.stringify(["p", "anthropic", "https://provider.test", "m"]) };
    expect(diagnosticModel(withScope, [model, namedLikeThinking])).toBe(model);
    expect(diagnosticModel(withScope, [namedLikeThinking])).toBeNull();
    expect(diagnosticModel(request, [])).toBeNull();
  });
});
