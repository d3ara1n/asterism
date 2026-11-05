import { describe, expect, it } from "vitest";
import { referenceKind } from "./references";

describe("Reference kinds", () => {
  it("distinguishes skills, resource containers, and resource items, and rejects other destinations", () => {
    expect(referenceKind("skill:pricing")).toBe("skill");
    expect(referenceKind("resource:Dir-1/")).toBe("directory");
    expect(referenceKind("resource:Dir-1/src/")).toBe("directory");
    expect(referenceKind("resource:Dir-1/src/a.ts")).toBe("file");
    expect(referenceKind("https://example.com")).toBeNull();
  });
});
