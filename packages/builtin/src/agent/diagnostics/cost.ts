import {
  thinkingLevels, modelReference, estimateUsageCost,
} from "@asterism-app/sdk/contracts";
import { type CatalogLanguageModel } from "@asterism-app/builtin-api/contracts";
import type { DiagnosticRequest } from "./history.ts";

/** scope stores the actual model identity; older records with only an expression require a unique match, without arbitrarily stripping colons from model names. */
export function diagnosticModel<M extends Pick<CatalogLanguageModel, "providerId" | "modelId">>(request: Pick<DiagnosticRequest, "model" | "modelScope">, models: readonly M[]): M | null {
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

export { estimateUsageCost };
