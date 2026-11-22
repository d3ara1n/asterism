import { Buffer } from "node:buffer";
import { structuredPatch, formatPatch, type StructuredPatchHunk } from "diff";
import { applyEdits } from "./hashline/apply.ts";
import { computeLineHash } from "./hashline/hash.ts";
import { hasFinalNewline, splitLines } from "./hashline/lines.ts";
import type { ApplyFailure, Edit } from "./hashline/types.ts";
import { excerptNote, READ_EXCERPT_THRESHOLD, rowText, textRow } from "./text-row.ts";
import type { TextRead, TextChange } from "@asterism-app/builtin-api/contracts";
import type { CallResult } from "@asterism-app/sdk/runtime";

const MAX_ANCHOR_LINES = 40;
const MAX_RECOVERY_PREVIEW_PER_LINE = 80;
const MAX_RECOVERY_PREVIEW_CHARS = 320;

/** Expected text-operation failures occur before writing; the execution layer still owns unknown write outcomes. */
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
    // Very long lines return excerpts with full-line anchors, with bytes budgeted by excerpt so a single line no longer consumes or blocks the entire read.
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
  let remaining = MAX_RECOVERY_PREVIEW_CHARS;
  let shortened = false;
  const details = failure.failures.map(f => {
    const prefix = `edits[${f.opIndex}].${f.which} (${f.cited.line}#${f.cited.hash})`;
    if (f.recovery.kind === "found") return `${prefix}: matching nearby line: ${f.recovery.newLine}#${f.recovery.newHash}`;
    if (f.recovery.kind === "ambiguous") return `${prefix}: several nearby lines match: ${f.recovery.candidates.map(c => `${c.line}#${c.hash}`).join(", ")}`;
    if (!f.current) return `${prefix}: line is out of range.`;
    let preview = "", limit = Math.min(remaining, MAX_RECOVERY_PREVIEW_PER_LINE);
    for (const character of f.current.content) {
      if (limit === 0) break;
      preview += character;
      limit--;
      remaining--;
    }
    const excerpt = preview.length < f.current.content.length;
    shortened ||= excerpt;
    return `${prefix}: current line: ${f.cited.line}#${f.current.hash}│${preview}${excerpt ? "…" : ""}`;
  });
  return ["Anchor mismatch; original content preserved.", ...details,
    ...(shortened ? ["An anchored read can inspect the current lines shown as excerpts (…)."] : []),
  ].join("\n");
}
export function editText(text: string, edits: Edit[]): { text: string; touchedLines: readonly number[] } {
  const applied = applyEdits(text, edits);
  if (!applied.ok) throw new TextError(applied.failure.kind === "anchor" ? "anchor_mismatch" : applied.failure.kind === "range" ? "invalid_edit_range" : "edit_no_change", failureMessage(applied.failure));
  return applied;
}
/** Added lines and the surviving line at each deletion gap, without unchanged spans between separate changes. */
function diffTouchedLines(hunks: readonly StructuredPatchHunk[], lineCount: number): number[] {
  const touched: number[] = [];
  for (const hunk of hunks) {
    let line = Math.max(0, hunk.newStart - 1), deletion = false;
    for (const row of hunk.lines) {
      if (row.startsWith("-")) deletion = true;
      else if (row.startsWith("+")) {
        touched.push(line++);
        deletion = false;
      } else if (row.startsWith(" ")) {
        if (deletion) touched.push(line);
        line++;
        deletion = false;
      }
    }
    if (deletion && line < lineCount) touched.push(line);
  }
  return touched;
}

/** Generates the actual diff before writing; rejects the operation if the algorithm exceeds its budget rather than returning a fabricated diff. */
export function textChange(before: string, after: string, label: string, touched: readonly number[] | "diff" = []): TextChange {
  label = label.replace(/[\r\n\t]/g, " ");
  const patch = structuredPatch(label, label, before, after, "", "", { context: 3, timeout: 1000, maxEditLength: 10000 });
  if (!patch) throw new TextError("diff_limit", "The content change exceeded the diff computation budget; original content preserved.");
  let added = 0, removed = 0;
  for (const hunk of patch.hunks) for (const line of hunk.lines) {
    if (line.startsWith("+")) added++;
    if (line.startsWith("-")) removed++;
  }
  const lines = splitLines(after);
  const indices = [...new Set(touched === "diff" ? diffTouchedLines(patch.hunks, lines.length) : touched)].sort((a, b) => a - b);
  const anchors = indices.slice(0, MAX_ANCHOR_LINES).map(i => ({ line: i + 1, hash: computeLineHash(i + 1, lines[i]) }));
  return {
    changed: before !== after, diff: before === after ? "" : formatPatch(patch), added, removed,
    anchors, anchorsTruncated: anchors.length < indices.length,
  };
}
export function writeToModel(data: TextChange): string {
  return data.changed ? `Content saved (+${data.added} -${data.removed}).` : "Content was already identical; no change was needed.";
}
export function editToModel(data: TextChange): string {
  return [
    writeToModel(data),
    ...(data.anchors.length ? ["Updated anchors:", ...data.anchors.map(({ line, hash }) => `${line}#${hash}`)] : []),
    ...(data.anchorsTruncated ? ["Some updated anchors were omitted."] : []),
  ].join("\n");
}
