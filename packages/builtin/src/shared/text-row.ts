import type { TextRow } from "@asterism-app/builtin-api/contracts";
import { computeLineHash } from "./hashline/hash.ts";

/** Long-line threshold for read/edit echoes: allows ordinary long paragraphs while limiting minified output and inline base64. */
export const READ_EXCERPT_THRESHOLD = 16_000;
/** grep uses a lower threshold because it locates content. */
export const SEARCH_EXCERPT_THRESHOLD = 1000;
const EXCERPT_BEFORE = 120;
const EXCERPT_LENGTH = 400;

/** Extracts a window near focus without splitting surrogate pairs at either end. */
export function excerptWindow(content: string, focus: number): { start: number; end: number } {
  let start = Math.max(0, Math.min(focus - EXCERPT_BEFORE, content.length - EXCERPT_LENGTH));
  let end = Math.min(content.length, start + EXCERPT_LENGTH);
  if (start > 0 && /[\uDC00-\uDFFF]/u.test(content[start])) start++;
  if (end < content.length && /[\uD800-\uDBFF]/u.test(content[end - 1])) end--;
  return { start, end };
}

/**
 * Builds result rows: anchors are always calculated from full lines before excerpts are taken, so excerpt anchors point to the actual full line.
 * Lines exceeding the threshold retain only a window near focus (a UTF-16 offset, defaulting to the line start).
 */
export function textRow(line: number, content: string, anchored: boolean, threshold: number, focus = 0): TextRow {
  const hash = anchored ? computeLineHash(line, content) : null;
  if (content.length <= threshold) return { line, content, hash, excerpt: null };
  const { start, end } = excerptWindow(content, focus);
  return { line, content: content.slice(start, end), hash, excerpt: { start, length: content.length } };
}

/** Model row format matches read; excerpts contain only window text, with their range stated in excerptNote rather than appended inline. */
export function rowText(row: TextRow): string {
  return `${row.line}${row.hash === null ? "" : `#${row.hash}`}│${row.content}`;
}
export function excerptNote(row: TextRow, label = `Line ${row.line}`): string | null {
  if (!row.excerpt) return null;
  const { start, length } = row.excerpt;
  return `${label} is an excerpt (characters ${start}–${start + row.content.length} of ${length})${row.hash === null ? "" : "; its anchor refers to the complete line"}.`;
}
/** UI display marks truncated ends with ellipses. */
export function displayText(row: Pick<TextRow, "content" | "excerpt">): string {
  if (!row.excerpt) return row.content;
  return `${row.excerpt.start > 0 ? "…" : ""}${row.content}${row.excerpt.start + row.content.length < row.excerpt.length ? "…" : ""}`;
}
/** Original text not excerpted in results (write bodies, diff lines) is also clipped from the line start and ends with an ellipsis when it exceeds the UI preview threshold. */
export function displayLine(content: string, threshold = READ_EXCERPT_THRESHOLD): string {
  if (content.length <= threshold) return content;
  return `${content.slice(0, excerptWindow(content, 0).end)}…`;
}

/** diff lines retain their first character (space/ +/-/\); bodies exceeding the threshold are clipped from the line start. */
export function clipDiffLine(line: string, threshold = READ_EXCERPT_THRESHOLD): { text: string; length: number } | null {
  const body = line.slice(1);
  if (body.length <= threshold) return null;
  const { end } = excerptWindow(body, 0);
  return { text: `${line[0]}${body.slice(0, end)}`, length: body.length };
}
