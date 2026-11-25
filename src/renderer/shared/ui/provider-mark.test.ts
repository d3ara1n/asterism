import { describe, expect, it } from "vitest";
import { markMonogram } from "./provider-mark";

// Expected values follow from what a reader perceives as the first character of the visible name.
describe("markMonogram", () => {
  it("skips leading whitespace and capitalizes Latin initials", () => {
    expect(markMonogram("  parallel")).toBe("P");
  });
  it("keeps a character outside the Basic Multilingual Plane whole", () => {
    expect(markMonogram("𝔄lpha")).toBe("𝔄");
  });
  it("keeps a base letter with its combining mark", () => {
    expect(markMonogram("e\u0301cole")).toBe("E\u0301");
  });
  it("uses CJK initials as they are", () => {
    expect(markMonogram("智谱")).toBe("智");
  });
  it("marks an empty name with a placeholder", () => {
    expect(markMonogram("   ")).toBe("?");
  });
});
