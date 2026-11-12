import { describe, expect, it, vi } from "vitest";
import { usageItemsSchema } from "@asterism-app/sdk/contracts";
import { createDeepSeekUsage, parseDeepSeekBalance } from "./deepseek.ts";
import { createKimiUsage, parseKimiQuota } from "./kimi.ts";
import { createOpenCodeUsage, parseOpenCodeQuota } from "./opencode.ts";
import { createMoonshotUsage, parseMoonshotBalance } from "./moonshot.ts";
import { createOpenRouterUsage, parseOpenRouterKey } from "./openrouter.ts";

const deepseek = { is_available: true, balance_infos: [
  { currency: "CNY", total_balance: "12.50", granted_balance: "2.50", topped_up_balance: "10.00" },
  { currency: "USD", total_balance: "-0.25" },
] };
const opencode = { usage: {
  rolling: { percent: 25, resetsAt: "2030-01-01T05:00:00Z" },
  weekly: { percent: 100 }, monthly: { percent: 10 },
} };
const kimi = {
  usage: { used: "40", limit: "1000", resetTime: "2030-01-07T00:00:00Z" },
  limits: [
    { window: { duration: "300", timeUnit: "TIME_UNIT_MINUTE" }, detail: { remaining: "85", limit: "100" } },
    { window: { duration: 1, timeUnit: "WEEK" }, detail: { used: 40, limit: 1000 } },
    { window: { duration: 1, timeUnit: "MONTH" }, detail: { used: 26, limit: 100 } },
  ],
};
const moonshot = { code: 0, status: true, data: { available_balance: 12.345, voucher_balance: 5, cash_balance: 7.345 } };
describe("built-in balance and plan queries", () => {
  // The official DeepSeek balance API supplies total_balance by currency; do not take only the first row or add promotional credits twice.
  it("preserves balances and arrears for each currency and rejects empty amounts as zero", () => {
    expect(usageItemsSchema.parse(parseDeepSeekBalance(deepseek))).toMatchObject([
      { id: "balance-CNY", remaining: 12.5, unit: { type: "currency", code: "CNY" }, scope: "account" },
      { id: "balance-USD", remaining: -0.25, unit: { type: "currency", code: "USD" } },
    ]);
    expect(() => parseDeepSeekBalance({ balance_infos: [{ currency: "USD", total_balance: "" }] })).toThrow();
  });
  // Official Moonshot domestic and international documentation specifies CNY/USD respectively; responses carry no currency, and component balances must not be summed twice.
  it("Moonshot preserves currency and total available balance for the selected region and rejects business errors", () => {
    expect(parseMoonshotBalance(moonshot, "CNY")).toMatchObject([{ remaining: 12.345, unit: { code: "CNY" } }]);
    expect(parseMoonshotBalance(moonshot, "USD")).toMatchObject([{ remaining: 12.345, unit: { code: "USD" } }]);
    expect(() => parseMoonshotBalance({ ...moonshot, code: 1, status: false }, "USD")).toThrow();
  });
  // /key supports ordinary keys; /credits explicitly requires a management key, so permission failure must not be treated as a zero balance.
  it("OpenRouter queries only the budget with an ordinary key and queries account balance only with a management key", async () => {
    const transport = vi.fn<typeof fetch>(async () => Response.json({ data: { limit: 10, limit_remaining: 3, is_management_key: false } }));
    const provider = createOpenRouterUsage(transport);
    const context = { connection: { id: "router", endpoint: "https://relay.test/api/v1" }, credential: "test-key", signal: new AbortController().signal };
    expect(await provider.query(context)).toMatchObject([{ type: "balance", scope: "key", remaining: 3, unit: { type: "currency", code: "USD" } }]);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(String(transport.mock.calls[0]![0])).toBe("https://relay.test/api/v1/key");
    transport.mockResolvedValueOnce(Response.json({ data: { limit: null, limit_remaining: null, is_management_key: true } }));
    transport.mockResolvedValueOnce(Response.json({ data: { total_credits: 30, total_usage: 12.5 } }));
    expect(await provider.query(context)).toMatchObject([{ type: "balance", scope: "account", remaining: 17.5 }]);
    expect(String(transport.mock.calls[2]![0])).toBe("https://relay.test/api/v1/credits");
    expect(parseOpenRouterKey({ data: { limit: null, limit_remaining: null } }).items).toEqual([]);
  });
  // effective_budget is the actual constraint; periodic budgets are shown as quota with the provider's period (a month counts as 30 days).
  it("OpenRouter uses the effective budget and preserves the period and reset time", () => {
    const raw = { data: { limit: 100, limit_remaining: 90, effective_budget: {
      limit_usd: 20, remaining_usd: 5, reset_interval: "monthly", resets_at: "2030-02-01T00:00:00Z",
    } } };
    expect(usageItemsSchema.parse(parseOpenRouterKey(raw).items)).toMatchObject([{
      type: "quota", scope: "key", value: { type: "quantity", remaining: 5, limit: 20, unit: { type: "currency", code: "USD" } },
      window: { periodSeconds: 2592000, resetAt: Date.parse("2030-02-01T00:00:00Z") },
    }]);
  });
  // The Go API returns the percentage used; the provider supplies each window's period, and 100% is a valid exhausted window.
  it("OpenCode converts remaining ratios for three windows and preserves exhausted windows and unknown reset times", () => {
    expect(usageItemsSchema.parse(parseOpenCodeQuota(opencode))).toMatchObject([
      { id: "rolling", value: { remaining: 0.75 }, window: { periodSeconds: 18000, resetAt: Date.parse("2030-01-01T05:00:00Z") } },
      { id: "weekly", value: { remaining: 0 }, window: { resetAt: null } },
      { id: "monthly", value: { remaining: 0.9 }, window: { periodSeconds: 2592000 } },
    ]);
    expect(() => parseOpenCodeQuota({ usage: { rolling: { percent: "unknown" } } })).toThrow();
  });
  // Kimi CLI shape: weekly summary + limits; numeric strings, remaining, and equivalent periods must not cause duplication or incorrect denominators.
  it("Kimi preserves absolute allowances, deduplicates weekly windows, and states each window's period", () => {
    expect(usageItemsSchema.parse(parseKimiQuota(kimi))).toMatchObject([
      { id: "window-604800", value: { type: "quantity", remaining: 960, limit: 1000 } },
      { id: "window-18000", value: { remaining: 85, limit: 100 }, window: { periodSeconds: 18000 } },
      { id: "window-2592000", value: { remaining: 74 }, window: { periodSeconds: 2592000 } },
    ]);
    expect(() => parseKimiQuota({ limits: [{ window: { duration: 5, timeUnit: "HOUR" }, detail: { limit: "100", remaining: "101" } }] })).toThrow();
    expect(() => parseKimiQuota({ error: "unauthorized" })).toThrow();
  });
  // Queries follow the user-configured site with explicitly declared vendor paths; do not ignore cancellation, follow redirects, or send to a fixed official host.
  it("each query uses its declared path and Bearer authentication on the current connection origin", async () => {
    for (const { provider, body, path } of [
      { provider: createDeepSeekUsage, body: deepseek, path: "/user/balance" },
      { provider: createOpenCodeUsage, body: opencode, path: "/zen/go/v1/usage" },
      { provider: (transport: typeof fetch) => createKimiUsage("kimi-plan-cn", transport), body: kimi, path: "/coding/v1/usages" },
      { provider: (transport: typeof fetch) => createMoonshotUsage("kimi", transport), body: moonshot, path: "/v1/users/me/balance" },
    ]) {
      const transport = vi.fn<typeof fetch>(async () => Response.json(body));
      const signal = new AbortController().signal;
      await provider(transport).query({ connection: { id: "renamed", endpoint: "https://relay.test/anything/v1" }, credential: "test-key", signal });
      expect(String(transport.mock.calls[0]![0])).toBe(`https://relay.test${path}`);
      expect(transport.mock.calls[0]![1]).toMatchObject({ signal, redirect: "error", headers: { Authorization: "Bearer test-key" } });
    }
  });
});
