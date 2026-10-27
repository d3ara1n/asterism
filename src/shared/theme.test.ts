import { describe, expect, it } from "vitest";
import { defaultAppearance, parseAppearance } from "./theme.ts";

describe("parseAppearance", () => {
  it.each([null, "x", { accent: "blue", density: "huge" }])("corrupt appearance configuration falls back per field: %j", input => {
    const defaults = defaultAppearance("win32");
    const result = parseAppearance(input, "win32");
    expect(result.density).toBe(defaults.density);
    expect(result.accent).toBe(typeof input === "object" && input !== null ? "blue" : defaults.accent);
  });
});
