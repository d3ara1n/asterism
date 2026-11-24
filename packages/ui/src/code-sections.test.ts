import { describe, expect, it } from "vitest";
import { mergeCodeSections } from "./code-sections.tsx";

// Expectations come from the excerpt convention: a line number identifies a position in one text, so adjacent positions continue one excerpt and a gap starts another.
describe("code sections", () => {
  it("continues one excerpt across adjacent positions and starts a new one at a gap", () => {
    const merged = mergeCodeSections([
      { rows: [{ line: 1, content: "a" }, { line: 2, content: "b" }] },
      { rows: [{ line: 3, content: "c" }] },
      { rows: [{ line: 40, content: "d" }] },
    ]);
    expect(merged.map(section => section.rows.map(row => row.line))).toEqual([[1, 2, 3], [40]]);
  });
  it("keeps match flags of merged rows and drops empty sections", () => {
    const merged = mergeCodeSections([
      { rows: [] },
      { rows: [{ line: 5, content: "x", match: false }, { line: 6, content: "y", match: true }] },
      { rows: [{ line: 7, content: "z", match: true }] },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].rows.map(row => row.match)).toEqual([false, true, true]);
  });
  it("keeps same-line excerpts separate rather than merging unrelated results", () => {
    const merged = mergeCodeSections([{ rows: [{ line: 9, content: "a" }] }, { rows: [{ line: 9, content: "b" }] }]);
    expect(merged.map(section => section.rows.map(row => row.content))).toEqual([["a"], ["b"]]);
  });
});
