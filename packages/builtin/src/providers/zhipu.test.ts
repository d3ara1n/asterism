import { describe, expect, it, vi } from "vitest";
import { createZhipuUsage, parseZhipuQuota } from "./zhipu.ts";

// Based on AstrLink decodeGLM and captured API responses: 3=hours, 6=weekly (number can be 1/7), and percentage is the percentage used.
const sample = { data: { limits: [
  { type: "CREDIT_LIMIT", unit: 6, number: 7, percentage: 20, nextResetTime: 1790000000000 },
  { type: "TOKENS_LIMIT", unit: 3, number: 5, percentage: 75, nextResetTime: 1789900000000 },
  { type: "TIME_LIMIT", unit: 5, number: 1, percentage: 10 },
] } };
describe("Zhipu Coding Plan queries", () => {
  it("maps remaining ratios for token/credit windows, keeps weekly periods independent of number variations, and excludes other tool budgets", () => {
    const result = parseZhipuQuota(sample);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ type: "quota", value: { type: "ratio", remaining: 0.8 }, window: { durationMs: 604800000, resetAt: 1790000000000 } });
    expect(result[1]).toMatchObject({ value: { type: "ratio", remaining: 0.25 }, window: { durationMs: 18000000 } });
    expect(parseZhipuQuota({ data: { limits: [{ ...sample.data.limits[0], number: 1 }] } })[0]).toMatchObject({ window: { durationMs: 604800000 } });
    expect(parseZhipuQuota({ data: { limits: [{ type: "TOKENS_LIMIT", unit: 99, percentage: 100 }] } })[0])
      .toMatchObject({ value: { remaining: 0 }, window: { durationMs: null, resetAt: null } });
    expect(() => parseZhipuQuota({ data: { limits: [{ type: "TOKENS_LIMIT" }] } })).toThrow();
  });
  // Explicitly selected queries follow the current connection origin; authentication is independent of the inference protocol, and redirects must not forward the key.
  it("uses the current site's root path and bare Authorization key, returning only error categories", async () => {
    const transport = vi.fn<typeof fetch>(async () => Response.json(sample));
    const provider = createZhipuUsage(transport);
    const signal = new AbortController().signal;
    await provider.query({ connection: { id: "renamed", endpoint: "https://relay.test/proxy/v1" }, credential: "test-key", signal });
    expect(String(transport.mock.calls[0]![0])).toBe("https://relay.test/api/monitor/usage/quota/limit");
    expect(transport.mock.calls[0]![1]).toMatchObject({ headers: { Authorization: "test-key" }, redirect: "error", signal });
    transport.mockResolvedValueOnce(new Response("private response", { status: 401 }));
    await expect(provider.query({ connection: { id: "p", endpoint: "https://relay.test" }, credential: "test-key", signal }))
      .rejects.toMatchObject({ code: "authentication" });
  });
});
