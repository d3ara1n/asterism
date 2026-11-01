import { useCallback, useMemo } from "react";
import { useRendererCatalogs, useRendererObject, useSessionRead } from "@asterism-app/sdk/renderer";
import { totalEstimatedCost } from "@asterism-app/sdk/contracts";
import { ModelCatalog } from "@asterism-app/sdk/contracts";
import { diagnosticRecords, type DiagnosticScope } from "./history.ts";
import { conversationMessages } from "../../messages/conversation";
import { diagnosticModel, estimateUsageCost } from "./cost.ts";
import { diagnosticOverview } from "./overview.ts";

/** Rederives values when snapshots or configuration change without creating consumption records; closing the panel does not affect execution. */
export function useDiagnostics(scope: DiagnosticScope) {
  const object = useRendererObject();
  const catalogs = useRendererCatalogs();
  const snapshot = object.session.snapshot();
  const configuration = useMemo(() => catalogs.get(ModelCatalog), [catalogs]);
  const read = useSessionRead(snapshot, useCallback(async (snapshot, signal) => diagnosticRecords(
    await snapshot.records.all({ scope }, { signal }), new Set(snapshot.records.index({ scope: "timeline" }).map(record => record.id)), object.ref.id), [object.ref.id, scope]));
  const history = read.data ?? { requests: [], unreadable: 0 };
  const requests = useMemo(() => history.requests.map(request => {
    const model = diagnosticModel(request, configuration?.models ?? []);
    return { ...request, configuredModel: model, estimate: estimateUsageCost(request.completion?.usage ?? null, model?.cost ?? null, request.inputHasFiles) };
  }), [history, configuration]);
  const total = useMemo(() => totalEstimatedCost(requests.map(request => request.estimate)), [requests]);
  const overview = useMemo(() => diagnosticOverview(requests, request => request.configuredModel?.contextWindow ?? null), [requests]);
  return { ...history, requests, total, overview, status: read.status, retry: read.retry,
    error: read.error ? conversationMessages.historyReadFailed : catalogs.error };
}
export type PricedRequest = ReturnType<typeof useDiagnostics>["requests"][number];
