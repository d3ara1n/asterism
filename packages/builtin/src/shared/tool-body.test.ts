import { describe, expect, it } from "vitest";
import { diffBodyPreview, textBodyPreview } from "./tool-body.ts";

// Expectations come from the built-in body convention: preserve absolute positions, limit excerpts to 120 lines in total, and exclude newline annotations from the budget.
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
    const { fileDiff, omitted } = diffBodyPreview([
      "--- text.txt", "+++ text.txt", "@@ -10,3 +10,4 @@",
      " keep", "-old", "+new", "+extra", " last",
      "@@ -500,1 +501,1 @@", "-far old", "+far new", "",
    ].join("\n"))!;
    expect(fileDiff.hunks).toHaveLength(2);
    expect(fileDiff.hunks[0]).toMatchObject({ deletionStart: 10, additionStart: 10, deletionCount: 3, additionCount: 4 });
    expect(fileDiff.hunks[1]).toMatchObject({ deletionStart: 500, additionStart: 501, deletionCount: 1, additionCount: 1 });
    expect(fileDiff.deletionLines).toEqual(["keep\n", "old\n", "last\n", "far old\n"]);
    expect(fileDiff.additionLines).toEqual(["keep\n", "new\n", "extra\n", "last\n", "far new\n"]);
    expect(omitted).toBe(0);
  });

  it("context, deleted, and added lines across all excerpts total at most 120 lines", () => {
    const hunks = Array.from({ length: 31 }, (_, index) =>
      [`@@ -${index * 10 + 1},3 +${index * 10 + 1},3 @@`, " before", "-old", "+new", " after"].join("\n"));
    const preview = diffBodyPreview(["--- text.txt", "+++ text.txt", ...hunks, ""].join("\n"))!;
    expect(preview.fileDiff.hunks).toHaveLength(30);
    expect(preview.fileDiff.hunks.reduce((count, hunk) => count + hunk.unifiedLineCount, 0)).toBe(120);
    expect(preview.omitted).toBe(4);
    const large = diffBodyPreview(["--- text.txt", "+++ text.txt", "@@ -0,0 +1,121 @@",
      ...Array.from({ length: 121 }, (_, index) => `+line ${index + 1}`), ""].join("\n"))!;
    expect(large.fileDiff.hunks[0]).toMatchObject({ deletionCount: 0, additionCount: 120, unifiedLineCount: 120 });
    expect(large.fileDiff.additionLines[119]).toBe("line 120\n");
    expect(large.omitted).toBe(1);
  });

  it("preserves final-newline annotations for their respective versions without consuming the body budget", () => {
    const { fileDiff, omitted } = diffBodyPreview([
      "--- text.txt", "+++ text.txt", "@@ -1 +1 @@",
      "-old", "\\ No newline at end of file", "+new", "\\ No newline at end of file", "",
    ].join("\n"))!;
    expect(fileDiff.hunks[0]).toMatchObject({ noEOFCRAdditions: true, noEOFCRDeletions: true, unifiedLineCount: 2 });
    expect(fileDiff.deletionLines).toEqual(["old"]);
    expect(fileDiff.additionLines).toEqual(["new"]);
    expect(omitted).toBe(0);
  });

  it("falls back to raw text display for historical diffs that cannot be parsed", () => {
    expect(diffBodyPreview("not a patch")).toBeNull();
  });
});
