import { describe, expect, it } from "vitest";
import { defaultAppearance, parseAppearance } from "./theme.ts";

describe("parseAppearance", () => {
  it.each([null, "x", { accent: "blue", density: "huge" }])("损坏外观配置逐项回退：%j", input => {
    const defaults = defaultAppearance("win32");
    const result = parseAppearance(input, "win32");
    expect(result.density).toBe(defaults.density);
    expect(result.accent).toBe(typeof input === "object" && input !== null ? "blue" : defaults.accent);
  });
});
