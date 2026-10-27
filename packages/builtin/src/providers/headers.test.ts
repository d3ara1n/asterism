import { describe, expect, it } from "vitest";
import { usageItemsSchema } from "@asterism-app/sdk/contracts";
import type { UsageHeadersContext } from "@asterism-app/sdk/runtime";
import { openaiHeaderUsage, anthropicHeaderUsage, xaiHeaderUsage } from "./headers.ts";

const context = (headers: Record<string, string>): UsageHeadersContext => ({
  connection: { id: "custom", endpoint: "https://example.test/v1" }, model: "test-model", status: 200,
  receivedAt: Date.parse("2030-01-01T00:00:00Z"), headers,
});
describe("rate-limit response headers", () => {
  // OpenAI reset values are durations and must be calculated from response receipt time; tokens and requests are separate budgets.
  it("OpenAI parses both token and request allowances and fully parses Go duration", () => {
    const result = openaiHeaderUsage.parseHeaders(context({
      "x-ratelimit-limit-tokens": "1000", "x-ratelimit-remaining-tokens": "750", "x-ratelimit-reset-tokens": "1m2.5s",
      "x-ratelimit-limit-requests": "10", "x-ratelimit-remaining-requests": "0", "x-ratelimit-reset-requests": "500ms",
    }));
    expect(usageItemsSchema.parse(result)).toMatchObject([
      { id: "tokens", category: "rate_limit", scope: "connection", value: { type: "quantity", remaining: 750, limit: 1000 }, window: { durationMs: null, resetAt: context({}).receivedAt + 62500 } },
      { id: "requests", value: { remaining: 0 }, window: { resetAt: context({}).receivedAt + 500 } },
    ]);
  });
  // Anthropic uses ISO timestamps; known xAI responses use Unix seconds and cannot share OpenAI duration parsing.
  it("Anthropic preserves input/output limits and xAI parses resets as Unix seconds", () => {
    expect(anthropicHeaderUsage.parseHeaders(context({
      "anthropic-ratelimit-input-tokens-limit": "100", "anthropic-ratelimit-input-tokens-remaining": "80",
      "anthropic-ratelimit-input-tokens-reset": "2030-01-01T00:01:00Z",
      "anthropic-ratelimit-output-tokens-limit": "20", "anthropic-ratelimit-output-tokens-remaining": "5",
    }))).toMatchObject([
      { id: "input-tokens", value: { remaining: 80 }, window: { resetAt: Date.parse("2030-01-01T00:01:00Z") } },
      { id: "output-tokens", value: { remaining: 5 }, window: { resetAt: null } },
    ]);
    expect(xaiHeaderUsage.parseHeaders(context({ "x-ratelimit-limit-tokens": "100", "x-ratelimit-remaining-tokens": "1", "x-ratelimit-reset-tokens": "1893456060" })))
      .toMatchObject([{ window: { resetAt: 1893456060000 } }]);
  });
  // Missing fields mean no new observation; invalid fields must not become 0, and partial regex matches must not misread unknown reset encodings.
  it("returns null for missing data, rejects invalid quantities, and leaves unknown reset values unknown", () => {
    expect(openaiHeaderUsage.parseHeaders(context({}))).toBeNull();
    expect(openaiHeaderUsage.parseHeaders(context({ "x-ratelimit-limit-tokens": "100" }))).toBeNull();
    expect(() => openaiHeaderUsage.parseHeaders(context({ "x-ratelimit-limit-tokens": "", "x-ratelimit-remaining-tokens": "0" }))).toThrow();
    expect(openaiHeaderUsage.parseHeaders(context({ "x-ratelimit-limit-tokens": "100", "x-ratelimit-remaining-tokens": "0", "x-ratelimit-reset-tokens": "bad-5s" })))
      .toMatchObject([{ value: { remaining: 0 }, window: { resetAt: null } }]);
    for (const reset of ["1", "2030-02-30T00:00:00Z", "2030-01-01"]) {
      expect(anthropicHeaderUsage.parseHeaders(context({ "anthropic-ratelimit-tokens-limit": "100",
        "anthropic-ratelimit-tokens-remaining": "50", "anthropic-ratelimit-tokens-reset": reset })))
        .toMatchObject([{ window: { resetAt: null } }]);
    }
    expect(xaiHeaderUsage.parseHeaders(context({ "x-ratelimit-limit-tokens": "100", "x-ratelimit-remaining-tokens": "1", "x-ratelimit-reset-tokens": "5" })))
      .toMatchObject([{ window: { resetAt: null } }]);
    expect(xaiHeaderUsage.parseHeaders(context({ "x-ratelimit-limit-tokens": "100", "x-ratelimit-remaining-tokens": "1", "x-ratelimit-reset-tokens": "2s" })))
      .toMatchObject([{ window: { resetAt: context({}).receivedAt + 2000 } }]);
  });
});
