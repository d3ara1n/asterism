import type { Json, ModelInputPart } from "@atelier/sdk/contracts";
import type { McpCallData } from "./contract.ts";

function containsStructured(parts: ModelInputPart[], value: Json): boolean {
  return parts.some(part => {
    if (part.kind !== "text") return false;
    try { return JSON.stringify(JSON.parse(part.text)) === JSON.stringify(value); } catch { return false; }
  });
}
/** 结构化输出与文字中的 JSON 副本只保留一份；模型投影与结果视图共用。 */
export function extraStructured(data: McpCallData): { value: Json } | null {
  return data.structuredContent !== undefined && !containsStructured(data.parts, data.structuredContent) ? { value: data.structuredContent } : null;
}
/** 远端文字常是 JSON 序列化结果；可解析的对象与数组按缩进展示，其余保持原文。 */
export function displayText(text: string): string {
  const trimmed = text.trim();
  if (!/^[[{]/u.test(trimmed)) return text;
  try { return JSON.stringify(JSON.parse(trimmed), null, 2); } catch { return text; }
}
