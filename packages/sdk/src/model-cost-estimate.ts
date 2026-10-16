import type { ModelCost, ModelRates, ModalityRates, UnitPrice } from "./model-cost.ts";

/** 已按计费口径拆分的数量；调用方负责避免总量与子项重叠。 */
export interface CostQuantity {
  modality: keyof ModelRates;
  item: keyof ModalityRates;
  quantity: number | null;
  unit: UnitPrice["unit"];
}
export type CostIssue = "quantity" | "price" | "unit" | "tier" | "invalid";
export interface CostLine extends CostQuantity { price: UnitPrice | null; amount: number | null; issue: CostIssue | null }
export interface CostEstimate {
  status: "complete" | "partial" | "unknown";
  amount: number | null;
  fromInputTokens: number | null;
  lines: CostLine[];
}
export function selectModelRates(cost: ModelCost | null, inputTokens: number | null): { rates: ModelRates | null; fromInputTokens: number | null; unknownTier: boolean } {
  if (!cost) return { rates: null, fromInputTokens: null, unknownTier: false };
  if (cost.tiers.length && inputTokens === null) return { rates: null, fromInputTokens: null, unknownTier: true };
  const tier = cost.tiers.findLast(tier => inputTokens !== null && inputTokens >= tier.fromInputTokens);
  return { rates: tier?.rates ?? cost.rates, fromInputTokens: tier?.fromInputTokens ?? null, unknownTier: false };
}
/** 只消费价格与具名数量，不修改上游 usage，也不持有历史账本。 */
export function estimateModelCost(cost: ModelCost | null, inputTokens: number | null, quantities: readonly CostQuantity[]): CostEstimate {
  const selected = selectModelRates(cost, inputTokens);
  const lines = quantities.map((quantity): CostLine => {
    const price = selected.rates?.[quantity.modality][quantity.item] ?? null;
    const missing = (issue: CostIssue): CostLine => ({ ...quantity, price, amount: null, issue });
    if (quantity.quantity === null) return missing("quantity");
    if (!Number.isFinite(quantity.quantity) || quantity.quantity < 0) return missing("invalid");
    if (selected.unknownTier) return missing("tier");
    if (price && price.unit !== quantity.unit) return missing("unit");
    // 同单位的已知零数量不需要价格；零 token 不能代表零秒或零张。
    if (quantity.quantity === 0) return { ...quantity, price, amount: 0, issue: null };
    if (!price) return missing("price");
    const amount = quantity.quantity / price.per * price.amount;
    return Number.isFinite(amount) ? { ...quantity, price, amount, issue: null } : missing("invalid");
  });
  const complete = lines.length > 0 && lines.every(line => line.issue === null);
  const hasAmount = complete || lines.some(line => line.quantity !== null && line.quantity > 0 && line.amount !== null);
  const amount = hasAmount ? lines.reduce((sum, line) => sum + (line.amount ?? 0), 0) : null;
  return { status: complete ? "complete" : hasAmount ? "partial" : "unknown", amount, fromInputTokens: selected.fromInputTokens, lines };
}
export function totalEstimatedCost(estimates: readonly CostEstimate[]): { amount: number | null; incomplete: number } {
  const known = estimates.filter(estimate => estimate.amount !== null);
  return { amount: known.length ? known.reduce((sum, estimate) => sum + estimate.amount!, 0) : null,
    incomplete: estimates.filter(estimate => estimate.status !== "complete").length };
}
