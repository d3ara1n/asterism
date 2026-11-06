import { describe, expect, it, vi } from "vitest";
import { usageItemsSchema } from "@asterism-app/sdk/contracts";
import { createNewApiUsage, parseNewApiBalance } from "./new-api.ts";

const token = (data: { available?: number; unlimited?: boolean; account?: number }) => ({ code: true, data: {
  total_available: data.available ?? 1_000_000, unlimited_quota: data.unlimited ?? false,
  ...(data.account !== undefined && { user_quota: { total_available: data.account, total_used: 0 } }),
} });
const status = (type: string, extra: Record<string, unknown> = {}) => ({ success: true, data: {
  quota_per_unit: 500_000, quota_display_type: type, usd_exchange_rate: 7.3,
  custom_currency_symbol: "🍪", custom_currency_exchange_rate: 10, ...extra,
} });

describe("New API balances", () => {
  // The site's own display settings decide the unit; amounts follow its USD reference and exchange rates, raw quota for TOKENS.
  it.each([
    ["USD", { type: "currency", code: "USD" }, 2, 0.5],
    ["CNY", { type: "currency", code: "CNY" }, 14.6, 3.65],
    ["CUSTOM", { type: "symbol", symbol: "🍪" }, 20, 5],
    ["TOKENS", { type: "count", label: "tokens" }, 1_000_000, 250_000],
  ])("converts key and account quota for the %s display", (type, unit, key, account) => {
    const items = usageItemsSchema.parse(parseNewApiBalance(token({ account: 250_000 }), status(type)));
    expect(items).toMatchObject([
      { id: "key-balance", scope: "key", unit }, { id: "account-balance", scope: "account", unit },
    ]);
    expect(items.map(item => item.type === "balance" && item.remaining)).toEqual([expect.closeTo(key), expect.closeTo(account)]);
  });

  // An unlimited key's counter only runs negative; showing it would suggest unlimited spending while the account balance drains.
  it("shows whichever of key and account has an amount and fails when neither does", () => {
    expect(parseNewApiBalance(token({ unlimited: true, available: -1_000, account: 500_000 }), status("USD")))
      .toMatchObject([{ id: "account-balance", remaining: 1 }]);
    expect(parseNewApiBalance(token({}), status("USD"))).toMatchObject([{ id: "key-balance", remaining: 2 }]);
    expect(() => parseNewApiBalance(token({ unlimited: true }), status("USD"))).toThrow(expect.objectContaining({ code: "unsupported" }));
  });

  it("falls back to the site's default symbol when the custom symbol is blank", () => {
    expect(parseNewApiBalance(token({}), status("CUSTOM", { custom_currency_symbol: " " })))
      .toMatchObject([{ unit: { type: "symbol", symbol: "¤" } }]);
  });

  it.each([
    ["https://relay.test/v1", "https://relay.test"],
    ["https://relay.test/v1/", "https://relay.test"],
    ["https://relay.test/", "https://relay.test"],
    ["https://relay.test/gateway/v1", "https://relay.test/gateway"],
    ["https://relay.test/gateway/", "https://relay.test/gateway"],
    ["https://relay.test/gateway-v1", "https://relay.test/gateway-v1"],
  ])("derives the query URLs from %s", async (endpoint, base) => {
    const transport = vi.fn<typeof fetch>(async input => Response.json(String(input).endsWith("/api/status") ? status("USD") : token({})));
    await createNewApiUsage(transport).query({
      connection: { id: "relay", endpoint }, credential: "test-key", signal: new AbortController().signal,
    });
    expect(transport.mock.calls.map(call => String(call[0]))).toEqual([`${base}/api/usage/token/`, `${base}/api/status`]);
  });
});
