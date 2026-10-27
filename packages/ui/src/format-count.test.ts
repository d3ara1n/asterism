import { describe, expect, it } from "vitest";
import { formatCount } from "./format-count";

// Read-only token/character counts use decimal k/M/G/T, with symbols independent of the UI language.
describe("Engineering abbreviations for read-only counts", () => {
  it("leaves values below one thousand unabbreviated and uses fixed engineering symbols for larger values", () => {
    expect([0, 999, 1_000, 128_000, 1_000_000, 1_000_000_000, 1_000_000_000_000].map(value => formatCount(value)))
      .toEqual(["0", "999", "1k", "128k", "1M", "1G", "1T"]);
  });

  it("retains at most one decimal place and lets the formatter advance the magnitude when rounding carries", () => {
    expect(formatCount(1_234_567)).toBe("1.2M");
    expect(formatCount(999_950)).toBe("1M");
  });

  it("preserves the direction of diagnostic deltas and omits the plus sign for zero", () => {
    expect(formatCount(1_200, "exceptZero")).toBe("+1.2k");
    expect(formatCount(-1_200, "exceptZero")).toBe("-1.2k");
    expect(formatCount(0, "exceptZero")).toBe("0");
  });
});
