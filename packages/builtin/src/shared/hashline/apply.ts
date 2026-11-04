// Ported from the MIT core of @d3ara1n/pi-hashline-edit; see README.md for source and license.
// Validate the entire batch before applying; shift recovery only supplies anchors for retry and does not automatically rewrite the target.
import { computeLineHash } from "./hash.ts";
import { detectLineEnding, hasFinalNewline, splitLines } from "./lines.ts";
import type { Anchor, AnchorFailure, AnchorRecovery, ApplyResult, Edit } from "./types.ts";

interface SpanOp {
  lo: number;
  hi: number;
  newLines: string[];
}

const DEFAULT_SHIFT_RADIUS = 15;

function verifyAnchor(
  lines: readonly string[],
  cited: Anchor,
  which: "anchor" | "end",
  opIndex: number,
  op: Edit["op"],
  hashLen: number,
  radius: number,
): AnchorFailure | null {
  const { line, hash } = cited;
  if (line >= 1 && line <= lines.length && computeLineHash(line, lines[line - 1], hashLen) === hash) {
    return null;
  }
  const candidates: { line: number; hash: string }[] = [];
  const lo = Math.max(1, line - radius);
  const hi = Math.min(lines.length, line + radius);
  for (let c = lo; c <= hi; c++) {
    if (c === line) continue;
    if (computeLineHash(line, lines[c - 1], hashLen) === hash) {
      candidates.push({ line: c, hash: computeLineHash(c, lines[c - 1], hashLen) });
    }
  }

  let recovery: AnchorRecovery;
  if (candidates.length === 1) {
    recovery = { kind: "found", newLine: candidates[0].line, newHash: candidates[0].hash };
  } else if (candidates.length > 1) {
    recovery = { kind: "ambiguous", candidates };
  } else {
    recovery = { kind: "none" };
  }

  const current =
    line >= 1 && line <= lines.length
      ? { hash: computeLineHash(line, lines[line - 1], hashLen), content: lines[line - 1] }
      : null;

  return { opIndex, which, op, cited, recovery, current };
}

type TranslateResult =
  | { readonly ok: true; readonly op: SpanOp }
  | { readonly ok: false; readonly anchorFailures: AnchorFailure[] }
  | { readonly ok: false; readonly rangeError: string };

function translateEdit(
  edit: Edit,
  opIndex: number,
  lines: readonly string[],
  hashLen: number,
  radius: number,
): TranslateResult {
  switch (edit.op) {
    case "replace":
    case "delete": {
      const failures: AnchorFailure[] = [];
      const startF = verifyAnchor(lines, edit.anchor, "anchor", opIndex, edit.op, hashLen, radius);
      if (startF) failures.push(startF);
      let endLine = edit.anchor.line;
      if (edit.end) {
        const endF = verifyAnchor(lines, edit.end, "end", opIndex, edit.op, hashLen, radius);
        if (endF) failures.push(endF);
        endLine = edit.end.line;
      }
      if (failures.length > 0) return { ok: false, anchorFailures: failures };
      if (endLine < edit.anchor.line) {
        return { ok: false, rangeError: `range ${edit.anchor.line}..${endLine} ends before it starts` };
      }
      return {
        ok: true,
        op: {
          lo: edit.anchor.line - 1,
          hi: endLine,
          newLines: edit.op === "delete" ? [] : edit.body,
        },
      };
    }
    case "insert_after": {
      const f = verifyAnchor(lines, edit.anchor, "anchor", opIndex, edit.op, hashLen, radius);
      if (f) return { ok: false, anchorFailures: [f] };
      return { ok: true, op: { lo: edit.anchor.line, hi: edit.anchor.line, newLines: edit.body } };
    }
    case "insert_before": {
      const f = verifyAnchor(lines, edit.anchor, "anchor", opIndex, edit.op, hashLen, radius);
      if (f) return { ok: false, anchorFailures: [f] };
      return { ok: true, op: { lo: edit.anchor.line - 1, hi: edit.anchor.line - 1, newLines: edit.body } };
    }
    case "append": {
      return { ok: true, op: { lo: lines.length, hi: lines.length, newLines: edit.body } };
    }
    case "prepend": {
      return { ok: true, op: { lo: 0, hi: 0, newLines: edit.body } };
    }
  }
}

export function applyEdits(text: string, edits: Edit[], hashLen = 4, shiftRadius = DEFAULT_SHIFT_RADIUS): ApplyResult {
  const lines = splitLines(text);
  const ending = detectLineEnding(text);

  const ops: (SpanOp & { index: number })[] = [];
  const anchorFailures: AnchorFailure[] = [];
  let rangeError: string | null = null;

  for (let i = 0; i < edits.length; i++) {
    const t = translateEdit(edits[i], i, lines, hashLen, shiftRadius);
    if (t.ok) {
      ops.push({ ...t.op, index: i });
    } else if ("anchorFailures" in t) {
      anchorFailures.push(...t.anchorFailures);
    } else if (rangeError === null) {
      rangeError = t.rangeError;
    }
  }
  if (anchorFailures.length > 0) {
    return { ok: false, failure: { kind: "anchor", failures: anchorFailures } };
  }
  if (rangeError !== null) {
    return { ok: false, failure: { kind: "range", message: rangeError } };
  }
  const sorted = [...ops].sort((a, b) => a.lo - b.lo || a.hi - b.hi);
  // Insertions precede a range at its starting gap; stable sorting preserves array order at a shared gap.
  let previousRange: (typeof ops)[number] | undefined;
  for (const op of sorted) {
    if (previousRange && op.lo < previousRange.hi) {
      return {
        ok: false,
        failure: {
          kind: "range",
          message: `overlapping edits[${previousRange.index}] and edits[${op.index}] near line ${op.lo + 1}: ${
            op.lo === op.hi ? "insertion is inside a replaced or deleted range" : "ranges modify the same original lines"
          }.`,
        },
      };
    }
    if (op.lo < op.hi) previousRange = op;
  }
  const separators = text.match(/\r?\n/g) ?? [];
  const separator = ending === "crlf" ? "\r\n" : "\n";
  const original = lines.map((content, i) => ({ content, separator: separators[i] ?? "" }));
  const result: typeof original = [];
  const touched: number[] = [];
  let cursor = 0;
  // Build from original coordinates so boundary insertions cannot become input to a later range edit.
  for (const op of sorted) {
    while (cursor < op.lo) result.push(original[cursor++]);
    const removed = original.slice(op.lo, op.hi);
    if (op.newLines.length === 0) touched.push(result.length);
    for (let i = 0; i < op.newLines.length; i++) {
      touched.push(result.length);
      result.push({
        content: op.newLines[i],
        separator: i === op.newLines.length - 1 && removed.length > 0
          ? removed[removed.length - 1].separator
          : removed[i]?.separator || separator,
      });
    }
    cursor = op.hi;
  }
  while (cursor < original.length) result.push(original[cursor++]);
  const finalNewline = hasFinalNewline(text);
  const newText = result.map(({ content, separator: current }, i) =>
    content + (i < result.length - 1 || finalNewline ? current || separator : ""),
  ).join("");
  if (newText === text) {
    return {
      ok: false,
      failure: {
        kind: "noop",
        message: "The edit batch produced no change; the resulting text is byte-identical to the current text.",
      },
    };
  }
  return { ok: true, text: newText, changed: true, touchedLines: [...new Set(touched)].filter(line => line < result.length) };
}
