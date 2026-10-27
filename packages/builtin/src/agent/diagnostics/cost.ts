import {
  thinkingLevels, type Usage, modelReference, type ModelCost, estimateModelCost, selectModelRates,
  type CostQuantity,
} from "@asterism/sdk/contracts";
import { type CatalogModel } from "@asterism/builtin-api/contracts";
import type { DiagnosticRequest } from "./history.ts";

/** scope stores the actual model identity; older records with only an expression require a unique match, without arbitrarily stripping colons from model names. */
export function diagnosticModel(request: Pick<DiagnosticRequest, "model" | "modelScope">, models: readonly CatalogModel[]): CatalogModel | null {
  if (request.modelScope) {
    let scope: unknown;
    try { scope = JSON.parse(request.modelScope); } catch { scope = null; }
    if (Array.isArray(scope) && scope.length === 4 && scope.every(value => typeof value === "string"))
      return models.find(model => model.providerId === scope[0] && model.modelId === scope[3]) ?? null;
  }
  const matches = models.filter(model => request.model === modelReference(model)
    || thinkingLevels.some(level => request.model === `${modelReference(model)}:${level}`));
  return matches.length === 1 ? matches[0]! : null;
}

/** A zero total implies zero subtotals; other unknown subtotals are not filled with zero. Negative values mark contradictory usage. */
function split(total: number | null, parts: (number | null)[]): { rest: number | null; parts: (number | null)[] } {
  const known = parts.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  if (total !== null && known > total) return { rest: -1, parts: parts.map(() => -1) };
  if (total === 0) return { rest: 0, parts: parts.map(() => 0) };
  return { rest: total === null || parts.some(value => value === null) ? null : total - known, parts };
}
/** The current upstream protocol provides only token totals and cache/thinking breakdowns; quantities for other modalities, seconds, and image counts cannot be inferred. */
export function estimateUsageCost(usage: Usage | null, cost: ModelCost | null, inputHasFiles: boolean | null) {
  const input = usage?.input ?? null;
  const output = usage?.output ?? null;
  const selected = selectModelRates(cost, input);
  const inputs = split(input, [usage?.cacheRead ?? null, usage?.cacheWrite ?? null]);
  const textInput = (quantity: number | null) => inputHasFiles === false ? quantity : null;
  const quantities: CostQuantity[] = [
    { modality: "text", item: "input", quantity: textInput(inputs.rest), unit: "token" },
    { modality: "text", item: "cacheRead", quantity: textInput(inputs.parts[0]!), unit: "token" },
    { modality: "text", item: "cacheWrite", quantity: textInput(inputs.parts[1]!), unit: "token" },
  ];
  // output already includes reasoning; split thinking out only when a separate thinking price is explicitly configured, otherwise charge the output total once.
  if (selected.rates?.text.reasoning) {
    const outputs = split(output, [usage?.reasoning ?? null]);
    quantities.push({ modality: "text", item: "output", quantity: outputs.rest, unit: "token" },
      { modality: "text", item: "reasoning", quantity: outputs.parts[0]!, unit: "token" });
  } else quantities.push({ modality: "text", item: "output", quantity: output, unit: "token" });
  return estimateModelCost(cost, input, quantities);
}
