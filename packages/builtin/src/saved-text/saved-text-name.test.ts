import { describe, expect, it } from "vitest";
import { savedTextName } from "./use-saved-text.ts";

describe("Saved text names", () => {
  it("uses the first non-blank line without surrounding whitespace", () => {
    expect(savedTextName("\n   \n  Review the changes:  \n\n- Check behavior\n")).toBe("Review the changes:");
  });
  it("truncates long lines by code point without splitting surrogate pairs", () => {
    const name = savedTextName(`${"a".repeat(46)}😀😀😀`);
    expect(name).toBe(`${"a".repeat(46)}😀…`);
    expect(Array.from(name)).toHaveLength(48);
  });
});
