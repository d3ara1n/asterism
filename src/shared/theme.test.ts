import { describe, expect, it } from "vitest";
import { accentIds, contrastRatio, defaultAppearance, grayIds, parseAppearance, themeTokens } from "./theme.ts";

describe("parseAppearance", () => {
  it("非对象回退为默认值", () => {
    expect(parseAppearance(null)).toEqual(defaultAppearance);
    expect(parseAppearance("x")).toEqual(defaultAppearance);
  });
  it("单项损坏只回退该项", () => {
    expect(parseAppearance({ accent: "blue", density: "huge" })).toEqual({ ...defaultAppearance, accent: "blue" });
  });
});

describe("contrast", () => {
  it("黑白对比度为 21", () => expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21));
});

describe("themeTokens", () => {
  it("所有主题色 × 灰色 × 亮暗组合的正文、次要文字与按钮文字满足 AA", () => {
    for (const accent of accentIds) for (const gray of grayIds) for (const scheme of ["light", "dark"] as const) {
      const t = themeTokens({ ...defaultAppearance, accent, gray }, scheme);
      const at = `${accent}/${gray}/${scheme}`;
      for (const surface of [t.card!, t.background!]) {
        expect(contrastRatio(t.foreground!, surface), at).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(t["muted-foreground"]!, surface), at).toBeGreaterThanOrEqual(4.5);
      }
      expect(contrastRatio(t.primary!, t["primary-foreground"]!), at).toBeGreaterThanOrEqual(4.5);
    }
  });
});
