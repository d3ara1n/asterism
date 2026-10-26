import type { Json } from "@asterism/sdk/contracts";

export type WebRequestKind = "search" | "fetch";
export type WebRequestOutcome = "succeeded" | "failed" | "cancelled";
// 统计条目以类型别名声明，使其满足 `Json` 的索引签名，可直接作为卡片投影交付。
export type WebCost = { currency: string; amount: number };
export type WebRequestRecord = {
  kind: WebRequestKind; subject: string; outcome: WebRequestOutcome;
  /** 请求结束时刻（毫秒时间戳）与实际耗时。 */
  at: number; durationMs: number; cost: WebCost[];
};
export type WebOutcomeCounts = { succeeded: number; failed: number; cancelled: number };
/** 单个会话在本次软件运行内的网络请求统计；只存在于后台内存。 */
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

/** 实报用量中带币种的金额条目按币种求和；其他单位不构成费用。 */
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
/** 结束一次请求：计数、耗时与费用累加，最近请求按结束顺序保留最新若干条。 */
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
/** 平均耗时覆盖全部已结束请求；尚无请求时为 null。 */
export function averageDuration(stats: WebSessionStats): number | null {
  const total = finished(stats.search) + finished(stats.fetch);
  return total ? stats.totalDurationMs / total : null;
}

/** 卡片投影只交付展示所需的汇总；结构保持为普通 JSON。 */
export function projectStats(stats: WebSessionStats) {
  return {
    search: stats.search, fetch: stats.fetch, inFlight: stats.inFlight,
    averageMs: averageDuration(stats), lastMs: stats.lastDurationMs, cost: stats.cost,
    recent: stats.recent.map(item => ({ ...item })),
  } satisfies Json;
}
