import { describe, expect, it } from "vitest";
import { averageDuration, costOf, emptyWebStats, finishRequest, RECENT_LIMIT, startRequest, type WebRequestRecord } from "./stats.ts";

const record = (overrides: Partial<WebRequestRecord> = {}): WebRequestRecord =>
  ({ kind: "search", subject: "q", outcome: "succeeded", at: 0, durationMs: 100, cost: [], ...overrides });

describe("costOf", () => {
  // Usage includes non-cost units such as tokens and request counts; only monetary entries with currencies constitute costs, and matching currencies are combined.
  it("aggregates monetary entries only by currency", () => {
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
  // Ending a request must decrement the in-flight count, count by type and outcome, and accumulate costs together; missing any step leaves the card showing incorrect numbers.
  it("updates counts, in-flight requests, and costs when a request ends", () => {
    let stats = startRequest(startRequest(emptyWebStats()));
    stats = finishRequest(stats, record({ cost: [{ currency: "USD", amount: 0.01 }] }));
    stats = finishRequest(stats, record({ kind: "fetch", outcome: "failed", cost: [{ currency: "USD", amount: 0.02 }] }));
    expect(stats.inFlight).toBe(0);
    expect(stats.search).toEqual({ succeeded: 1, failed: 0, cancelled: 0 });
    expect(stats.fetch).toEqual({ succeeded: 0, failed: 1, cancelled: 0 });
    expect(stats.cost).toEqual([{ currency: "USD", amount: 0.03 }]);
  });

  // Recent requests are ordered newest first by completion time, retaining only a fixed count.
  it("keeps recent requests newest first with a fixed limit", () => {
    let stats = emptyWebStats();
    for (let at = 0; at < RECENT_LIMIT + 2; at++) stats = finishRequest(startRequest(stats), record({ at }));
    expect(stats.recent.map(item => item.at)).toEqual([6, 5, 4, 3, 2]);
  });
});

describe("averageDuration", () => {
  // Average duration covers all ended requests, including failures and cancellations; null when there are none lets the card show an empty state rather than 0.
  it("covers all ended requests and returns null when there are none", () => {
    expect(averageDuration(emptyWebStats())).toBeNull();
    let stats = finishRequest(emptyWebStats(), record({ durationMs: 100 }));
    stats = finishRequest(stats, record({ kind: "fetch", outcome: "cancelled", durationMs: 300 }));
    expect(averageDuration(stats)).toBe(200);
    expect(stats.lastDurationMs).toBe(300);
  });
});
