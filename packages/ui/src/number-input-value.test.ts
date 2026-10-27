import { describe, expect, it } from "vitest";
import { formatNumberText, limitNumber, parseNumberText, stepNumber } from "./number-input-value.ts";

describe("parseNumberText", () => {
  it.each([
    ["12.25", 12.25],
    ["12,5", 12.5],
    ["１２．５", 12.5],
    ["12.", 12],
    [".5", 0.5],
    [" 13 ", 13],
  ])("parses %j", (text, expected) => {
    expect(parseNumberText(text)).toBe(expected);
  });

  it("blank input means clearing the value", () => {
    expect(parseNumberText("  ")).toBeNull();
  });

  it.each(["abc", "12px", "1.2.3", "1e3", "."])("rejects unparseable %j", text => {
    expect(parseNumberText(text)).toBeUndefined();
  });
});

describe("limitNumber", () => {
  // The binary representation of 12.345 is slightly below 12.345, so toFixed produces 12.34.
  it("rounds to the specified precision", () => {
    expect(limitNumber(12.345, 1, 100, 2)).toBe(12.35);
    expect(limitNumber(12.3449, 1, 100, 2)).toBe(12.34);
  });

  it("clamps to the range", () => {
    expect(limitNumber(0.5, 1, 100, 2)).toBe(1);
    expect(limitNumber(120, 1, 100, 2)).toBe(100);
  });
});

describe("stepNumber", () => {
  it("decimal stepping leaves no floating-point artifacts", () => {
    expect(stepNumber(12.1, 0.1, 1, 100, 2)).toBe(12.2);
    expect(stepNumber(12.25, 1, 1, 100, 2)).toBe(13.25);
  });

  it("clamps stepped values to the range", () => {
    expect(stepNumber(95.5, 10, 1, 100, 2)).toBe(100);
    expect(stepNumber(1.05, -0.1, 1, 100, 2)).toBe(1);
  });
});

describe("formatNumberText", () => {
  it("preserves all decimal places without thousands separators", () => {
    expect(formatNumberText(12.125, "en")).toBe("12.125");
    expect(formatNumberText(1234.5, "en")).toBe("1234.5");
  });
});
