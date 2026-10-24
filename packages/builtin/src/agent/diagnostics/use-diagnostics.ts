import { useMemo } from "react";
import { useRendererCatalogs, useRendererObject } from "@atelier/sdk/renderer";
import { totalEstimatedCost } from "@atelier/sdk/contracts";
import { ModelConfiguration } from "@atelier/builtin-api/contracts";
import { diagnosticHistory, type DiagnosticScope } from "./history.ts";
import { diagnosticModel, estimateUsageCost } from "./cost.ts";
import { diagnosticOverview } from "./overview.ts";

/** 快照和配置变化时重新推导，不创建消费记录；关闭面板也不影响运行。 */
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
