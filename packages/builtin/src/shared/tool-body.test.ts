import { describe, expect, it } from "vitest";
import { diffBodyPreview, textBodyPreview } from "./tool-body.ts";

// 预期来自内置正文约定：保留绝对位置、片段合计最多 120 行、换行注记不占预算。
describe("内置工具正文预览", () => {
  it("write 只显示前 120 个逻辑行，末尾换行不增加空行", () => {
    const text = Array.from({ length: 121 }, (_, index) => `line ${index + 1}`).join("\r\n") + "\r\n";
    const preview = textBodyPreview(text);
    expect(preview.rows).toHaveLength(120);
    expect(preview.rows[119]).toEqual({ line: 120, content: "line 120" });
    expect(preview.omitted).toBe(1);
    expect(textBodyPreview("")).toEqual({ rows: [], omitted: 0 });
  });

  it("远处编辑点保持前后绝对行号，不补入中间正文", () => {
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

  it("所有片段的上下文、删除与新增行合计最多 120 行", () => {
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

  it("末尾换行注记保留给对应版本，不占用正文预算", () => {
    const { fileDiff, omitted } = diffBodyPreview([
      "--- text.txt", "+++ text.txt", "@@ -1 +1 @@",
      "-old", "\\ No newline at end of file", "+new", "\\ No newline at end of file", "",
    ].join("\n"))!;
    expect(fileDiff.hunks[0]).toMatchObject({ noEOFCRAdditions: true, noEOFCRDeletions: true, unifiedLineCount: 2 });
    expect(fileDiff.deletionLines).toEqual(["old"]);
    expect(fileDiff.additionLines).toEqual(["new"]);
    expect(omitted).toBe(0);
  });

  it("无法解析的历史 diff 回退原文展示", () => {
    expect(diffBodyPreview("not a patch")).toBeNull();
  });
});
