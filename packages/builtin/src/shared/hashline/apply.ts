// 移植自 @d3ara1n/pi-hashline-edit 的 MIT 核心；来源与许可见 README.md。
// 全批次校验后再应用；位移恢复只提供重试锚点，不自动改写目标。
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

function maxAffected(op: SpanOp): number {
  return op.lo === op.hi ? op.lo : op.hi - 1;
}

export function applyEdits(text: string, edits: Edit[], hashLen = 4, shiftRadius = DEFAULT_SHIFT_RADIUS): ApplyResult {
  const lines = splitLines(text);
  const ending = detectLineEnding(text);

  const ops: SpanOp[] = [];
  const anchorFailures: AnchorFailure[] = [];
  let rangeError: string | null = null;

  for (let i = 0; i < edits.length; i++) {
    const t = translateEdit(edits[i], i, lines, hashLen, shiftRadius);
    if (t.ok) {
      ops.push(t.op);
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
  for (let k = 1; k < sorted.length; k++) {
    if (sorted[k].lo <= maxAffected(sorted[k - 1])) {
      return {
        ok: false,
        failure: {
          kind: "range",
          message: `overlapping edits near line ${sorted[k].lo + 1}; issue one edit per range`,
        },
      };
    }
  }
  const separators = text.match(/\r?\n/g) ?? [];
  const separator = ending === "crlf" ? "\r\n" : "\n";
  let result = lines.map((content, i) => ({ content, separator: separators[i] ?? "" }));
  for (const op of [...sorted].sort((a, b) => b.lo - a.lo)) {
    const removed = result.slice(op.lo, op.hi);
    const inserted = op.newLines.map((content, i) => ({
      content,
      separator: i === op.newLines.length - 1 && removed.length > 0
        ? removed[removed.length - 1].separator
        : removed[i]?.separator || separator,
    }));
    result.splice(op.lo, op.hi - op.lo, ...inserted);
  }
  const finalNewline = hasFinalNewline(text);
  const newText = result.map(({ content, separator: current }, i) =>
    content + (i < result.length - 1 || finalNewline ? current || separator : ""),
  ).join("");
  if (newText === text) {
    return {
      ok: false,
      failure: {
        kind: "noop",
        message: "edit parsed and applied cleanly but produced no change; body is byte-identical — the bug is elsewhere, re-read first",
      },
    };
  }
  const touched: number[] = [];
  let delta = 0;
  for (const op of sorted) {
    const newLo = op.lo + delta;
    if (op.newLines.length > 0) {
      for (let i = 0; i < op.newLines.length; i++) touched.push(newLo + i);
    } else if (newLo < result.length) {
      touched.push(newLo);
    }
    delta += op.newLines.length - (op.hi - op.lo);
  }

  return { ok: true, text: newText, changed: true, touchedLines: touched };
}
