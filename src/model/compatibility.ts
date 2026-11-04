import type { ModelProviderInput, ProviderModel } from "../shared/configuration.ts";
import { mergeModelCompatibility, type CustomThinkingBudgets, type CustomThinkingLevels } from "../shared/model-compatibility.ts";

/** The connection and model fields a protocol reads when encoding a request. */
export interface ProtocolTarget {
  provider: Pick<ModelProviderInput, "compatibility">;
  model: Pick<ProviderModel, "modelId" | "compatibility" | "capabilities">;
}
export type CompatibilityTarget = { provider: Pick<ModelProviderInput, "compatibility">; model: Pick<ProviderModel, "compatibility"> };

/** Merged entries keyed by id; protocols interpret only the behaviors they implement. */
export function compatibility(target: CompatibilityTarget) {
  const entries = mergeModelCompatibility(target.provider.compatibility, target.model.compatibility);
  return {
    has: (id: string) => entries.some(entry => entry.id === id),
    value: <T>(id: string): T | undefined => {
      const entry = entries.find(item => item.id === id);
      return entry && "value" in entry ? entry.value as T : undefined;
    },
  };
}

export interface ThinkingMappings { levels: CustomThinkingLevels; budgets: CustomThinkingBudgets }
export function thinkingMappings(target: CompatibilityTarget): ThinkingMappings {
  const entries = compatibility(target);
  return {
    levels: { ...entries.value<CustomThinkingLevels>("customThinkingLevels") },
    budgets: { ...entries.value<CustomThinkingBudgets>("customThinkingBudgets") },
  };
}
