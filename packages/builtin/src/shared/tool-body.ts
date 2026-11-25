import { formatPatch, parsePatch } from "diff";

import { splitLines } from "./hashline/lines.ts";
import { displayLine } from "./text-row.ts";

/** Logical-line budget for built-in plugin text bodies; does not constrain the tool shell, raw details, or model output. */
export const TOOL_BODY_LINE_LIMIT = 120;

export function textBodyPreview(text: string) {
  const lines = splitLines(text);
  return {
    rows: lines.slice(0, TOOL_BODY_LINE_LIMIT).map((content, index) => ({ line: index + 1, content: displayLine(content) })),
    omitted: Math.max(0, lines.length - TOOL_BODY_LINE_LIMIT),
  };
}

/**
 * Passes every hunk to the diff control, which folds unchanged regions itself and preserves each hunk's absolute line numbers.
 * The body bounds the control's height instead of dropping hunks, so distant changes stay reachable.
 */
export function diffBodyPreview(diff: string): string | null {
  try {
    const patches = parsePatch(diff);
    if (patches.length !== 1 || !patches[0].hunks.length) return null;
    const patch = patches[0];
    for (const hunk of patch.hunks) {
      for (const line of hunk.lines) {
        const prefix = line[0];
        if (prefix === "\\") continue;
        if (prefix !== " " && prefix !== "+" && prefix !== "-") return null;
      }
    }
    // Display-only clipping bounds single long lines; it never removes rows.
    const hunks = patch.hunks.map(hunk => ({
      ...hunk,
      lines: hunk.lines.map(line => line[0] === "\\" ? line : `${line[0]}${displayLine(line.slice(1))}`),
    }));
    return formatPatch({ ...patch, hunks });
  } catch {
    return null;
  }
}
