import { describe, expect, it } from "vitest";
import { nextRetry, retryDelay } from "./retry.ts";

describe("Agent retry delay", () => {
  it("bounds recovery by consecutive failures and request budget while excluding local failures and cancellation", () => {
    const upstream = { reason: "failed", retryable: true };
    expect([0, 1, 2, 3].map(previous => nextRetry(upstream, previous, 3, Infinity))).toEqual([1, 2, 3, null]);
    expect(nextRetry(upstream, 0, 3, 0)).toBeNull();
    expect(nextRetry({ reason: "failed", retryable: false }, 0, 3, Infinity)).toBeNull();
    expect(nextRetry({ reason: "cancelled", retryable: true }, 0, 3, Infinity)).toBeNull();
    expect(nextRetry({ reason: "completed", retryable: true }, 0, 3, Infinity)).toBeNull();
  });
  it("honors milliseconds, seconds, and absolute provider dates before exponential backoff", () => {
    const now = Date.parse("2026-11-02T10:00:00Z");
    expect(retryDelay({ message: "", responseHeaders: { "Retry-After-Ms": "250", "retry-after": "10" } }, 3, now, 0.5)).toBe(250);
    expect(retryDelay({ message: "", responseHeaders: { "retry-after": "3" } }, 1, now, 0.5)).toBe(3000);
    expect(retryDelay({ message: "", responseHeaders: { "retry-after": "Mon, 02 Nov 2026 10:00:05 GMT" } }, 1, now, 0.5)).toBe(5000);
  });

  it("rejects invalid provider delays and applies bounded jitter to each exponential step", () => {
    expect(retryDelay({ message: "", responseHeaders: { "retry-after-ms": "-1", "retry-after": "invalid" } }, 2, 0, 0.5)).toBe(2000);
    expect(retryDelay(undefined, 1, 0, 0)).toBe(800);
    expect(retryDelay(undefined, 3, 0, 1)).toBe(4800);
  });
});
