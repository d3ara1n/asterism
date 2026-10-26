import { Buffer } from "node:buffer";
import { structuredPatch, formatPatch } from "diff";
import { applyEdits } from "./hashline/apply.ts";
import { clipDiffLine, excerptNote, READ_EXCERPT_THRESHOLD, rowText, textRow } from "./text-row.ts";
import { hasFinalNewline, splitLines } from "./hashline/lines.ts";
import type { ApplyFailure, Edit } from "./hashline/types.ts";
import type { TextRead, TextChange } from "@asterism/builtin-api/contracts";
import type { CallResult } from "@asterism/sdk/runtime";

const MAX_ANCHOR_LINES = 40;
const MAX_ANCHOR_BYTES = 16 * 1024;
const MAX_MODEL_DIFF_BYTES = 64 * 1024;

/** 预期的正文操作失败发生在写入之前；执行层仍负责未知写入结局。 */
export class TextError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
  outcome(): CallResult<never> { return { kind: "rejected", error: { code: this.code, message: this.message } }; }
}
export function readText(text: string, anchored: boolean, range: { offset?: number; limit?: number; maxBytes?: number } = {}): TextRead {
  const lines = splitLines(text);
  const fromLine = range.offset ?? 1;
  if (fromLine > Math.max(1, lines.length)) throw new TextError("line_out_of_range", `offset ${fromLine} exceeds the text's ${lines.length} lines.`);
  const rows: TextRead["rows"] = [];
  const end = Math.min(lines.length, fromLine - 1 + (range.limit ?? lines.length));
  let bytes = 0;
  for (let i = fromLine - 1; i < end; i++) {
    // 超长行返回带完整行锚点的片段，字节预算按片段计算，单行不再占满或阻断整次读取。
    const row = textRow(i + 1, lines[i], anchored, READ_EXCERPT_THRESHOLD);
    const cost = Buffer.byteLength(`${rowText(row)}\n`);
    if (range.maxBytes !== undefined && bytes + cost > range.maxBytes) {
      if (rows.length === 0) throw new TextError("line_too_large", "The selected line exceeds the text read output limit.");
      break;
    }
    rows.push(row); bytes += cost;
  }
  const next = fromLine + rows.length;
  return { totalLines: lines.length, fromLine, rows, noFinalNewline: !hasFinalNewline(text), nextOffset: next <= lines.length ? next : null };
}
export function readToModel(data: TextRead, offsetField = "target.offset"): string {
  return [
    `${data.totalLines} lines · from line ${data.fromLine}${data.noFinalNewline ? " · no trailing newline" : ""}`,
    ...data.rows.map(rowText),
    ...data.rows.flatMap(row => excerptNote(row) ?? []),
    ...(data.nextOffset === null ? [] : [`Remaining content starts at ${offsetField}:${data.nextOffset}.`]),
  ].join("\n");
}

