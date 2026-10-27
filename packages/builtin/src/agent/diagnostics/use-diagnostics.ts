import { useMemo } from "react";
import { useRendererCatalogs, useRendererObject } from "@asterism/sdk/renderer";
import { totalEstimatedCost } from "@asterism/sdk/contracts";
import { ModelConfiguration } from "@asterism/builtin-api/contracts";
import { diagnosticHistory, type DiagnosticScope } from "./history.ts";
import { diagnosticModel, estimateUsageCost } from "./cost.ts";
import { diagnosticOverview } from "./overview.ts";

/** Rederives values when snapshots or configuration change without creating consumption records; closing the panel does not affect execution. */
export function useDiagnostics(scope: DiagnosticScope) {
  const object = useRendererObject();
  const catalogs = useRendererCatalogs();
  const snapshot = object.session.snapshot();
  const configuration = useMemo(() => catalogs.get(ModelConfiguration), [catalogs]);
  const history = useMemo(() => snapshot ? diagnosticHistory(snapshot, object.ref.id, scope)
    : { requests: [], unreadable: 0 }, [snapshot, object.ref.id, scope]);
  const requests = useMemo(() => history.requests.map(request => {
    const model = diagnosticModel(request, configuration?.models ?? []);
    return { ...request, configuredModel: model, estimate: estimateUsageCost(request.completion?.usage ?? null, model?.cost ?? null, request.inputHasFiles) };
  }), [history, configuration]);
  const total = useMemo(() => totalEstimatedCost(requests.map(request => request.estimate)), [requests]);
  const overview = useMemo(() => diagnosticOverview(requests, request => request.configuredModel?.contextWindow ?? null), [requests]);
  return { ...history, requests, total, overview, error: catalogs.error };
}
export type PricedRequest = ReturnType<typeof useDiagnostics>["requests"][number];
