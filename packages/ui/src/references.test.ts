import { describe, expect, it } from "vitest";
import { referenceKind } from "./references";

describe("Reference kinds", () => {
  it("classifies by scheme alone and rejects other destinations", () => {
    expect(referenceKind("skill:pricing")).toBe("skill");
    expect(referenceKind("skill:pricing/references/a.md")).toBe("skill");
    expect(referenceKind("resource:Dir-1/")).toBe("resource");
    expect(referenceKind("resource:Dir-1/src/a.ts")).toBe("resource");
    expect(referenceKind("https://example.com")).toBeNull();
  });
});
