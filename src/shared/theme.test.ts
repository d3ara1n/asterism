import { describe, expect, it } from "vitest";
import { contrastRatio, defaultAppearance, parseAppearance, presets, themeTokens } from "./theme.ts";

describe("parseAppearance", () => {
  it("非对象回退为默认值", () => {
    expect(parseAppearance(null)).toEqual(defaultAppearance);
    expect(parseAppearance("x")).toEqual(defaultAppearance);
  });
  it("单项损坏只回退该项", () => {
    expect(parseAppearance({ preset: "warm", density: "huge" }))
      .toEqual({ ...defaultAppearance, preset: "warm" });
  });
});

describe("contrast", () => {
  it("黑白对比度为 21", () => expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21));
});

describe("themeTokens", () => {
  it("每个预设的按钮文字在强调色上满足 AA", () => {
    for (const preset of Object.keys(presets) as (keyof typeof presets)[]) {
      const tokens = themeTokens({ ...defaultAppearance, preset });
      expect(contrastRatio(tokens.primary, tokens["primary-foreground"])).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("每个预设的正文与次要文字在背景上满足 AA", () => {
    for (const palette of Object.values(presets)) {
      expect(contrastRatio(palette.foreground, palette.background)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(palette["muted-foreground"], palette.background)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(palette.primary, palette["primary-foreground"])).toBeGreaterThanOrEqual(4.5);
    }
  });
});
