import type { ModelCost, ModelRates, ModalityRates, UnitPrice } from "./model-cost.ts";
import type { Usage } from "./models.ts";

/** Quantities already split by billing category; callers are responsible for preventing overlap between totals and subcategories. */
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
/** Consumes only prices and named quantities, without modifying upstream usage or maintaining a historical ledger. */
export function estimateModelCost(cost: ModelCost | null, inputTokens: number | null, quantities: readonly CostQuantity[]): CostEstimate {
  const selected = selectModelRates(cost, inputTokens);
  const lines = quantities.map((quantity): CostLine => {
    const price = selected.rates?.[quantity.modality][quantity.item] ?? null;
    const missing = (issue: CostIssue): CostLine => ({ ...quantity, price, amount: null, issue });
    if (quantity.quantity === null) return missing("quantity");
    if (!Number.isFinite(quantity.quantity) || quantity.quantity < 0) return missing("invalid");
    if (selected.unknownTier) return missing("tier");
    if (price && price.unit !== quantity.unit) return missing("unit");
    // A known zero quantity in the same unit needs no price; zero tokens cannot represent zero seconds or zero images.
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

/** A zero total implies zero subtotals; other unknown subtotals are not filled with zero. Negative values mark contradictory usage. */
function splitUsageTotal(total: number | null, parts: (number | null)[]): { rest: number | null; parts: (number | null)[] } {
  const known = parts.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  if (total !== null && known > total) return { rest: -1, parts: parts.map(() => -1) };
  if (total === 0) return { rest: 0, parts: parts.map(() => 0) };
  return { rest: total === null || parts.some(value => value === null) ? null : total - known, parts };
}
/** Estimate USD cost from protocol usage and configured pricing; multimodal inputs leave text-input pricing unknown. */
export function estimateUsageCost(usage: Usage | null, cost: ModelCost | null, inputHasFiles: boolean | null): CostEstimate {
  const input = usage?.input ?? null;
  const output = usage?.output ?? null;
  const selected = selectModelRates(cost, input);
  const inputs = splitUsageTotal(input, [usage?.cacheRead ?? null, usage?.cacheWrite ?? null]);
  const textInput = (quantity: number | null) => inputHasFiles === false ? quantity : null;
  const quantities: CostQuantity[] = [
    { modality: "text", item: "input", quantity: textInput(inputs.rest), unit: "token" },
    { modality: "text", item: "cacheRead", quantity: textInput(inputs.parts[0]!), unit: "token" },
    { modality: "text", item: "cacheWrite", quantity: textInput(inputs.parts[1]!), unit: "token" },
  ];
  // output already includes reasoning; split thinking out only when a separate thinking price is explicitly configured, otherwise charge the output total once.
  if (selected.rates?.text.reasoning) {
    const outputs = splitUsageTotal(output, [usage?.reasoning ?? null]);
    quantities.push({ modality: "text", item: "output", quantity: outputs.rest, unit: "token" },
      { modality: "text", item: "reasoning", quantity: outputs.parts[0]!, unit: "token" });
  } else quantities.push({ modality: "text", item: "output", quantity: output, unit: "token" });
  return estimateModelCost(cost, input, quantities);
}
/** Net USD saved by prompt caching for a text request: cache-read discount minus any cache-write surcharge. */
export function estimateCacheSavings(usage: Usage | null, cost: ModelCost | null, inputHasFiles: boolean | null): number | null {
  if (inputHasFiles !== false || !usage || !cost) return null;
  const cacheRead = usage.cacheRead;
  const cacheWrite = usage.cacheWrite;
  if (cacheRead === null && cacheWrite === null) return null;
  const readCount = cacheRead ?? 0;
  const writeCount = cacheWrite ?? 0;
  if (!Number.isFinite(readCount) || readCount < 0 || !Number.isFinite(writeCount) || writeCount < 0) return null;
  if (readCount === 0 && writeCount === 0) return 0;
  const selected = selectModelRates(cost, usage.input);
  if (selected.unknownTier || !selected.rates) return null;
  const inputPrice = selected.rates.text.input;
  if (!inputPrice || inputPrice.unit !== "token") return null;
  const inputPerToken = inputPrice.amount / inputPrice.per;
  let saved = 0;
  if (readCount > 0) {
    const readPrice = selected.rates.text.cacheRead;
    if (!readPrice || readPrice.unit !== "token") return null;
    saved += readCount * (inputPerToken - readPrice.amount / readPrice.per);
  }
  if (writeCount > 0) {
    const writePrice = selected.rates.text.cacheWrite;
    if (!writePrice || writePrice.unit !== "token") return null;
    saved -= writeCount * (writePrice.amount / writePrice.per - inputPerToken);
  }
  return Number.isFinite(saved) ? saved : null;
}
