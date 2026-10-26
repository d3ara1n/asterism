import type { TextRow } from "@asterism/builtin-api/contracts";
import { computeLineHash } from "./hashline/hash.ts";

/** read／edit 回显的长行阈值：放过正常的长段落，截住压缩产物与内联 base64。 */
export const READ_EXCERPT_THRESHOLD = 16_000;
/** grep 用于定位，阈值更低。 */
export const SEARCH_EXCERPT_THRESHOLD = 1000;
const EXCERPT_BEFORE = 120;
const EXCERPT_LENGTH = 400;

/** 在 focus 附近截取窗口；起止不拆开代理对。 */
export function excerptWindow(content: string, focus: number): { start: number; end: number } {
  let start = Math.max(0, Math.min(focus - EXCERPT_BEFORE, content.length - EXCERPT_LENGTH));
  let end = Math.min(content.length, start + EXCERPT_LENGTH);
  if (start > 0 && /[\uDC00-\uDFFF]/u.test(content[start])) start++;
  if (end < content.length && /[\uD800-\uDBFF]/u.test(content[end - 1])) end--;
  return { start, end };
}

/**
 * 构造结果行：锚点始终按完整行计算，之后才截取片段，片段锚点因此指向真实整行。
 * 超过阈值的行只保留 focus（UTF-16 偏移，默认行首）附近的窗口。
 */
export function textRow(line: number, content: string, anchored: boolean, threshold: number, focus = 0): TextRow {
  const hash = anchored ? computeLineHash(line, content) : null;
  if (content.length <= threshold) return { line, content, hash, excerpt: null };
  const { start, end } = excerptWindow(content, focus);
  return { line, content: content.slice(start, end), hash, excerpt: { start, length: content.length } };
}

/** 模型行格式与 read 一致；片段只给窗口文字，范围在 excerptNote 中陈述，不在行内追加说明。 */
export function rowText(row: TextRow): string {
  return `${row.line}${row.hash === null ? "" : `#${row.hash}`}│${row.content}`;
}
export function excerptNote(row: TextRow, label = `Line ${row.line}`): string | null {
  if (!row.excerpt) return null;
  const { start, length } = row.excerpt;
  return `${label} is an excerpt (characters ${start}–${start + row.content.length} of ${length})${row.hash === null ? "" : "; its anchor refers to the complete line"}.`;
}
/** 界面展示以省略号标出截断的一端。 */
export function displayText(row: Pick<TextRow, "content" | "excerpt">): string {
  if (!row.excerpt) return row.content;
  return `${row.excerpt.start > 0 ? "…" : ""}${row.content}${row.excerpt.start + row.content.length < row.excerpt.length ? "…" : ""}`;
}
/** 界面预览中未经结果截取的原文（write 正文、diff 行）超过阈值时同样从行首截取，以省略号结尾。 */
export function displayLine(content: string, threshold = READ_EXCERPT_THRESHOLD): string {
  if (content.length <= threshold) return content;
  return `${content.slice(0, excerptWindow(content, 0).end)}…`;
}

/** diff 行保留首字符（空格／+／-／\），正文超过阈值时从行首截取。 */
export function clipDiffLine(line: string, threshold = READ_EXCERPT_THRESHOLD): { text: string; length: number } | null {
  const body = line.slice(1);
  if (body.length <= threshold) return null;
  const { end } = excerptWindow(body, 0);
  return { text: `${line[0]}${body.slice(0, end)}`, length: body.length };
}
