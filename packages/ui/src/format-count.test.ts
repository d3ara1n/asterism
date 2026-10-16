import { describe, expect, it } from "vitest";
import { formatCount } from "./format-count";

// docs/design-system.md：只读 token／字数使用十进制 k/M/G/T，符号不随界面语言变化。
describe("只读计数的工程缩写", () => {
  it("千以下不缩写，较大数采用固定工程符号", () => {
    expect([0, 999, 1_000, 128_000, 1_000_000, 1_000_000_000, 1_000_000_000_000].map(value => formatCount(value)))
      .toEqual(["0", "999", "1k", "128k", "1M", "1G", "1T"]);
  });

  it("保留至多一位小数，舍入进位由格式化器升档", () => {
    expect(formatCount(1_234_567)).toBe("1.2M");
    expect(formatCount(999_950)).toBe("1M");
  });

  it("诊断增量保留方向，零增量不显示正号", () => {
    expect(formatCount(1_200, "exceptZero")).toBe("+1.2k");
    expect(formatCount(-1_200, "exceptZero")).toBe("-1.2k");
    expect(formatCount(0, "exceptZero")).toBe("0");
  });
});
