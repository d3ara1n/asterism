import type { TextEditorNavigation } from "../editor/navigation.ts";

/** Collapse portable relative aliases before assigning an editor identity. Other paths keep their original spelling and validation. */
export function directoryFileLocation(path: string): string {
  if (path.startsWith("/") || /[:\\\0]/u.test(path)) return path;
  const parts = path.split("/");
  if (parts.includes("..")) return path;
  return parts.filter(part => part !== "" && part !== ".").join("/") || ".";
}

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
