import { describe, expect, it } from "vitest";
import { applyPatch } from "diff";
import { Read, Edit, Write } from "@asterism/builtin-api/contracts";
import { readText, readToModel, editText, textChange, writeToModel, editToModel } from "./text.ts";
import { computeLineHash } from "./hashline/hash.ts";

// Expectations come from the tool contract: targeting stays out of args, a failed batch writes nothing, anchors reference full content, and edits preserve original line endings.
describe("text tool contracts", () => {
  it("read accepts only anchored, write accepts no anchors, and edit requires fields according to the operation", () => {
    expect(Read.argsSchema.safeParse({ anchored: false }).success).toBe(true);
    expect(Read.argsSchema.safeParse({ offset: 2 }).success).toBe(false);
    expect(Write.argsSchema.safeParse({ content: "x", anchor: { line: 1, hash: "ABCD" } }).success).toBe(false);
    expect(Edit.argsSchema.safeParse({ edits: [{ op: "replace", body: ["x"] }] }).success).toBe(false);
    expect(Edit.argsSchema.safeParse({ edits: [{ op: "append", body: ["x\ny"] }] }).success).toBe(false);
    expect(Edit.argsSchema.safeParse({ edits: [{ op: "delete", anchor: { line: 1, hash: "ABCD" }, body: ["x"] }] }).success).toBe(false);
  });

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
