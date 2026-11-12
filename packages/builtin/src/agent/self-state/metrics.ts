import { quotaRemaining, type ProviderUsageState, type UiText } from "@asterism-app/sdk/contracts";
import type { DiagnosticRequest } from "../diagnostics/history.ts";

/** Model-facing results carry plain text; message descriptors contribute their source-language text. */
const plainText = (value: UiText) => typeof value === "string" ? value : value.defaultMessage;

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
    return [{ name: plainText(item.label),
      remaining: item.remaining, unit: item.unit.type === "currency" ? item.unit.code : item.unit.symbol }];
  });
  return balances.length ? balances : null;
}

/** Quota windows keep the provider's order; a window without an explicit category is plan or key allowance. Failed queries report none. */
export function accountQuotas(state: Pick<ProviderUsageState, "state" | "items">) {
  if (state.state !== "ready") return null;
  const quotas = state.items.flatMap(item => item.type !== "quota" ? [] : [{
    name: item.label === undefined ? null : plainText(item.label),
    category: item.category ?? "allowance" as const,
    periodSeconds: item.window.periodSeconds,
    remaining: quotaRemaining(item),
    amount: item.value.type === "ratio" ? null : { remaining: item.value.remaining, limit: item.value.limit,
      unit: item.value.unit.type === "count" ? { type: "count" as const, label: plainText(item.value.unit.label) } : item.value.unit },
    resetsAt: item.window.resetAt === null ? null : new Date(item.window.resetAt).toISOString(),
  }]);
  return quotas.length ? quotas : null;
}
