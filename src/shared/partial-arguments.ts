import { Allow, parse } from "partial-json";
import type { Json } from "@asterism-app/sdk/contracts";

/** Tolerantly parse streaming tool arguments for display and call identity only; null for empty or unparseable text. Reject NaN/Infinity as non-JSON. */
export function previewArguments(text: string): Json {
  if (!text.trim()) return null;
  try { return (parse(text, Allow.ALL & ~Allow.SPECIAL) ?? null) as Json; }
  catch { return null; }
}
