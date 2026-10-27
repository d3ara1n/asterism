import type { Json } from "@asterism/sdk/contracts";

export type WebRequestKind = "search" | "fetch";
export type WebRequestOutcome = "succeeded" | "failed" | "cancelled";
// Statistics entries use type aliases to satisfy the `Json` index signature and can be delivered directly as card projections.
export type WebCost = { currency: string; amount: number };
export type WebRequestRecord = {
  kind: WebRequestKind; subject: string; outcome: WebRequestOutcome;
  /** Request completion time (millisecond timestamp) and actual duration. */
  at: number; durationMs: number; cost: WebCost[];
};
export type WebOutcomeCounts = { succeeded: number; failed: number; cancelled: number };
/** Network request statistics for one session during the current application run; exists only in backend memory. */
export type WebSessionStats = {
  search: WebOutcomeCounts; fetch: WebOutcomeCounts;
  inFlight: number; totalDurationMs: number; lastDurationMs: number | null;
  cost: WebCost[]; recent: WebRequestRecord[];
};

export const RECENT_LIMIT = 5;
const counts = (): WebOutcomeCounts => ({ succeeded: 0, failed: 0, cancelled: 0 });
export const emptyWebStats = (): WebSessionStats => ({
  search: counts(), fetch: counts(), inFlight: 0, totalDurationMs: 0, lastDurationMs: null, cost: [], recent: [],
});

/** Sums currency-bearing monetary entries from reported usage by currency; other units do not constitute costs. */
export function costOf(usage: readonly { amount: number; unit: string; currency?: string }[] | undefined): WebCost[] {
  return addCost([], (usage ?? []).flatMap(item => item.unit === "currency" && item.currency ? [{ currency: item.currency, amount: item.amount }] : []));
}
function addCost(total: readonly WebCost[], items: readonly WebCost[]): WebCost[] {
  const sums = new Map(total.map(item => [item.currency, item.amount]));
  for (const item of items) sums.set(item.currency, (sums.get(item.currency) ?? 0) + item.amount);
  return [...sums].map(([currency, amount]) => ({ currency, amount }));
}

export function startRequest(stats: WebSessionStats): WebSessionStats {
  return { ...stats, inFlight: stats.inFlight + 1 };
}
/** Ends a request: accumulates counts, duration, and costs, and retains the latest few requests in completion order. */
export function finishRequest(stats: WebSessionStats, record: WebRequestRecord): WebSessionStats {
  const kind = stats[record.kind];
  return {
    ...stats, [record.kind]: { ...kind, [record.outcome]: kind[record.outcome] + 1 },
    inFlight: Math.max(0, stats.inFlight - 1),
    totalDurationMs: stats.totalDurationMs + record.durationMs, lastDurationMs: record.durationMs,
    cost: addCost(stats.cost, record.cost), recent: [record, ...stats.recent].slice(0, RECENT_LIMIT),
  };
}

const finished = (item: WebOutcomeCounts) => item.succeeded + item.failed + item.cancelled;
/** Average duration covers all ended requests; null when there have been none. */
export function averageDuration(stats: WebSessionStats): number | null {
  const total = finished(stats.search) + finished(stats.fetch);
  return total ? stats.totalDurationMs / total : null;
}

/** Card projection delivers only summaries needed for display, retaining a plain JSON structure. */
export function projectStats(stats: WebSessionStats) {
  return {
    search: stats.search, fetch: stats.fetch, inFlight: stats.inFlight,
    averageMs: averageDuration(stats), lastMs: stats.lastDurationMs, cost: stats.cost,
    recent: stats.recent.map(item => ({ ...item })),
  } satisfies Json;
}
