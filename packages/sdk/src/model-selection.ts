import { z } from "zod";
import { thinkingLevels, type ThinkingLevel } from "./models.ts";

/** Model expression `<providerId>/<modelId>`: provider and model always appear as a pair, split at the first `/`. */
export interface ModelExpression { provider: string; model: string }
export function parseModelExpression(value: string): ModelExpression | null {
  const index = value.indexOf("/");
  if (index <= 0 || index === value.length - 1) return null;
  return { provider: value.slice(0, index), model: value.slice(index + 1) };
}
export function formatModelExpression(expression: ModelExpression): string { return `${expression.provider}/${expression.model}`; }
export const modelExpressionSchema = z.string().max(321).refine(value => parseModelExpression(value) !== null, "Use a model expression such as provider/model.");
/** A reference string for a specific model; corresponds one-to-one with model records without using random record IDs. */
export function modelReference(model: { providerId: string; modelId: string }): string {
  return formatModelExpression({ provider: model.providerId, model: model.modelId });
}
export const thinkingSchema = z.enum(thinkingLevels);

/** Display and requests share override calculation; empty values inherit defaults, without checking availability or rewriting selections. */
export function resolveModelSelection(
  defaults: { model: string | null; thinking: ThinkingLevel | null } | undefined,
  overrides: { model?: string | null; thinking?: ThinkingLevel | null },
) {
  return {
    model: overrides.model ?? defaults?.model ?? null,
    thinking: overrides.thinking ?? defaults?.thinking ?? null,
  };
}

/** Generates menu options only; does not resolve existing selections or validate requests. */
export function availableThinkingLevels(model: { capabilities: { reasoning: boolean; thinkingLevels: readonly typeof thinkingLevels[number][] } } | null) {
  if (!model) return thinkingLevels;
  return model.capabilities.reasoning ? thinkingLevels.filter(level => model.capabilities.thinkingLevels.includes(level)) : [];
}
