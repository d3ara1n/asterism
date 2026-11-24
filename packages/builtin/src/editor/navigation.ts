import type { Text } from "@codemirror/state";

/** A one-based cursor or inclusive line-range request for the current document. */
export interface TextEditorNavigation { readonly startLine: number; readonly endLine?: number }

export function resolveLineSelection(doc: Text, { startLine, endLine }: TextEditorNavigation): { anchor: number; head: number } | undefined {
  if (startLine > doc.lines || (endLine ?? startLine) > doc.lines) return undefined;
  const anchor = doc.line(startLine).from;
  return { anchor, head: endLine === undefined ? anchor : doc.line(endLine).to };
}
