import type { TextEditorNavigation } from "../editor/navigation.ts";

/** A directory text reference moves the cursor to a line or selects an inclusive line range. */
export function parseLineFragment(fragment: string | undefined): TextEditorNavigation | undefined {
  const match = fragment?.match(/^(\d+)(?:-(\d+))?$/u);
  if (!match) return undefined;
  const startLine = Number(match[1]);
  if (!Number.isSafeInteger(startLine) || startLine < 1) return undefined;
  if (match[2] === undefined) return { startLine };
  const endLine = Number(match[2]);
  return Number.isSafeInteger(endLine) && endLine >= startLine ? { startLine, endLine } : undefined;
}
