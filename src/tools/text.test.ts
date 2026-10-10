import { describe, expect, it } from "vitest";
import { applyPatch } from "diff";
import { Read, Edit, Write } from "./declarations.ts";
import { readText, readToModel, editText, textChange, changeToModel } from "./text.ts";

// 预期来自工具契约：定位不进 args、失败整批不写、锚点指向完整正文、编辑保留原始换行。
describe("正文工具契约", () => {
  it("read 只接受 anchored，write 不接受锚点，edit 按操作要求字段", () => {
    expect(Read.argsSchema.safeParse({ anchored: false }).success).toBe(true);
    expect(Read.argsSchema.safeParse({ offset: 2 }).success).toBe(false);
    expect(Write.argsSchema.safeParse({ content: "x", anchor: { line: 1, hash: "ABCD" } }).success).toBe(false);
    expect(Edit.argsSchema.safeParse({ edits: [{ op: "replace", body: ["x"] }] }).success).toBe(false);
    expect(Edit.argsSchema.safeParse({ edits: [{ op: "append", body: ["x\ny"] }] }).success).toBe(false);
    expect(Edit.argsSchema.safeParse({ edits: [{ op: "delete", anchor: { line: 1, hash: "ABCD" }, body: ["x"] }] }).success).toBe(false);
  });

  it("分页与完整正文的同一行返回相同锚点，关闭 anchored 后不泄露锚点", () => {
    const text = "zero\nfirst\nsecond";
    const full = readText(text, true);
    const part = readText(text, true, { offset: 2, limit: 1 });
    expect(part).toMatchObject({ fromLine: 2, totalLines: 3, nextOffset: 3, noFinalNewline: true });
    expect(part.rows).toEqual([full.rows[1]]);
    expect(readText(text, false).rows.every(row => row.hash === null)).toBe(true);
    expect(readToModel(readText(text, false))).toContain("2│first");
    expect(readToModel(readText(text, false))).not.toContain("#");
  });

  it("按完整行限制输出，提供能继续读取的位置，不截断带锚点的内容", () => {
    expect(readText("a\nb\nc", true, { maxBytes: 16 }).rows).toHaveLength(1);
    expect(readText("a\nb\nc", true, { maxBytes: 16 }).nextOffset).toBe(2);
    expect(() => readText("long line", true, { maxBytes: 2 })).toThrow("complete lines");
    expect(() => readText("a", true, { offset: 2 })).toThrow("exceeds");
    expect(readText("", true)).toMatchObject({ rows: [], nextOffset: null });
  });

  it("同一批次校验全部锚点；位移仅提供重试信息，重复候选要求重新确认", () => {
    const rows = readText("a\nb\nc", true).rows;
    const anchor = (i: number) => ({ line: rows[i].line, hash: rows[i].hash! });
    expect(() => editText("a\nchanged\nc", [
      { op: "replace", anchor: anchor(0), body: ["A"] },
      { op: "replace", anchor: anchor(1), body: ["B"] },
    ])).toThrow("no changes were written");
    expect(() => editText("prefix\na\nb\nc", [{ op: "replace", anchor: anchor(1), body: ["B"] }])).toThrow('"line":3');
    expect(() => editText("prefix\na\nb\nb", [{ op: "replace", anchor: anchor(1), body: ["B"] }])).toThrow("several nearby lines");
  });

  it("保留混合换行与无末尾换行，返回可直接继续编辑的锚点和真实可应用 diff", () => {
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

  it("拒绝重叠、倒置和无变化的 edit，但完整 write 可重复且没有锚点", () => {
    const text = "a\nb\nc\n";
    const rows = readText(text, true).rows;
    const a = (i: number) => ({ line: rows[i].line, hash: rows[i].hash! });
    expect(() => editText(text, [{ op: "delete", anchor: a(0), end: a(1) }, { op: "replace", anchor: a(1), body: ["x"] }])).toThrow("overlapping");
    expect(() => editText(text, [{ op: "delete", anchor: a(2), end: a(0) }])).toThrow("ends before");
    expect(() => editText(text, [{ op: "replace", anchor: a(0), body: ["a"] }])).toThrow("no change");
    expect(textChange(text, text, "note")).toMatchObject({ changed: false, diff: "", anchors: [] });
    expect(textChange(text, "other\n", "note").anchors).toEqual([]);
  });

  it("增删、删除到空文本、首尾插入都有明确的新锚点；无末尾换行标记不丢失", () => {
    const before = "a\nb";
    const rows = readText(before, true).rows;
    const removed = editText(before, [{ op: "delete", anchor: { line: 1, hash: rows[0].hash! } }]);
    expect(removed).toMatchObject({ text: "b", touchedLines: [0] });
    const empty = editText(before, [{ op: "delete", anchor: { line: 1, hash: rows[0].hash! }, end: { line: 2, hash: rows[1].hash! } }]);
    expect(empty.text).toBe("");
    expect(editText("", [{ op: "append", body: ["new"] }]).text).toBe("new\n");
    expect(editText(before, [{ op: "prepend", body: ["first"] }, { op: "append", body: ["last"] }]).text).toBe("first\na\nb\nlast");
    const change = textChange(before, "a\nB\n", "text.txt");
    expect(change.diff).toContain("\\ No newline at end of file");
    expect(applyPatch(before, change.diff)).toBe("a\nB\n");
  });

  it("大结果明确限制模型 diff 与新锚点，不截断后假装完整", () => {
    const after = Array.from({ length: 50 }, (_, i) => `${i} ${"x".repeat(2000)}`).join("\n");
    const change = textChange("", after, "text.txt", Array.from({ length: 50 }, (_, i) => i));
    expect(change.anchorsTruncated).toBe(true);
    expect(Buffer.byteLength(changeToModel(change))).toBeLessThan(84 * 1024);
    expect(changeToModel(change)).toContain("Diff output was truncated");
    expect(applyPatch("", change.diff)).toBe(after);
  });
});
