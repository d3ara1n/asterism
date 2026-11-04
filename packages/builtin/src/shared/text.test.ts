import { describe, expect, it } from "vitest";
import { applyPatch } from "diff";
import { readText, readToModel, editText, textChange, writeToModel, editToModel } from "./text.ts";
import { computeLineHash } from "./hashline/hash.ts";

// Expectations come from the tool contract: a failed batch writes nothing, anchors reference full content, and edits preserve original line endings.
describe("text tool contracts", () => {
  it("returns the same anchor for the same line in paginated and full content, and exposes no anchors when anchored is disabled", () => {
    const text = "zero\nfirst\nsecond";
    const full = readText(text, true);
    const part = readText(text, true, { offset: 2, limit: 1 });
    expect(part).toMatchObject({ fromLine: 2, totalLines: 3, nextOffset: 3, noFinalNewline: true });
    expect(part.rows).toEqual([full.rows[1]]);
    expect(readText(text, false).rows.every(row => row.hash === null)).toBe(true);
    expect(readToModel(readText(text, false))).toContain("2│first");
    expect(readToModel(readText(text, false))).not.toContain("#");
  });

  it("limits output by complete lines and provides a continuation position without truncating anchored content", () => {
    expect(readText("a\nb\nc", true, { maxBytes: 16 }).rows).toHaveLength(1);
    expect(readText("a\nb\nc", true, { maxBytes: 16 }).nextOffset).toBe(2);
    expect(() => readText("long line", true, { maxBytes: 2 })).toThrow("output limit");
    expect(() => readText("a", true, { offset: 2 })).toThrow("exceeds");
    expect(readText("", true)).toMatchObject({ rows: [], nextOffset: null });
  });

  // A single minified line previously caused read to reject the entire request or exhaust its budget; excerpt anchors must use the full line, or edit will reject or modify the wrong line.
  it("returns excerpts of very long lines with full-line anchors, preserves surrounding lines, and allows anchors to be used directly by edit", () => {
    const long = "x".repeat(231_654), text = `short\n${long}\nafter`;
    const data = readText(text, true, { limit: 30, maxBytes: 64 * 1024 });
    expect(data.rows.map(row => row.line)).toEqual([1, 2, 3]);
    expect(data.rows[1]).toMatchObject({ hash: computeLineHash(2, long), excerpt: { start: 0, length: 231_654 } });
    expect(data.rows[1].content).toHaveLength(400);
    expect(readToModel(data)).toContain("Line 2 is an excerpt (characters 0–400 of 231654); its anchor refers to the complete line.");
    expect(editText(text, [{ op: "delete", anchor: { line: 2, hash: data.rows[1].hash! } }]).text).toBe("short\nafter");
    // Ordinary long paragraphs should not be truncated, or notes cannot be edited directly.
    expect(readText("p".repeat(5000), true).rows[0].excerpt).toBeNull();
  });

  // When deleting or retaining very long lines, diff and anchor-mismatch errors previously echoed the entire line unchanged.
  it("edit model diffs and mismatch errors excerpt very long lines and state their ranges", () => {
    const long = "x".repeat(60_000), before = `first\n${long}\nlast`;
    const change = textChange(before, "first\nlast", "a.txt");
    const model = editToModel(change);
    expect(model).toContain("Removed line 2 is shown as its first 400 of 60000 characters.");
    expect(model.length).toBeLessThan(2000);
    expect(applyPatch(before, change.diff)).toBe("first\nlast");
    let message = "";
    try { editText(before, [{ op: "delete", anchor: { line: 2, hash: "ZZZZ" } }]); } catch (error) { message = (error as Error).message; }
    expect(message).toContain("The current line is an excerpt");
    expect(message.length).toBeLessThan(2000);
  });

  it("validates every anchor in a batch, uses shifts only for retry information, and requires reconfirmation for duplicate candidates", () => {
    const rows = readText("a\nb\nc", true).rows;
    const anchor = (i: number) => ({ line: rows[i].line, hash: rows[i].hash! });
    expect(() => editText("a\nchanged\nc", [
      { op: "replace", anchor: anchor(0), body: ["A"] },
      { op: "replace", anchor: anchor(1), body: ["B"] },
    ])).toThrow("original content preserved");
    expect(() => editText("prefix\na\nb\nc", [{ op: "replace", anchor: anchor(1), body: ["B"] }])).toThrow('"line":3');
    expect(() => editText("prefix\na\nb\nb", [{ op: "replace", anchor: anchor(1), body: ["B"] }])).toThrow("several nearby lines");
  });

  it("preserves mixed line endings and missing final newlines, returning reusable anchors and an actual applicable diff", () => {
    const before = "a\r\nb\nc";
    const row = readText(before, true).rows[1];
    const edited = editText(before, [{ op: "replace", anchor: { line: row.line, hash: row.hash! }, body: ["B"] }]);
    expect(edited.text).toBe("a\r\nB\nc");
    const change = textChange(before, edited.text, "text.txt", edited.touchedLines);
    expect(change).toMatchObject({ added: 1, removed: 1, anchors: [{ line: 2, content: "B" }] });
    expect(applyPatch(before, change.diff)).toBe(edited.text);
    expect(editText(edited.text, [{ op: "insert_after", anchor: { line: 2, hash: change.anchors[0].hash! }, body: ["new"] }]).text).toBe("a\r\nB\nnew\r\nc");
    const loneCr = readText("a\nlast\r", true).rows[0];
    expect(editText("a\nlast\r", [{ op: "replace", anchor: { line: 1, hash: loneCr.hash! }, body: ["A"] }]).text).toBe("A\nlast\r");
  });

  it("rejects overlapping, reversed, and unchanged edit operations, while complete write operations remain repeatable and unanchored", () => {
    const text = "a\nb\nc\n";
    const rows = readText(text, true).rows;
    const a = (i: number) => ({ line: rows[i].line, hash: rows[i].hash! });
    expect(() => editText(text, [{ op: "delete", anchor: a(0), end: a(1) }, { op: "replace", anchor: a(1), body: ["x"] }])).toThrow("overlapping");
    expect(() => editText(text, [{ op: "delete", anchor: a(2), end: a(0) }])).toThrow("ends before");
    expect(() => editText(text, [{ op: "replace", anchor: a(0), body: ["a"] }])).toThrow("no change");
    expect(textChange(text, text, "note")).toMatchObject({ changed: false, diff: "", anchors: [] });
    expect(textChange(text, "other\n", "note").anchors).toEqual([]);
  });

  // Boundary insertions consume no original lines; range application must not remove the inserted text.
  it("combines insertions at both range boundaries with replacement regardless of operation order", () => {
    const text = "a\nb\nc\nd";
    const a = (line: number) => ({ line, hash: computeLineHash(line, ["a", "b", "c", "d"][line - 1]) });
    const edits = [
      { op: "insert_after" as const, anchor: a(3), body: ["after"] },
      { op: "replace" as const, anchor: a(2), end: a(3), body: ["B1", "B2"] },
      { op: "insert_before" as const, anchor: a(2), body: ["before"] },
    ];
    for (const batch of [edits, [...edits].reverse()]) {
      const edited = editText(text, batch);
      expect(edited.text).toBe("a\nbefore\nB1\nB2\nafter\nd");
      expect(edited.touchedLines).toEqual([1, 2, 3, 4]);
    }
  });

  // Different anchors can identify the same gap; sorting must preserve input order within it.
  it("orders shared-gap insertions by the batch array before a replacement starting there", () => {
    const text = "a\nb\nc";
    const first = { line: 1, hash: computeLineHash(1, "a") };
    const second = { line: 2, hash: computeLineHash(2, "b") };
    const insertions = [
      { op: "insert_before" as const, anchor: second, body: ["x"] },
      { op: "insert_after" as const, anchor: first, body: ["y"] },
      { op: "insert_before" as const, anchor: second, body: ["z"] },
    ];
    const replacement = { op: "replace" as const, anchor: second, body: ["B"] };
    const edited = editText(text, [replacement, ...insertions]);
    expect(edited.text).toBe("a\nx\ny\nz\nB\nc");
    expect(edited.touchedLines).toEqual([1, 2, 3, 4]);
    expect(editText(text, [replacement, ...[...insertions].reverse()]).text).toBe("a\nz\ny\nx\nB\nc");
  });

  it("retains boundary insertions around deletion and an adjacent expanding replacement", () => {
    const text = "a\nb\nc\nd\ne";
    const a = (line: number) => ({ line, hash: computeLineHash(line, ["a", "b", "c", "d", "e"][line - 1]) });
    const edited = editText(text, [
      { op: "replace", anchor: a(4), body: ["D1", "D2"] },
      { op: "delete", anchor: a(2), end: a(3) },
      { op: "insert_before", anchor: a(2), body: ["left"] },
      { op: "insert_after", anchor: a(3), body: ["middle1"] },
      { op: "insert_before", anchor: a(4), body: ["middle2"] },
    ]);
    expect(edited.text).toBe("a\nleft\nmiddle1\nmiddle2\nD1\nD2\ne");
    expect(edited.touchedLines).toEqual([1, 2, 3, 4, 5]);
    const change = textChange(text, edited.text, "text.txt", edited.touchedLines);
    expect(change.anchors.map(row => [row.line, row.content])).toEqual([
      [2, "left"], [3, "middle1"], [4, "middle2"], [5, "D1"], [6, "D2"],
    ]);
  });

  it("combines prepend and append with deletion to empty text and orders insertions into an empty target", () => {
    const text = "a\nb\n";
    const edited = editText(text, [
      { op: "append", body: ["last"] },
      { op: "delete", anchor: { line: 1, hash: computeLineHash(1, "a") }, end: { line: 2, hash: computeLineHash(2, "b") } },
      { op: "prepend", body: ["first"] },
    ]);
    expect(edited.text).toBe("first\nlast\n");
    expect(edited.touchedLines).toEqual([0, 1]);
    expect(editText("", [{ op: "append", body: ["one"] }, { op: "prepend", body: ["two"] }]).text).toBe("one\ntwo\n");
  });

  // Zero-width operations must not hide the active consuming range during conflict checks.
  it("rejects insertions strictly inside replaced or deleted ranges and identifies both conflicting operations", () => {
    const text = "a\nb\nc\nd";
    const a = (line: number) => ({ line, hash: computeLineHash(line, ["a", "b", "c", "d"][line - 1]) });
    for (const op of ["replace", "delete"] as const) {
      const range = op === "replace"
        ? { op, anchor: a(1), end: a(4), body: ["replacement"] }
        : { op, anchor: a(1), end: a(4) };
      expect(() => editText(text, [
        { op: "insert_after", anchor: a(2), body: ["inside"] },
        range,
        { op: "insert_before", anchor: a(1), body: ["boundary1"] },
        { op: "prepend", body: ["boundary2"] },
      ])).toThrow("overlapping edits[1] and edits[0]");
    }
  });

  it("preserves mixed separators and missing final newline when composing boundary insertions and resized ranges", () => {
    const text = "a\r\nb\nc\r\nd";
    const edited = editText(text, [
      { op: "append", body: ["tail"] },
      { op: "insert_after", anchor: { line: 3, hash: computeLineHash(3, "c") }, body: ["right"] },
      { op: "replace", anchor: { line: 2, hash: computeLineHash(2, "b") }, end: { line: 3, hash: computeLineHash(3, "c") }, body: ["B1", "B2", "B3"] },
      { op: "insert_before", anchor: { line: 2, hash: computeLineHash(2, "b") }, body: ["left"] },
      { op: "prepend", body: ["head"] },
    ]);
    expect(edited.text).toBe("head\r\na\r\nleft\r\nB1\nB2\r\nB3\r\nright\r\nd\r\ntail");
    const change = textChange(text, edited.text, "text.txt", edited.touchedLines);
    expect(change.anchors.map(row => [row.line, row.content])).toEqual([
      [1, "head"], [3, "left"], [4, "B1"], [5, "B2"], [6, "B3"], [7, "right"], [9, "tail"],
    ]);
    expect(applyPatch(text, change.diff)).toBe(edited.text);
    const last = change.anchors.at(-1)!;
    expect(editText(edited.text, [{ op: "replace", anchor: { line: last.line, hash: last.hash! }, body: ["TAIL"] }]).text)
      .toBe("head\r\na\r\nleft\r\nB1\nB2\r\nB3\r\nright\r\nd\r\nTAIL");
  });

  it("provides explicit new anchors for additions, deletions, deletion to empty text, and insertions at either end, preserving the missing-final-newline marker", () => {
    const before = "a\nb";
    const rows = readText(before, true).rows;
    const removed = editText(before, [{ op: "delete", anchor: { line: 1, hash: rows[0].hash! } }]);
    expect(removed.text).toBe("b");
    const empty = editText(before, [{ op: "delete", anchor: { line: 1, hash: rows[0].hash! }, end: { line: 2, hash: rows[1].hash! } }]);
    expect(empty.text).toBe("");
    expect(editText("", [{ op: "append", body: ["new"] }]).text).toBe("new\n");
    expect(editText(before, [{ op: "prepend", body: ["first"] }, { op: "append", body: ["last"] }]).text).toBe("first\na\nb\nlast");
    const change = textChange(before, "a\nB\n", "text.txt");
    expect(change.diff).toContain("\\ No newline at end of file");
    expect(applyPatch(before, change.diff)).toBe("a\nB\n");
  });

  it("edit model diffs and new anchors have independent budgets, while write retains a brief description", () => {
    const after = Array.from({ length: 50 }, (_, i) => `${i} ${"x".repeat(2000)}`).join("\n");
    const change = textChange("", after, "text.txt", Array.from({ length: 50 }, (_, i) => i));
    expect(change.anchorsTruncated).toBe(true);
    const model = editToModel(change), lines = model.split("\n");
    const diff = lines.filter(line => /^(?:@@ |--- |\+\+\+ |[ +\-\\])/.test(line)).join("\n");
    const anchors = lines.filter(line => /^\d+#.*│/.test(line));
    expect(Buffer.byteLength(diff)).toBeLessThanOrEqual(64 * 1024);
    expect(anchors.length).toBeLessThanOrEqual(40);
    expect(Buffer.byteLength(anchors.join("\n"))).toBeLessThanOrEqual(16 * 1024);
    expect(model).toMatch(/truncat/i);
    expect(model).toMatch(/omit/i);
    for (const anchor of change.anchors) expect(model).toContain(String(anchor.line) + "#" + anchor.hash + "│" + anchor.content);
    expect(writeToModel(change).split("\n")).toHaveLength(1);
    expect(writeToModel(change)).not.toContain(change.diff);
    expect(writeToModel(change)).not.toContain("│");
    expect(writeToModel(textChange(after, after, "text.txt"))).toEqual(expect.any(String));
    expect(applyPatch("", change.diff)).toBe(after);
  });
  it("the user body-preview budget does not limit content returned to the model by read", () => {
    const text = Array.from({ length: 200 }, (_, index) => `line ${index + 1}`).join("\n");
    expect(readToModel(readText(text, false))).toContain("200│line 200");
  });
});
