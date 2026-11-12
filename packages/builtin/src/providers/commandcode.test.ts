import { describe, expect, it, vi } from "vitest";
import { createCommandCodeUsage, parseCommandCodeUsage } from "./commandcode.ts";

// Match the billing endpoint's three disjoint credit pools; their total is available credit, not USD or a monthly limit.
const credits = { monthlyCredits: 59.4, purchasedCredits: 2, freeCredits: 0.6 };

describe("Command Code account usage", () => {
  it("sums the reported credit pools without confusing the remaining grant with a monthly limit", () => {
    const [balance] = parseCommandCodeUsage({ credits });
    expect(balance).toMatchObject({ type: "balance", remaining: 62, unit: { type: "count" } });
    expect(parseCommandCodeUsage({ credits })).toHaveLength(1);
  });

  it("uses returned caps for both windows and preserves exhausted, unopened, and past-reset observations", () => {
    const items = parseCommandCodeUsage({ credits, windowLimits: {
      fiveHour: { used: 3.5, cap: 14, resetAt: 0 },
      weekly: { used: 36, cap: 35, resetAt: 1_700_000_000_000 },
    } });
    expect(items.slice(1)).toMatchObject([
      { id: "fiveHour", value: { remaining: 10.5, limit: 14 }, window: { periodSeconds: 18000, resetAt: null } },
      { id: "weekly", value: { remaining: 0, limit: 35 }, window: { periodSeconds: 604800, resetAt: 1_700_000_000_000 } },
    ]);
    expect(parseCommandCodeUsage({ credits, windowLimits: { fiveHour: { used: 5, cap: 20 } } })[1])
      .toMatchObject({ value: { remaining: 15, limit: 20 }, window: { resetAt: null } });
  });

  it("keeps balance-only and uncapped accounts free of invented plan windows, including an exhausted balance", () => {
    expect(parseCommandCodeUsage({ credits: { monthlyCredits: 0, purchasedCredits: 8, freeCredits: 2 }, windowLimits: null }))
      .toMatchObject([{ type: "balance", remaining: 10 }]);
    expect(parseCommandCodeUsage({ credits: { monthlyCredits: 0, purchasedCredits: 0, freeCredits: 0 },
      windowLimits: { fiveHour: { used: 0, cap: 0, resetAt: 0 }, weekly: null } }))
      .toMatchObject([{ type: "balance", remaining: 0 }]);
  });

  // Missing balances are not zeros; malformed recognized windows must not silently disappear as if the account had no caps.
  it.each([
    { error: "unauthorized" },
    { credits: { purchasedCredits: 8, freeCredits: 0 } },
    { credits: { ...credits, monthlyCredits: "" } },
    { credits, windowLimits: { fiveHour: { used: 0 } } },
    { credits, windowLimits: { weekly: { used: -1, cap: 35 } } },
  ])("rejects incomplete or contradictory usage instead of manufacturing a valid balance: %j", raw => {
    expect(() => parseCommandCodeUsage(raw)).toThrow(expect.objectContaining({ code: "protocol" }));
  });

  // The key's organization changes the query scope. Encode it as a query value, never as a path or additional parameter.
  it.each([null, { id: "org/a &b" }])("queries the key-selected account on the configured origin: %j", async org => {
    const transport = vi.fn<typeof fetch>();
    transport.mockResolvedValueOnce(Response.json({ success: true, org }));
    transport.mockResolvedValueOnce(Response.json({ credits }));
    const signal = new AbortController().signal;
    const items = await createCommandCodeUsage(transport).query({
      connection: { id: "custom-name", endpoint: "https://relay.test/provider/v1" }, credential: "test-key", signal,
    });
    expect(items[0]).toMatchObject({ remaining: 62 });
    expect(transport.mock.calls.map(([url]) => String(url))).toEqual([
      "https://relay.test/alpha/whoami?limits=1",
      org ? "https://relay.test/alpha/billing/credits?orgId=org%2Fa+%26b" : "https://relay.test/alpha/billing/credits",
    ]);
    for (const [, init] of transport.mock.calls) {
      expect(init).toMatchObject({ signal, redirect: "error", headers: { Authorization: "Bearer test-key" } });
    }
  });

  it("does not query personal credits when account scope resolution fails", async () => {
    const transport = vi.fn<typeof fetch>(async () => Response.json({ success: false, org: null }));
    await expect(createCommandCodeUsage(transport).query({
      connection: { id: "custom-name", endpoint: "https://relay.test/provider/v1" }, credential: "test-key", signal: new AbortController().signal,
    })).rejects.toMatchObject({ code: "protocol" });
    expect(transport).toHaveBeenCalledTimes(1);
  });
});
