import { describe, expect, it } from "vitest";
import { averageDuration, costOf, emptyWebStats, finishRequest, RECENT_LIMIT, startRequest, type WebRequestRecord } from "./stats.ts";

const record = (overrides: Partial<WebRequestRecord> = {}): WebRequestRecord =>
  ({ kind: "search", subject: "q", outcome: "succeeded", at: 0, durationMs: 100, cost: [], ...overrides });

describe("costOf", () => {
  // 用量中混有 token、请求数等非费用单位；只有带币种的金额条目构成费用，同币种合并。
  it("只按币种汇总金额条目", () => {
    expect(costOf([
      { amount: 0.005, unit: "currency", currency: "USD" },
      { amount: 3, unit: "requests" },
      { amount: 0.001, unit: "currency", currency: "USD" },
      { amount: 1, unit: "currency" },
      { amount: 0.2, unit: "currency", currency: "CNY" },
    ])).toEqual([{ currency: "USD", amount: 0.006 }, { currency: "CNY", amount: 0.2 }]);
    expect(costOf(undefined)).toEqual([]);
  });
});

describe("finishRequest", () => {
  // 结束请求需同时归还进行中计数、按类型与结果计数并累计费用；遗漏任何一项卡片都会长期显示错误数字。
  it("计数、进行中与费用随请求结束更新", () => {
    let stats = startRequest(startRequest(emptyWebStats()));
    stats = finishRequest(stats, record({ cost: [{ currency: "USD", amount: 0.01 }] }));
    stats = finishRequest(stats, record({ kind: "fetch", outcome: "failed", cost: [{ currency: "USD", amount: 0.02 }] }));
    expect(stats.inFlight).toBe(0);
    expect(stats.search).toEqual({ succeeded: 1, failed: 0, cancelled: 0 });
    expect(stats.fetch).toEqual({ succeeded: 0, failed: 1, cancelled: 0 });
    expect(stats.cost).toEqual([{ currency: "USD", amount: 0.03 }]);
  });

  // 最近请求按结束顺序最新在前，只保留固定条数。
  it("最近请求最新在前且有上限", () => {
    let stats = emptyWebStats();
    for (let at = 0; at < RECENT_LIMIT + 2; at++) stats = finishRequest(startRequest(stats), record({ at }));
    expect(stats.recent.map(item => item.at)).toEqual([6, 5, 4, 3, 2]);
  });
});

describe("averageDuration", () => {
  // 平均耗时覆盖全部已结束请求（含失败与取消）；无请求时为 null，卡片据此显示空状态而非 0。
  it("覆盖所有已结束请求，无请求时为 null", () => {
    expect(averageDuration(emptyWebStats())).toBeNull();
    let stats = finishRequest(emptyWebStats(), record({ durationMs: 100 }));
    stats = finishRequest(stats, record({ kind: "fetch", outcome: "cancelled", durationMs: 300 }));
    expect(averageDuration(stats)).toBe(200);
    expect(stats.lastDurationMs).toBe(300);
  });
});
