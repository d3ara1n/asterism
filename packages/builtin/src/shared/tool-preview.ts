import type { Json } from "@asterism-app/sdk/contracts";

/** Preview fields have not passed the complete schema; uses only content with a known shape and does not fabricate required values. */
export function inputField(value: Json, key: string): Json | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.hasOwn(value, key) ? value[key] : undefined;
}
export function inputText(value: Json, key: string): string | undefined {
  const field = inputField(value, key);
  return typeof field === "string" ? field : undefined;
}
export function characterCount(text: string): number {
  let count = 0;
  for (const _character of text) count++;
  return count;
}
/** Combines a search scope with a quoted pattern inside the summary; the resource subject is rendered separately. */
export function searchHeaderSummary(scope: string | undefined, pattern: string | undefined): string {
  return [scope, pattern !== undefined && `"${pattern}"`].filter(Boolean).join(" ");
}

/** One requested edit as the arguments express it; fields that are absent or of another shape stay absent. */
export interface EditIntent {
  index: number;
  op: string;
  anchor: { line: number; hash: string } | null;
  end: { line: number; hash: string } | null;
  body: readonly string[];
}
export function editIntents(args: Json): EditIntent[] {
  const edits = inputField(args, "edits");
  if (!Array.isArray(edits)) return [];
  const anchorOf = (value: Json | undefined) => {
    const line = value === undefined ? undefined : inputField(value, "line");
    const hash = value === undefined ? undefined : inputText(value, "hash");
    return typeof line === "number" && hash !== undefined ? { line, hash } : null;
  };
  return edits.flatMap((edit, index) => {
    const op = inputText(edit, "op");
    if (op === undefined) return [];
    const body = inputField(edit, "body");
    return [{
      index: index + 1, op, anchor: anchorOf(inputField(edit, "anchor")), end: anchorOf(inputField(edit, "end")),
      body: Array.isArray(body) ? body.filter((row): row is string => typeof row === "string") : [],
    }];
  });
}

/** Visible excerpts of edit input serve both body rendering and preview-stage detection. */
export function editPreviewText(args: Json): string {
  const intents = editIntents(args).slice(-8);
  return intents.map(intent => [`${intent.index} ${intent.op}${intent.anchor ? ` L${intent.anchor.line}` : ""}`,
    ...intent.body.slice(-80).map(toolTextTail)].join("\n")).join("\n\n");
}
/** Limits text entering the DOM; call arguments still retain the complete original text. */
export function toolTextTail(text: string): string {
  let tail = text.slice(-12_000);
  if (/^[\uDC00-\uDFFF]/u.test(tail)) tail = tail.slice(1);
  return tail.split("\n").slice(-80).join("\n");
}
