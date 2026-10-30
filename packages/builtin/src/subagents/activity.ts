import type { Json, ModelLiveBlock } from "@asterism-app/sdk/contracts";
import type { ActivityEntry, ProcessBlock } from "./contract.ts";

/** Steering delivered when this many finalized blocks existed; it precedes the next request's output. */
export interface DeliveredSteer { at: number; text: string }

const previewLength = 120;
function oneLine(text: string): string {
  const flat = text.replace(/\s+/gu, " ").trim();
  return flat.length > previewLength ? `${flat.slice(0, previewLength)}…` : flat;
}
/** First readable string in tool arguments, without assuming any tool's schema. */
function preview(value: Json | undefined, depth = 0): string | null {
  if (typeof value === "string") return value.trim() ? oneLine(value) : null;
  if (Array.isArray(value)) {
    const strings = value.filter((item): item is string => typeof item === "string");
    return strings.length ? oneLine(strings.join(", ")) : null;
  }
  if (value === null || typeof value !== "object" || depth > 1) return null;
  for (const child of Object.values(value)) {
    const found = preview(child, depth + 1);
    if (found) return found;
  }
  return null;
}
/** Resource operations dispatch through resource_call; show the operation and its own arguments. */
function toolCall(name: string, args: Json): { name: string; subject: string | null } {
  if (name === "resource_call" && args && typeof args === "object" && !Array.isArray(args) && typeof args.tool === "string")
    return { name: args.tool, subject: preview(args.target ?? null) ?? preview(args.args) };
  return { name, subject: preview(args) };
}

/**
 * Compact process log: thinking and tool steps in response order, with delivered steering at its actual position.
 * Text output is the report and is not repeated here. Live blocks contribute steps that have not finalized.
 */
export function activityOf(blocks: readonly ProcessBlock[], live: readonly ModelLiveBlock[], steers: readonly DeliveredSteer[]): ActivityEntry[] {
  const entries: ActivityEntry[] = [];
  let steer = 0;
  const deliver = (count: number) => {
    while (steer < steers.length && steers[steer]!.at <= count) entries.push({ kind: "steer", text: steers[steer++]!.text });
  };
  // Blocks of one response finalize contiguously, but parallel tool calls finish out of ordinal order.
  const groups: ProcessBlock[][] = [];
  for (const block of blocks) {
    const group = groups.at(-1);
    if (group?.[0]!.responseId === block.responseId) group.push(block);
    else groups.push([block]);
  }
  let count = 0;
  const finalized = new Set<string>();
  for (const group of groups) {
    deliver(count);
    for (const block of [...group].sort((a, b) => a.ordinal - b.ordinal)) {
      finalized.add(`${block.responseId}:${block.ordinal}`);
      if (block.kind === "thinking") entries.push({ kind: "thinking", state: "done" });
      else if (block.kind === "toolcall") entries.push({ kind: "tool", ...toolCall(block.name, block.arguments),
        implementation: block.outcome?.implementation?.id ?? null, state: block.outcome?.kind ?? "cancelled" });
    }
    count += group.length;
  }
  deliver(count);
  for (const block of live) {
    if (finalized.has(`${block.responseId}:${block.ordinal}`)) continue;
    if (block.kind === "thinking") entries.push({ kind: "thinking", state: "running" });
    else if (block.kind === "toolcall") entries.push({ kind: "tool", ...toolCall(block.name, block.arguments),
      implementation: block.invocation?.implementation?.id ?? null, state: "running" });
  }
  deliver(Infinity);
  return entries;
}

/** One readable line per step; model projections and the GUI share it. */
export function activityLine(entry: ActivityEntry): string {
  if (entry.kind === "thinking") return entry.state === "running" ? "thinking (running)" : "thinking";
  if (entry.kind === "steer") return `steering: ${oneLine(entry.text)}`;
  return `${entry.name}${entry.subject ? ` ${entry.subject}` : ""} (${entry.state})`;
}
