import { parsePatchFiles, type FileDiffMetadata } from "@pierre/diffs";
import { formatPatch, parsePatch, type StructuredPatchHunk } from "diff";

import { splitLines } from "./hashline/lines.ts";

/** 内置插件正文的逻辑行预算；不约束工具外壳、原始详情或模型输出。 */
export const TOOL_BODY_LINE_LIMIT = 120;

export function textBodyPreview(text: string) {
  const lines = splitLines(text);
  return {
    rows: lines.slice(0, TOOL_BODY_LINE_LIMIT).map((content, index) => ({ line: index + 1, content })),
    omitted: Math.max(0, lines.length - TOOL_BODY_LINE_LIMIT),
  };
}

/** 保留真实片段位置，只把预算内的预览补丁交给 Pierre 生成行号与元数据。 */
export function diffBodyPreview(diff: string): { fileDiff: FileDiffMetadata; omitted: number } | null {
  try {
    const patches = parsePatch(diff);
    if (patches.length !== 1 || !patches[0].hunks.length) return null;
    const patch = patches[0];
    const hunks: StructuredPatchHunk[] = [];
    let shown = 0, omitted = 0;
    for (const hunk of patch.hunks) {
      const lines: string[] = [];
      let oldLines = 0, newLines = 0, previousShown = false;
      for (const line of hunk.lines) {
        const prefix = line[0];
        if (prefix === "\\") {
          if (previousShown) lines.push(line);
          continue;
        }
        if (prefix !== " " && prefix !== "+" && prefix !== "-") return null;
        previousShown = shown < TOOL_BODY_LINE_LIMIT;
        if (!previousShown) { omitted++; continue; }
        lines.push(line);
        shown++;
        if (prefix !== "+") oldLines++;
        if (prefix !== "-") newLines++;
      }
      if (lines.length) hunks.push({ ...hunk, lines, oldLines, newLines });
    }
    const fileDiff = parsePatchFiles(formatPatch({ ...patch, hunks }), undefined, true)[0]?.files[0];
    return fileDiff ? { fileDiff: { ...fileDiff, lang: "text" }, omitted } : null;
  } catch {
    return null;
  }
}