function failureMessage(failure: ApplyFailure): string {
  if (failure.kind !== "anchor") return failure.message;
  return ["Anchor mismatch; original content preserved.", ...failure.failures.map(f => {
    const prefix = `edits[${f.opIndex}].${f.which} (${f.cited.line}#${f.cited.hash})`;
    if (f.recovery.kind === "found") return `${prefix}: matching nearby line: {\"line\":${f.recovery.newLine},\"hash\":\"${f.recovery.newHash}\"}.`;
    if (f.recovery.kind === "ambiguous") return `${prefix}: several nearby lines match: ${JSON.stringify(f.recovery.candidates)}.`;
    if (!f.current) return `${prefix}: line is out of range.`;
    const current = { ...textRow(f.cited.line, f.current.content, false, READ_EXCERPT_THRESHOLD), hash: f.current.hash };
    return `${prefix}: current line is ${rowText(current)}.${current.excerpt ? ` ${excerptNote(current, "The current line")}` : ""}`;
  })].join("\n");
}
export function editText(text: string, edits: Edit[]): { text: string; touchedLines: readonly number[] } {
  const applied = applyEdits(text, edits);
  if (!applied.ok) throw new TextError(applied.failure.kind === "anchor" ? "anchor_mismatch" : applied.failure.kind === "range" ? "invalid_edit_range" : "edit_no_change", failureMessage(applied.failure));
  return applied;
}
/** 在写入之前生成实际 diff；算法超出预算时拒绝操作，不返回虚构差异。 */
export function textChange(before: string, after: string, label: string, touched: readonly number[] = []): TextChange {
  label = label.replace(/[\r\n\t]/g, " ");
  const patch = structuredPatch(label, label, before, after, "", "", { context: 3, timeout: 1000, maxEditLength: 10000 });
  if (!patch) throw new TextError("diff_limit", "The content change exceeded the diff computation budget; original content preserved.");
  let added = 0, removed = 0;
  for (const hunk of patch.hunks) for (const line of hunk.lines) {
    if (line.startsWith("+")) added++;
    if (line.startsWith("-")) removed++;
  }
  const lines = splitLines(after);
  const indices = [...new Set(touched)].sort((a, b) => a - b);
  const anchors: TextChange["anchors"] = [];
  let anchorBytes = 0;
  for (const i of indices) {
    const row = textRow(i + 1, lines[i], true, READ_EXCERPT_THRESHOLD);
    const cost = Buffer.byteLength(`${rowText(row)}\n`);
    if (anchors.length === MAX_ANCHOR_LINES || anchorBytes + cost > MAX_ANCHOR_BYTES) break;
    anchors.push(row); anchorBytes += cost;
  }
  return {
    changed: before !== after, diff: before === after ? "" : formatPatch(patch), added, removed,
    anchors, anchorsTruncated: anchors.length < indices.length,
  };
}
function changeSummary(data: TextChange): string {
  return data.changed ? `Content saved (+${data.added} -${data.removed}).` : "Content was already identical; no change was needed.";
}
export function writeToModel(data: TextChange): string {
  return changeSummary(data);
}
/** 统一 diff 中超长行从行首截取，按 hunk 头推算行号，在 diff 之后逐条陈述截取范围。 */
function boundedDiff(diff: string): { lines: string[]; notes: string[]; truncated: boolean } {
  const lines: string[] = [], notes: string[] = [];
  let bytes = 0, oldLine = 0, newLine = 0, inHunk = false;
  for (const raw of diff.split("\n")) {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    // 首个 hunk 之前只有 ---／+++ 文件头；之后以 -- 开头的删除行仍是正文。
    const clipped = hunk || !inHunk ? null : clipDiffLine(raw);
    const text = clipped?.text ?? raw;
    const cost = Buffer.byteLength(text) + 1;
    if (bytes + cost > MAX_MODEL_DIFF_BYTES) return { lines, notes, truncated: true };
    lines.push(text); bytes += cost;
    if (hunk) { oldLine = Number(hunk[1]); newLine = Number(hunk[2]); inHunk = true; continue; }
    if (!inHunk) continue;
    const kind = raw[0];
    if (clipped) {
      const label = kind === "-" ? `Removed line ${oldLine}` : kind === "+" ? `Added line ${newLine}` : `Context line ${newLine}`;
      notes.push(`${label} is shown as its first ${clipped.text.length - 1} of ${clipped.length} characters.`);
    }
    if (kind === " " || kind === "-") oldLine++;
    if (kind === " " || kind === "+") newLine++;
  }
  return { lines, notes, truncated: false };
}
export function editToModel(data: TextChange): string {
  // 历史保留完整 diff；模型收到有界 diff 与可继续编辑的新锚点。
  const diff = boundedDiff(data.diff);
  return [
    changeSummary(data),
    diff.lines.join("\n"),
    ...diff.notes,
    ...(diff.truncated ? ["Diff output was truncated; the full diff is saved in the tool result."] : []),
    ...(data.anchors.length ? ["Updated anchors:", ...data.anchors.map(rowText), ...data.anchors.flatMap(row => excerptNote(row) ?? [])] : []),
    ...(data.anchorsTruncated ? ["Some updated anchors were omitted."] : []),
  ].filter(Boolean).join("\n");
}
