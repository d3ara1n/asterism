import { describe, expect, it, vi } from "vitest";
import { createSub2ApiUsage, parseSub2ApiUsage } from "./sub2api.ts";

const wallet = { mode: "unrestricted", isValid: true, balance: 12.5, remaining: 12.5, unit: "USD" };

describe("Sub2API usage", () => {
  // remaining repeats the wallet balance; prefer the explicit balance even when zero or negative.
  it.each([0, -0.25, 12.5])("preserves the wallet balance %s without duplicating its summary", balance => {
    expect(parseSub2ApiUsage({ ...wallet, balance, remaining: 99 })).toMatchObject([
      { id: "account-balance", type: "balance", scope: "account", remaining: balance, unit: { type: "currency", code: "USD" } },
    ]);
  });

  // A key's summary amount is not an account balance, and expiry is not a quota reset.
  it("keeps key budgets separate from periodic limits and ignores duplicate summary amounts", () => {
    expect(parseSub2ApiUsage({
      mode: "quota_limited", isValid: true, remaining: 7, expires_at: "2030-02-01T00:00:00Z",
      quota: { limit: 20, used: 13, remaining: 7, unit: "USD" },
      rate_limits: [
        { window: "5h", limit: 5, used: 2, remaining: 3, reset_at: "2030-01-01T05:00:00Z" },
        { window: "1d", limit: 10, used: 12, remaining: 0 },
        { window: "7d", limit: 30, used: 5, remaining: 25, reset_at: null },
      ],
    })).toMatchObject([
      { id: "key-quota", type: "quota", scope: "key", category: "allowance",
        value: { type: "quantity", limit: 20, remaining: 7, unit: { code: "USD" } },
        window: { periodSeconds: null, resetAt: null } },
      { id: "key-5h", category: "rate_limit", value: { limit: 5, remaining: 3 },
        window: { mode: "fixed", periodSeconds: 18000, resetAt: Date.parse("2030-01-01T05:00:00Z") } },
      { id: "key-1d", value: { remaining: 0 }, window: { periodSeconds: 86400, resetAt: null } },
      { id: "key-7d", value: { remaining: 25 }, window: { periodSeconds: 604800, resetAt: null } },
    ]);
  });

  // Subscription summary remaining is the minimum across windows, not a second wallet balance.
  it("calculates subscription headroom per configured period and clamps exhausted allowances", () => {
    expect(parseSub2ApiUsage({ mode: "unrestricted", isValid: true, remaining: 0, subscription: {
      daily_limit_usd: 10, daily_usage_usd: 12,
      weekly_limit_usd: 100, weekly_usage_usd: 25,
      monthly_limit_usd: null, monthly_usage_usd: 25,
      expires_at: "2030-02-01T00:00:00Z",
    } })).toMatchObject([
      { id: "plan-daily", scope: "plan", category: "allowance", value: { limit: 10, remaining: 0 },
        window: { periodSeconds: 86400, resetAt: null } },
      { id: "plan-weekly", value: { limit: 100, remaining: 75 }, window: { periodSeconds: 604800 } },
    ]);
    expect(parseSub2ApiUsage({ mode: "unrestricted", isValid: true, subscription: {
      daily_limit_usd: 0, monthly_limit_usd: 200, monthly_usage_usd: 30,
    } })).toMatchObject([{ id: "plan-monthly", value: { remaining: 170 }, window: { periodSeconds: 2592000 } }]);
  });

  // Missing statistics must not manufacture zero balances; -1 is the upstream unlimited sentinel.
  it("uses an available summary amount but omits absent or unlimited allowances", () => {
    expect(parseSub2ApiUsage({ mode: "unrestricted", isValid: true, remaining: 4 }))
      .toMatchObject([{ type: "balance", scope: "account", remaining: 4 }]);
    expect(parseSub2ApiUsage({ mode: "unrestricted", isValid: true, remaining: -1 })).toEqual([]);
    expect(parseSub2ApiUsage({ mode: "unrestricted", isValid: true })).toEqual([]);
    expect(parseSub2ApiUsage({ mode: "quota_limited", isValid: true })).toEqual([]);
  });

  // A positive limit without usage is unknown, not unused; an explicitly invalid key is not an empty success.
  it("reports incomplete subscription usage and invalid credentials as failures", () => {
    expect(() => parseSub2ApiUsage({ mode: "unrestricted", isValid: true, subscription: { daily_limit_usd: 10 } }))
      .toThrow(expect.objectContaining({ code: "protocol" }));
    expect(() => parseSub2ApiUsage({ ...wallet, isValid: false }))
      .toThrow(expect.objectContaining({ code: "authentication" }));
  });

  // Preserve deployment prefixes while replacing only a terminal /v1; never append /v1 twice.
  it.each([
    ["https://relay.test/v1", "https://relay.test/v1/usage"],
    ["https://relay.test/v1/", "https://relay.test/v1/usage"],
    ["https://relay.test/", "https://relay.test/v1/usage"],
    ["https://relay.test/gateway/v1", "https://relay.test/gateway/v1/usage"],
    ["https://relay.test/gateway/", "https://relay.test/gateway/v1/usage"],
    ["https://relay.test/gateway-v1", "https://relay.test/gateway-v1/v1/usage"],
  ])("derives the usage URL from %s", async (endpoint, url) => {
    const transport = vi.fn<typeof fetch>(async () => Response.json(wallet));
    await createSub2ApiUsage(transport).query({
      connection: { id: "relay", endpoint }, credential: "test-key", signal: new AbortController().signal,
    });
    expect(String(transport.mock.calls[0]![0])).toBe(url);
  });
});
