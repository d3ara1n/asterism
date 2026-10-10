import { Buffer } from "node:buffer";
import { structuredPatch, formatPatch } from "diff";
import { applyEdits } from "./hashline/apply.ts";
import { computeLineHash } from "./hashline/hash.ts";
import { hasFinalNewline, splitLines } from "./hashline/lines.ts";
import type { ApplyFailure, Edit } from "./hashline/types.ts";
import type { TextRead, TextChange } from "./text-contract.ts";
import type { CallResult } from "./contract.ts";

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
  if (fromLine > Math.max(1, lines.length)) throw new TextError("line_out_of_range", `target.offset ${fromLine} exceeds the text's ${lines.length} lines. Use an offset within the text or read from line 1.`);
  const rows: TextRead["rows"] = [];
  const end = Math.min(lines.length, fromLine - 1 + (range.limit ?? lines.length));
  let bytes = 0;
  for (let i = fromLine - 1; i < end; i++) {
    const row = { line: i + 1, content: lines[i], hash: anchored ? computeLineHash(i + 1, lines[i]) : null };
    const cost = Buffer.byteLength(`${row.line}${row.hash ? `#${row.hash}` : ""}│${row.content}\n`);
    if (range.maxBytes !== undefined && bytes + cost > range.maxBytes) {
      if (rows.length === 0) throw new TextError("line_too_large", "The selected line exceeds the text read output limit. This tool returns complete lines only; ask the user to split the line or select other content.");
      break;
    }
    rows.push(row); bytes += cost;
  }
  const next = fromLine + rows.length;
  return { totalLines: lines.length, fromLine, rows, noFinalNewline: !hasFinalNewline(text), nextOffset: next <= lines.length ? next : null };
}
export function readToModel(data: TextRead): string {
  const rows = data.rows.map(row => `${row.line}${row.hash === null ? "" : `#${row.hash}`}│${row.content}`);
  return [
    `${data.totalLines} lines · from line ${data.fromLine}${data.noFinalNewline ? " · no trailing newline" : ""}`,
    ...rows,
    ...(data.nextOffset === null ? [] : [`More content remains; continue with target.offset:${data.nextOffset}.`]),
  ].join("\n");
}

function failureMessage(failure: ApplyFailure): string {
  if (failure.kind !== "anchor") return failure.message;
  return ["Anchor mismatch; no changes were written.", ...failure.failures.map(f => {
    const prefix = `edits[${f.opIndex}].${f.which} (${f.cited.line}#${f.cited.hash})`;
    if (f.recovery.kind === "found") return `${prefix}: content may have shifted; review and retry with {\"line\":${f.recovery.newLine},\"hash\":\"${f.recovery.newHash}\"}.`;
    if (f.recovery.kind === "ambiguous") return `${prefix}: several nearby lines match. Read the target to choose the intended line: ${JSON.stringify(f.recovery.candidates)}.`;
    return `${prefix}: ${f.current ? `current line is ${f.cited.line}#${f.current.hash}│${f.current.content}` : "line is out of range"}. Read the target again before retrying.`;
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
  if (!patch) throw new TextError("diff_limit", "The content change exceeded the diff computation budget; no content was written. Split the change into smaller edit batches.");
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
    const row = { line: i + 1, content: lines[i], hash: computeLineHash(i + 1, lines[i]) };
    const cost = Buffer.byteLength(`${row.line}#${row.hash}│${row.content}\n`);
    if (anchors.length === MAX_ANCHOR_LINES || anchorBytes + cost > MAX_ANCHOR_BYTES) break;
    anchors.push(row); anchorBytes += cost;
  }
  return {
    changed: before !== after, diff: before === after ? "" : formatPatch(patch), added, removed,
    anchors, anchorsTruncated: anchors.length < indices.length,
  };
}
export function changeToModel(data: TextChange): string {
  // 历史保留完整 diff，模型输出按完整行截断并明确提示。
  const diffLines: string[] = [];
  let bytes = 0;
  for (const line of data.diff.split("\n")) {
    const cost = Buffer.byteLength(line) + 1;
    if (bytes + cost > MAX_MODEL_DIFF_BYTES) break;
    diffLines.push(line); bytes += cost;
  }
  const diff = diffLines.join("\n");
  return [
    data.changed ? `Content saved (+${data.added} -${data.removed}).` : "Content was already identical; no change was needed.",
    diff,
    ...(diff !== data.diff ? ["Diff output was truncated; the full diff is saved in the tool result. Read the target to inspect its current content."] : []),
    ...(data.anchors.length ? ["Updated anchors (use for the next edit):", ...data.anchors.map(row => `${row.line}#${row.hash}│${row.content}`)] : []),
    ...(data.anchorsTruncated ? ["Some updated anchors were omitted; read the target for the remaining anchors."] : []),
  ].filter(Boolean).join("\n");
}
