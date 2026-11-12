import type { ProviderUsageState } from "@asterism-app/sdk/contracts";
import type { DiagnosticRequest } from "../diagnostics/history.ts";

/** Older, different-model, and pre-compression measurements cannot describe current context use. */
export function agentContextUsage<R extends Pick<DiagnosticRequest, "kind" | "sequence" | "completion">>(
  requests: readonly R[], max: number | null, matchesModel: (request: R) => boolean,
) {
  const latest = requests.filter(request => request.kind === "response").sort((a, b) => b.sequence - a.sequence)[0];
  const usable = latest && matchesModel(latest) && !requests.some(request => request.kind === "compression" && request.sequence > latest.sequence);
  return { max, used: usable ? latest.completion?.usage?.input ?? null : null };
}

/** Keep independent monetary balances; quotas, token counters, and stale results from failed queries are not spendable money. */
export function accountBalances(state: Pick<ProviderUsageState, "state" | "items">) {
  if (state.state !== "ready") return null;
  const balances = state.items.flatMap(item => {
    if (item.type !== "balance" || item.unit.type === "count") return [];
    return [{ name: typeof item.label === "string" ? item.label : item.label.defaultMessage,
      remaining: item.remaining, unit: item.unit.type === "currency" ? item.unit.code : item.unit.symbol }];
  });
  return balances.length ? balances : null;
}
