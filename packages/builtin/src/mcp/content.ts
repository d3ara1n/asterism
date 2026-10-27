import type { Json, ModelInputPart } from "@asterism-app/sdk/contracts";
import type { McpCallData } from "./contract.ts";

function containsStructured(parts: ModelInputPart[], value: Json): boolean {
  return parts.some(part => {
    if (part.kind !== "text") return false;
    try { return JSON.stringify(JSON.parse(part.text)) === JSON.stringify(value); } catch { return false; }
  });
}
/** Keeps only one copy of structured output and its JSON text duplicate; shared by model projection and result views. */
export function extraStructured(data: McpCallData): { value: Json } | null {
  return data.structuredContent !== undefined && !containsStructured(data.parts, data.structuredContent) ? { value: data.structuredContent } : null;
}
/** Remote text is often serialized JSON; parseable objects and arrays are displayed with indentation, while other text is preserved. */
export function displayText(text: string): string {
  const trimmed = text.trim();
  if (!/^[[{]/u.test(trimmed)) return text;
  try { return JSON.stringify(JSON.parse(trimmed), null, 2); } catch { return text; }
}
