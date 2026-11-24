import { describe, expect, it } from "vitest";
import { diffBodyPreview, textBodyPreview } from "./tool-body.ts";

// Expectations come from the built-in body convention: preserve absolute positions, keep every change reachable, and bound presentation by height instead of dropping content.
describe("built-in tool body previews", () => {
  it("write shows only the first 120 logical lines, and a trailing newline adds no empty line", () => {
    const text = Array.from({ length: 121 }, (_, index) => `line ${index + 1}`).join("\r\n") + "\r\n";
    const preview = textBodyPreview(text);
    expect(preview.rows).toHaveLength(120);
    expect(preview.rows[119]).toEqual({ line: 120, content: "line 120" });
    expect(preview.omitted).toBe(1);
    expect(textBodyPreview("")).toEqual({ rows: [], omitted: 0 });
  });

  it("distant edits preserve absolute before/after line numbers without filling in intervening text", () => {
    const fileDiff = diffBodyPreview([
      "--- text.txt", "+++ text.txt", "@@ -10,3 +10,4 @@",
      " keep", "-old", "+new", "+extra", " last",
      "@@ -500,1 +501,1 @@", "-far old", "+far new", "",
    ].join("\n"))!;
    expect(fileDiff.hunks).toHaveLength(2);
    expect(fileDiff.hunks[0]).toMatchObject({ deletionStart: 10, additionStart: 10, deletionCount: 3, additionCount: 4 });
    expect(fileDiff.hunks[1]).toMatchObject({ deletionStart: 500, additionStart: 501, deletionCount: 1, additionCount: 1 });
    expect(fileDiff.deletionLines).toEqual(["keep\n", "old\n", "last\n", "far old\n"]);
    expect(fileDiff.additionLines).toEqual(["keep\n", "new\n", "extra\n", "last\n", "far new\n"]);
  });

  it("keeps every hunk so changes beyond any single-body budget remain reachable", () => {
    const hunks = Array.from({ length: 31 }, (_, index) =>
      [`@@ -${index * 10 + 1},3 +${index * 10 + 1},3 @@`, " before", "-old", "+new", " after"].join("\n"));
    const fileDiff = diffBodyPreview(["--- text.txt", "+++ text.txt", ...hunks, ""].join("\n"))!;
    expect(fileDiff.hunks).toHaveLength(31);
    expect(fileDiff.hunks.reduce((count, hunk) => count + hunk.unifiedLineCount, 0)).toBe(124);
    expect(fileDiff.hunks[30]).toMatchObject({ deletionStart: 301, additionStart: 301 });
  });

  it("preserves final-newline annotations for their respective versions", () => {
    const fileDiff = diffBodyPreview([
      "--- text.txt", "+++ text.txt", "@@ -1 +1 @@",
      "-old", "\\ No newline at end of file", "+new", "\\ No newline at end of file", "",
    ].join("\n"))!;
    expect(fileDiff.hunks[0]).toMatchObject({ noEOFCRAdditions: true, noEOFCRDeletions: true, unifiedLineCount: 2 });
    expect(fileDiff.deletionLines).toEqual(["old"]);
    expect(fileDiff.additionLines).toEqual(["new"]);
  });

  it("falls back to raw text display for historical diffs that cannot be parsed", () => {
    expect(diffBodyPreview("not a patch")).toBeNull();
  });
});
