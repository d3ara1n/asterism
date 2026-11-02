import { describe, expect, it } from "vitest";
import { diffLines } from "diff";
import { marksFromChanges } from "./line-marks.ts";

const marks = (before: string, after: string) => marksFromChanges(diffLines(before, after), after.split("\n").length);
describe("Editor Git line marks", () => {
  it("marks inserted lines without shifting the following unchanged line", () => {
    expect(marks("a\nc\n", "a\nb\nc\n")).toEqual([{ line: 2, change: "added" }]);
  });
  it("distinguishes replacement lines from additional inserted lines", () => {
    expect(marks("old\nend", "new\nextra\nend")).toEqual([{ line: 1, change: "modified" }, { line: 2, change: "added" }]);
  });
  it("anchors deleted lines before the surviving next line", () => {
    expect(marks("a\nb\nc", "a\nc")).toEqual([{ line: 2, removed: "before" }]);
  });
  it("anchors a deletion at the end of a file after its last line", () => {
    expect(marks("a\nb", "a")).toEqual([{ line: 1, change: "modified", removed: "after" }]);
  });
  it("can show deletion of all content on the empty editor line", () => {
    expect(marks("a\nb\n", "")).toEqual([{ line: 1, removed: "before" }]);
  });
  it("shows untracked file lines as additions and no marks for identical content", () => {
    expect(marks("", "a\nb\n")).toEqual([{ line: 1, change: "added" }, { line: 2, change: "added" }]);
    expect(marks("same\n", "same\n")).toEqual([]);
  });
});
