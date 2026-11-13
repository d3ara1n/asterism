import { describe, expect, it } from "vitest";
import { referenceKind, splitReferenceLabel } from "./references";

describe("Reference kinds", () => {
  it("classifies by scheme alone and rejects other destinations", () => {
    expect(referenceKind("skill:pricing")).toBe("skill");
    expect(referenceKind("skill:pricing/references/a.md")).toBe("skill");
    expect(referenceKind("resource:Dir-1/")).toBe("resource");
    expect(referenceKind("resource:Dir-1/src/a.ts")).toBe("resource");
    expect(referenceKind("model:relay/vendor/model-v1")).toBe("model");
    expect(referenceKind("model:relay")).toBeNull();
    expect(referenceKind("https://example.com")).toBeNull();
  });
});

describe("Reference label supplements", () => {
  it("leaves labels without a colon intact, including paths and section markers", () => {
    expect(splitReferenceLabel("src/main.ts#Description")).toEqual({ primary: "src/main.ts#Description", supplement: null });
  });

  it("splits only the first colon and preserves the entire supplement", () => {
    expect(splitReferenceLabel("teach:SKILL.md#Description:L12-34")).toEqual({
      primary: "teach", supplement: ":SKILL.md#Description:L12-34",
    });
  });

  it("preserves whitespace and Unicode text on both sides", () => {
    expect(splitReferenceLabel(" 教学 : 章节 / L1-200 ")).toEqual({ primary: " 教学 ", supplement: ": 章节 / L1-200 " });
  });

  it("keeps leading and trailing separators rather than dropping empty parts", () => {
    expect(splitReferenceLabel(":L12-34")).toEqual({ primary: "", supplement: ":L12-34" });
    expect(splitReferenceLabel("teach:")).toEqual({ primary: "teach", supplement: ":" });
  });
});
