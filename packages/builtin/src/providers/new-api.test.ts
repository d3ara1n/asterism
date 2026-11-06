import { describe, expect, it, vi } from "vitest";
import { createNewApiUsage, parseNewApiBalance } from "./new-api.ts";

const usage = (available: number, unlimited = false) => ({ code: true, data: {
  total_available: available, unlimited_quota: unlimited,
  user_quota: { total_available: 50_000_000 },
} });

describe("New API key balance", () => {
  it.each([
    [987_655, 1.97531], [0, 0], [-125_000, -0.25],
  ])("converts %s key quota to %s USD independently of account quota", (quota, dollars) => {
    expect(parseNewApiBalance(usage(quota))).toMatchObject([
      { type: "balance", scope: "key", remaining: dollars, currency: "USD" },
    ]);
  });

  it("omits the stored quota value when the key has no quota limit", () => {
    expect(parseNewApiBalance(usage(500_000, true))).toEqual([]);
  });

  it.each([
    ["https://relay.test/v1", "https://relay.test/api/usage/token/"],
    ["https://relay.test/v1/", "https://relay.test/api/usage/token/"],
    ["https://relay.test/", "https://relay.test/api/usage/token/"],
    ["https://relay.test/gateway/v1", "https://relay.test/gateway/api/usage/token/"],
    ["https://relay.test/gateway/", "https://relay.test/gateway/api/usage/token/"],
    ["https://relay.test/gateway-v1", "https://relay.test/gateway-v1/api/usage/token/"],
  ])("derives the query URL from %s", async (endpoint, expected) => {
    const transport = vi.fn<typeof fetch>(async () => Response.json(usage(500_000)));
    await createNewApiUsage(transport).query({
      connection: { id: "relay", endpoint }, credential: "test-key", signal: new AbortController().signal,
    });
    expect(String(transport.mock.calls[0]![0])).toBe(expected);
  });
});
