import { Allow, parse } from "partial-json";
import type { Json } from "@asterism-app/sdk/contracts";
import type { LiveBlock } from "./session.ts";

/** Tolerantly parse streaming tool arguments for display and call identity only; null for empty or unparseable text. Reject NaN/Infinity as non-JSON. */
export function previewArguments(text: string): Json {
  if (!text.trim()) return null;
  try { return (parse(text, Allow.ALL & ~Allow.SPECIAL) ?? null) as Json; }
  catch { return null; }
}

/** Wire shape: tool calls during input transmit argumentsText only; receivers derive arguments. */
export function wireLive(block: LiveBlock): LiveBlock {
  return block.kind === "toolcall" && block.state === "input" && block.arguments !== null ? { ...block, arguments: null } : block;
}

const derived = new WeakMap<LiveBlock, LiveBlock>();
/** Receivers restore preview arguments during input; reuse results for identical wire block objects and preserve unchanged block identity. */
export function viewLive(block: LiveBlock): LiveBlock {
  if (block.kind !== "toolcall" || block.state !== "input") return block;
  let view = derived.get(block);
  if (!view) { view = { ...block, arguments: previewArguments(block.argumentsText) }; derived.set(block, view); }
  return view;
}
