import { describe, expect, it } from "vitest";
import { applyPatch } from "diff";
import { replaceText } from "./replace.ts";
import { editText, textChange } from "./text.ts";

// Expectations follow global JavaScript replacement semantics and the shared text-change contract.
describe("bulk text replacement", () => {
  it("escapes literal patterns and inserts dollar sequences verbatim at every non-overlapping match", () => {
    expect(replaceText("a.b axb a.b", { find: "a.b", replace: "$&/$1/$$" }))
      .toEqual({ text: "$&/$1/$$ axb $&/$1/$$", matches: 2 });
    expect(replaceText("aaa", { find: "aa", replace: "a" })).toEqual({ text: "aa", matches: 1 });
    expect(replaceText("A+B a+b", { find: "a+b", replace: "x", flags: "i" })).toEqual({ text: "x x", matches: 2 });
  });

  it("expands numbered, named, and unmatched captures using the complete source context", () => {
    expect(replaceText("getName getAge", { find: "get(?<name>[A-Z]\\w+)", replace: "$<name>:$1:$$", regex: true }))
      .toEqual({ text: "Name:Name:$ Age:Age:$", matches: 2 });
    expect(replaceText("ab b", { find: "(a)?b", replace: "[$1]", regex: true }))
      .toEqual({ text: "[a] []", matches: 2 });
    expect(replaceText("abc", { find: "(?<=a)b", replace: "[$`][$&][$']", regex: true }))
      .toEqual({ text: "a[a][b][c]c", matches: 1 });
  });

  it("handles zero-width matches at Unicode boundaries and line anchors", () => {
    expect(replaceText("😀a", { find: "(?=.)", replace: "|", regex: true, flags: "u" }))
      .toEqual({ text: "|😀|a", matches: 2 });
    expect(replaceText("one\ntwo", { find: "^", replace: "> ", regex: true, flags: "m" }))
      .toEqual({ text: "> one\n> two", matches: 2 });
    expect(replaceText("", { find: "^$", replace: "new", regex: true }))
      .toEqual({ text: "new", matches: 1 });
  });

  it("preserves unmatched mixed line endings and a missing final newline", () => {
    const before = "old\r\nkeep\nold", after = "new\r\nkeep\nnew";
    const replaced = replaceText(before, { find: "old", replace: "new" });
    expect(replaced).toEqual({ text: after, matches: 2 });
    const data = textChange(before, replaced.text, "mixed.txt", "diff");
    expect(applyPatch(before, data.diff)).toBe(after);
    expect(data.anchors.map(row => [row.line, row.content])).toEqual([[1, "new"], [3, "new"]]);
    expect(replaceText("start\r\nend", { find: "start.*end", replace: "done", regex: true, flags: "s" }))
      .toEqual({ text: "done", matches: 1 });
  });

  it("reports invalid expressions and flags, distinguishes no match from an identical replacement", () => {
    expect(() => replaceText("abc", { find: "[", replace: "", regex: true })).toThrow();
    expect(() => replaceText("abc", { find: "a", replace: "", flags: "ii" })).toThrow();
    expect(() => replaceText("abc", { find: "a", replace: "", flags: "uv" })).toThrow();
    expect(() => replaceText("abc", { find: "missing", replace: "" })).toThrow("matched no content");
    const replaced = replaceText("a a", { find: "a", replace: "$&", regex: true });
    expect(replaced).toEqual({ text: "a a", matches: 2 });
    expect(textChange("a a", replaced.text, "same.txt", "diff")).toMatchObject({ changed: false, diff: "", anchors: [] });
  });

  it("returns only changed lines for distant replacements and anchors can drive a subsequent edit", () => {
    const middle = Array.from({ length: 60 }, (_, i) => `unchanged ${i}`).join("\n");
    const before = `old\n${middle}\nold`;
    const replaced = replaceText(before, { find: "old", replace: "new" });
    const data = textChange(before, replaced.text, "sparse.txt", "diff");
    expect(data.anchors.map(row => [row.line, row.content])).toEqual([[1, "new"], [62, "new"]]);
    expect(data.anchorsTruncated).toBe(false);
    const row = data.anchors[1];
    expect(editText(replaced.text, [{ op: "replace", anchor: { line: row.line, hash: row.hash! }, body: ["last"] }]).text)
      .toBe(`new\n${middle}\nlast`);
  });

  it("anchors inserted lines and surviving deletion gaps, including deletion at the end and to empty content", () => {
    const expanded = replaceText("head\nX\ntail", { find: "X", replace: "a\nb" });
    expect(textChange("head\nX\ntail", expanded.text, "expand", "diff").anchors.map(row => [row.line, row.content]))
      .toEqual([[2, "a"], [3, "b"]]);
    const removed = replaceText("head\nremove\ntail", { find: "remove\n", replace: "" });
    expect(textChange("head\nremove\ntail", removed.text, "gap", "diff").anchors.map(row => [row.line, row.content]))
      .toEqual([[2, "tail"]]);
    expect(textChange("head\ntail\n", "head\n", "end", "diff").anchors).toEqual([]);
    expect(textChange("all\n", "", "empty", "diff").anchors).toEqual([]);
    expect(textChange("", "new", "insert", "diff").anchors.map(row => [row.line, row.content])).toEqual([[1, "new"]]);
  });
});
