import { describe, expect, it } from "vitest";
import { defaultAppearance, parseAppearance } from "./theme.ts";

describe("parseAppearance", () => {
  it.each([null, "x", { accent: "blue", density: "huge" }])("损坏外观配置逐项回退：%j", input => {
    const result = parseAppearance(input);
    expect(result.density).toBe(defaultAppearance.density);
    expect(result.accent).toBe(typeof input === "object" && input !== null ? "blue" : defaultAppearance.accent);
  });
});
