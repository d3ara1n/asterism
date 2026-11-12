import { describe, expect, it } from "vitest";
import type { ModelCompletion, UsageItem } from "@asterism-app/sdk/contracts";
import { accountBalances, agentContextUsage } from "./metrics.ts";

const completion: ModelCompletion = { finishReason: "stop", rawFinishReason: null, providerResponseId: null,
  usage: { input: 1200, output: 80, total: 1280, reasoning: null, cacheRead: 1000, cacheWrite: null } };
const response = (sequence: number, report: ModelCompletion | null = completion) => ({
  kind: "response" as const, sequence, model: "p/m:high", completion: report,
});
const summary = (sequence: number) => ({ ...response(sequence), kind: "compression" as const, model: "p/summary" });

describe("Agent context capacity and use", () => {
  it("retains maximum capacity while discarding pre-compression and different-model input counts", () => {
    expect(agentContextUsage([summary(3), response(1), response(2)], 64000, () => true)).toEqual({ max: 64000, used: null });
    expect(agentContextUsage([response(3)], 128000, () => false)).toEqual({ max: 128000, used: null });
    expect(agentContextUsage([summary(2), response(3)], 64000, () => true)).toEqual({ max: 64000, used: 1200 });
  });

  it("does not substitute an older report for the latest unreported input or add cached tokens again", () => {
    for (const report of [null, { ...completion, usage: null }]) {
      expect(agentContextUsage([response(1), response(2, report)], null, () => true)).toEqual({ max: null, used: null });
    }
    expect(agentContextUsage([response(1)], null, () => true)).toEqual({ max: null, used: 1200 });
  });

  it("does not turn compression usage into conversation use before any response", () => {
    expect(agentContextUsage([], 64000, () => true)).toEqual({ max: 64000, used: null });
    expect(agentContextUsage([summary(1)], 64000, () => true)).toEqual({ max: 64000, used: null });
  });
});

const balances: UsageItem[] = [
  { id: "account", type: "balance", scope: "account", label: "Account balance", remaining: 12.5, unit: { type: "currency", code: "USD" } },
  { id: "key", type: "balance", scope: "key", label: "Key balance", remaining: 0, unit: { type: "currency", code: "USD" } },
  { id: "custom", type: "balance", scope: "account", label: "Site balance", remaining: -2, unit: { type: "symbol", symbol: "¥" } },
];

describe("Agent monetary balance", () => {
  it("keeps separate amounts and units without adding key and account budgets or treating token quotas as money", () => {
    const items: UsageItem[] = [...balances,
      { id: "tokens", type: "balance", scope: "key", label: "Tokens", remaining: 1000, unit: { type: "count", label: "tokens" } },
      { id: "quota", type: "quota", scope: "key", label: "Rate limit", value: { type: "ratio", remaining: 0.5 },
        window: { mode: "rolling", periodSeconds: 3600, resetAt: null } },
    ];
    expect(accountBalances({ state: "ready", items })).toEqual([
      { name: "Account balance", remaining: 12.5, unit: "USD" },
      { name: "Key balance", remaining: 0, unit: "USD" },
      { name: "Site balance", remaining: -2, unit: "¥" },
    ]);
  });

  it("does not report missing or stale balances as available funds", () => {
    expect(accountBalances({ state: "ready", items: [] })).toBeNull();
    expect(accountBalances({ state: "error", items: balances })).toBeNull();
    expect(accountBalances({ state: "disabled", items: [] })).toBeNull();
  });
});
