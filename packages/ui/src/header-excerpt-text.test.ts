import { describe, expect, it } from "vitest";
import { headerExcerptText } from "./header-excerpt-text.ts";

describe("header excerpt text", () => {
  it("collapses multiline and repeated whitespace without leaving space at the edges", () => {
    expect(headerExcerptText("\n\t npm   run\r\n\t build \t\n")).toBe("npm run build");
    expect(headerExcerptText(" \t\n")).toBe("");
  });

  it("does not mark an exact fit with trailing whitespace as truncated", () => {
    const command = "x".repeat(160);
    expect(headerExcerptText(command + "\n\t")).toBe(command);
  });

  it("caps an unbroken token without splitting a Unicode code point", () => {
    const prefix = "x".repeat(159) + "🐚";
    expect(headerExcerptText(prefix + " continued")).toBe(prefix + "…");
  });

  it("omits a trailing separator when the next word cannot fit", () => {
    const prefix = "x".repeat(159);
    expect(headerExcerptText(prefix + " \nnext")).toBe(prefix + "…");
  });
});
