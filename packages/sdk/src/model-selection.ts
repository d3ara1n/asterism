import { z } from "zod";
import { thinkingLevels, type ThinkingLevel } from "./models.ts";

/** 模型表达式 `<providerId>/<modelId>`：提供商与模型必定成对，按第一个 `/` 切分。 */
export interface ModelExpression { provider: string; model: string }
export function parseModelExpression(value: string): ModelExpression | null {
  const index = value.indexOf("/");
  if (index <= 0 || index === value.length - 1) return null;
  return { provider: value.slice(0, index), model: value.slice(index + 1) };
}
export function formatModelExpression(expression: ModelExpression): string { return `${expression.provider}/${expression.model}`; }
export const modelExpressionSchema = z.string().max(321).refine(value => parseModelExpression(value) !== null, "Use a model expression such as provider/model.");
/** 具体模型的引用串；与模型记录一一对应，不使用随机记录 ID。 */
export function modelReference(model: { providerId: string; modelId: string }): string {
  return formatModelExpression({ provider: model.providerId, model: model.modelId });
}
export const thinkingSchema = z.enum(thinkingLevels);

/** 展示与请求共用覆盖计算；空值沿用默认，不校验可用性或改写选择。 */
export function resolveModelSelection(
  defaults: { model: string | null; thinking: ThinkingLevel | null } | undefined,
  overrides: { model?: string | null; thinking?: ThinkingLevel | null },
) {
  return {
    model: overrides.model ?? defaults?.model ?? null,
    thinking: overrides.thinking ?? defaults?.thinking ?? null,
  };
}

/** 只投影菜单能力；执行时仍由模型适配层校验。 */
export function availableThinkingLevels(model: { capabilities: { reasoning: boolean; thinkingLevels: readonly typeof thinkingLevels[number][] } } | null) {
  if (!model) return thinkingLevels;
  return model.capabilities.reasoning ? thinkingLevels.filter(level => model.capabilities.thinkingLevels.includes(level)) : [];
}
