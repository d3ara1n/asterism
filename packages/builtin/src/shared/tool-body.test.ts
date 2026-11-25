import { parsePatch } from "diff";
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
    const preview = diffBodyPreview([
      "--- text.txt", "+++ text.txt", "@@ -10,3 +10,4 @@",
      " keep", "-old", "+new", "+extra", " last",
      "@@ -500,1 +501,1 @@", "-far old", "+far new", "",
    ].join("\n"))!;
    expect(parsePatch(preview)[0].hunks).toEqual([
      { oldStart: 10, newStart: 10, oldLines: 3, newLines: 4, lines: [" keep", "-old", "+new", "+extra", " last"] },
      { oldStart: 500, newStart: 501, oldLines: 1, newLines: 1, lines: ["-far old", "+far new"] },
    ]);
  });

  it("keeps every hunk so changes beyond any single-body budget remain reachable", () => {
    const hunks = Array.from({ length: 31 }, (_, index) =>
      [`@@ -${index * 10 + 1},3 +${index * 10 + 1},3 @@`, " before", "-old", "+new", " after"].join("\n"));
    const preview = diffBodyPreview(["--- text.txt", "+++ text.txt", ...hunks, ""].join("\n"))!;
    const renderedHunks = parsePatch(preview)[0].hunks;
    expect(renderedHunks).toHaveLength(31);
    expect(renderedHunks.reduce((count, hunk) => count + hunk.lines.length, 0)).toBe(124);
    expect(renderedHunks[30]).toMatchObject({ oldStart: 301, newStart: 301 });
  });

  it("preserves final-newline annotations for their respective versions", () => {
    const preview = diffBodyPreview([
      "--- text.txt", "+++ text.txt", "@@ -1 +1 @@",
      "-old", "\\ No newline at end of file", "+new", "\\ No newline at end of file", "",
    ].join("\n"))!;
    expect(parsePatch(preview)[0].hunks[0].lines).toEqual([
      "-old", "\\ No newline at end of file", "+new", "\\ No newline at end of file",
    ]);
  });

  it("clips the contents of a long line without losing its diff marker or the following row", () => {
    const preview = diffBodyPreview([
      "--- text.txt", "+++ text.txt", "@@ -1,2 +1,2 @@",
      `-${"a".repeat(20_000)}`, "+short", " after", "",
    ].join("\n"))!;
    expect(parsePatch(preview)[0].hunks[0].lines).toEqual([`-${"a".repeat(400)}…`, "+short", " after"]);
  });

  it("falls back to raw text display for historical diffs that cannot be parsed", () => {
    expect(diffBodyPreview("not a patch")).toBeNull();
  });
});
