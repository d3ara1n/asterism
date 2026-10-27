import { describe, expect, it } from "vitest";
import { appearancePatchSchema, defaultAppearance, parseAppearance, type Appearance, type AppearancePatch } from "./theme.ts";

describe("parseAppearance", () => {
  it.each([null, "x", { accent: "blue", density: "huge" }])("corrupt appearance configuration falls back per field: %j", input => {
    const defaults = defaultAppearance("win32");
    const result = parseAppearance(input, "win32");
    expect(result.density).toBe(defaults.density);
    expect(result.accent).toBe(typeof input === "object" && input !== null ? "blue" : defaults.accent);
  });
});

describe("appearance updates", () => {
  const current: Appearance = {
    mode: "dark", accent: "jade", gray: "sage", density: "comfortable", radius: "sm",
    canvas: "cross", edgeStyle: "step", uiFont: "Arial", terminalFont: "Menlo",
    terminalFontSize: 18, codeFont: "Monaco", codeFontSize: 16,
  };

  it.each<AppearancePatch>([
    { uiFont: "Helvetica" },
    { terminalFont: "Monaco" },
    { terminalFontSize: 20 },
    { codeFont: "Menlo" },
    { codeFontSize: 22 },
    { accent: "blue" },
    {},
  ])("preserves untouched settings when applying %j", input => {
    const patch = appearancePatchSchema.parse(input);
    expect(patch).toEqual(input);
    expect(parseAppearance({ ...current, ...patch }, "darwin")).toEqual({ ...current, ...input });
  });

  it("resets explicitly selected font fields without resetting other settings", () => {
    const patch = appearancePatchSchema.parse({ codeFont: null, codeFontSize: null });
    expect(parseAppearance({ ...current, ...patch }, "darwin")).toEqual({
      ...current, codeFont: null, codeFontSize: null,
    });
  });

  it.each([{}, { uiFont: "", terminalFont: 42, terminalFontSize: 0, codeFont: [], codeFontSize: 101 }])(
    "retains read fallbacks for missing or invalid font settings: %j", input => {
      expect(parseAppearance(input, "darwin")).toMatchObject({
        uiFont: null, terminalFont: null, terminalFontSize: 12, codeFont: null, codeFontSize: null,
      });
    },
  );
});
