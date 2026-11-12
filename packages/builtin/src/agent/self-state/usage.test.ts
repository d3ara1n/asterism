import { describe, expect, it } from "vitest";
import { balanceUnit } from "./usage.ts";

describe("balance units", () => {
  it("formats currency codes natively and keeps other monetary symbols as prefixes", () => {
    expect(balanceUnit("USD")).toEqual({ type: "currency", code: "USD" });
    // Intl rejects non-ISO currency codes, so symbols must not become currencies.
    expect(balanceUnit("¥")).toEqual({ type: "symbol", symbol: "¥" });
    expect(balanceUnit("usd")).toEqual({ type: "symbol", symbol: "usd" });
  });
});
