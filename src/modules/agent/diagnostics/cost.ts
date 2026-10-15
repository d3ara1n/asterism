import { thinkingLevels, type Usage } from "@atelier/sdk/contracts";
import { modelReference, type ProviderModel } from "../../../shared/configuration.ts";
import type { ModelCost } from "../../../shared/model-cost.ts";
import { estimateModelCost, selectModelRates, type CostQuantity } from "../../../shared/model-cost-estimate.ts";
import type { DiagnosticRequest } from "./history.ts";

/** scope 保存实际模型身份；旧记录只有表达式时必须唯一匹配，不能随意剥掉模型名中的冒号。 */
export function diagnosticModel(request: Pick<DiagnosticRequest, "model" | "modelScope">, models: readonly ProviderModel[]): ProviderModel | null {
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

/** 总量为零时子项必为零；其他未知子项不擅自补零。负值标记相互矛盾的用量。 */
function split(total: number | null, parts: (number | null)[]): { rest: number | null; parts: (number | null)[] } {
  const known = parts.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  if (total !== null && known > total) return { rest: -1, parts: parts.map(() => -1) };
  if (total === 0) return { rest: 0, parts: parts.map(() => 0) };
  return { rest: total === null || parts.some(value => value === null) ? null : total - known, parts };
}
/** 当前上游协议只有 token 总量与缓存／思考细分，其他模态数量与秒数、张数均不能推断。 */
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
  // output 已包含 reasoning；只有显式配置独立思考价才拆分，否则按输出总价计算一次。
  if (selected.rates?.text.reasoning) {
    const outputs = split(output, [usage?.reasoning ?? null]);
    quantities.push({ modality: "text", item: "output", quantity: outputs.rest, unit: "token" },
      { modality: "text", item: "reasoning", quantity: outputs.parts[0]!, unit: "token" });
  } else quantities.push({ modality: "text", item: "output", quantity: output, unit: "token" });
  return estimateModelCost(cost, input, quantities);
}
