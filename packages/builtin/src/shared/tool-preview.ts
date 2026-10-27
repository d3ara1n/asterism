import type { Json } from "@asterism/sdk/contracts";

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

/** Visible excerpts of edit input serve both body rendering and preview-stage detection. */
export function editPreviewText(args: Json): string {
  const edits = inputField(args, "edits");
  return Array.isArray(edits) ? edits.slice(-8).map(edit => {
    const body = inputField(edit, "body");
    const anchor = inputField(edit, "anchor");
    const line = anchor === undefined ? undefined : inputField(anchor, "line");
    return [inputText(edit, "op"), typeof line === "number" ? `L${line}` : null,
      Array.isArray(body) ? body.slice(-80).filter((row): row is string => typeof row === "string").map(toolTextTail).join("\n") : null]
      .filter(value => value !== null && value !== undefined).join("\n");
  }).join("\n\n") : "";
}
/** Limits text entering the DOM; call arguments still retain the complete original text. */
export function toolTextTail(text: string): string {
  let tail = text.slice(-12_000);
  if (/^[\uDC00-\uDFFF]/u.test(tail)) tail = tail.slice(1);
  return tail.split("\n").slice(-80).join("\n");
}
