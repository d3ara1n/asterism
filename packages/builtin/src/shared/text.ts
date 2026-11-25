import { Buffer } from "node:buffer";
import { structuredPatch, formatPatch, parsePatch, type StructuredPatchHunk } from "diff";
import { applyEdits } from "./hashline/apply.ts";
import { computeLineHash } from "./hashline/hash.ts";
import { hasFinalNewline, splitLines } from "./hashline/lines.ts";
import type { ApplyFailure, Edit } from "./hashline/types.ts";
import { excerptNote, READ_EXCERPT_THRESHOLD, rowText, textRow } from "./text-row.ts";
import type { TextRead, TextChange } from "@asterism-app/builtin-api/contracts";
import type { CallResult } from "@asterism-app/sdk/runtime";

const MAX_ANCHOR_LINES = 40;
const MAX_ANCHOR_CONTENT_BYTES = 8 * 1024;
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
  let reread = 0;
  const details = failure.failures.map(f => {
    const prefix = `edits[${f.opIndex}].${f.which} (${f.cited.line}#${f.cited.hash})`;
    if (f.recovery.kind === "found") {
      const { newLine, newHash } = f.recovery;
      return `${prefix}: one nearby match. Confirm the intended line before using ${JSON.stringify({ line: newLine, hash: newHash })}.`;
    }
    if (f.recovery.kind === "ambiguous") {
      return `${prefix}: ambiguous. Confirm the intended line before choosing a candidate: ${f.recovery.candidates.map(c => JSON.stringify(c)).join(" or ")}.`;
    }
    reread++;
    if (!f.current) return `${prefix}: line is out of range and no nearby line matches.`;
    let preview = "", limit = Math.min(remaining, MAX_RECOVERY_PREVIEW_PER_LINE);
    for (const character of f.current.content) {
      if (limit === 0) break;
      preview += character;
      limit--;
      remaining--;
    }
    return `${prefix}: no nearby match. Current line: ${f.cited.line}#${f.current.hash}│${preview}${preview.length < f.current.content.length ? "…" : ""}`;
  });
  return ["Anchor mismatch; no edits applied, original content preserved.", ...details,
    ...(reread ? ["Use an anchored read of the affected region for fields with no match."] : []),
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
/** Use new-side hunk rows for anchor content without persisting another copy of the edited text. */
function changedAnchorContent(data: TextChange): Map<number, string> {
  const contents = new Map<number, string>();
  if (!data.diff || !data.anchors.length) return contents;
  const hashes = new Map(data.anchors.map(({ line, hash }) => [line, hash]));
  for (const hunk of parsePatch(data.diff)[0].hunks) {
    let line = hunk.newStart;
    for (const row of hunk.lines) {
      if (row[0] !== " " && row[0] !== "+") continue;
      const hash = hashes.get(line);
      if (hash !== undefined) {
        const raw = row.slice(1);
        // Unified diff retains CR in CRLF rows. The hash distinguishes it from a literal trailing CR.
        const content = raw.endsWith("\r") && computeLineHash(line, raw.slice(0, -1)) === hash ? raw.slice(0, -1) : raw;
        if (computeLineHash(line, content) === hash) contents.set(line, content);
      }
      line++;
    }
  }
  return contents;
}

export function editToModel(data: TextChange): string {
  const contents = changedAnchorContent(data);
  let remaining = MAX_ANCHOR_CONTENT_BYTES;
  let contentOmitted = false;
  const rows = data.anchors.map(({ line, hash }) => {
    const anchor = `${line}#${hash}`;
    const content = contents.get(line);
    if (content !== undefined) {
      const cost = Buffer.byteLength(content) + 1;
      if (cost <= remaining) {
        remaining -= cost;
        return `${anchor}│${content}`;
      }
    }
    contentOmitted = true;
    return anchor;
  });
  return [
    writeToModel(data),
    ...(rows.length ? ["Updated anchors:", ...rows] : []),
    ...(contentOmitted || data.anchorsTruncated ? ["Some line content or anchors were omitted. An anchored read can return the omitted lines."] : []),
  ].join("\n");
}
