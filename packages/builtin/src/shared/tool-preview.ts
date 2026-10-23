import type { Json } from "@atelier/sdk/contracts";

/** 预览字段尚未通过完整 schema；仅取形状已明确的内容，不补造必填值。 */
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

/** 编辑输入的可见片段同时用于正文渲染和预览阶段识别。 */
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
/** 限制进入 DOM 的文本量，完整原文仍由调用参数保留。 */
export function toolTextTail(text: string): string {
  let tail = text.slice(-12_000);
  if (/^[\uDC00-\uDFFF]/u.test(tail)) tail = tail.slice(1);
  return tail.split("\n").slice(-80).join("\n");
}
