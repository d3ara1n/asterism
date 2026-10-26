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
  ])("解析 %j", (text, expected) => {
    expect(parseNumberText(text)).toBe(expected);
  });

  it("空白输入表示清空", () => {
    expect(parseNumberText("  ")).toBeNull();
  });

  it.each(["abc", "12px", "1.2.3", "1e3", "."])("拒绝无法解析的 %j", text => {
    expect(parseNumberText(text)).toBeUndefined();
  });
});

describe("limitNumber", () => {
  // 12.345 的二进制表示略小于 12.345，toFixed 会得到 12.34。
  it("按精度四舍五入", () => {
    expect(limitNumber(12.345, 1, 100, 2)).toBe(12.35);
    expect(limitNumber(12.3449, 1, 100, 2)).toBe(12.34);
  });

  it("限制在范围内", () => {
    expect(limitNumber(0.5, 1, 100, 2)).toBe(1);
    expect(limitNumber(120, 1, 100, 2)).toBe(100);
  });
});

describe("stepNumber", () => {
  it("小数步进不留浮点尾数", () => {
    expect(stepNumber(12.1, 0.1, 1, 100, 2)).toBe(12.2);
    expect(stepNumber(12.25, 1, 1, 100, 2)).toBe(13.25);
  });

  it("步进结果限制在范围内", () => {
    expect(stepNumber(95.5, 10, 1, 100, 2)).toBe(100);
    expect(stepNumber(1.05, -0.1, 1, 100, 2)).toBe(1);
  });
});

describe("formatNumberText", () => {
  it("保留全部小数且不加千分位", () => {
    expect(formatNumberText(12.125, "en")).toBe("12.125");
    expect(formatNumberText(1234.5, "en")).toBe("1234.5");
  });
});
