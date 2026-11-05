import type { ModelBlock, ModelItem, ModelPart, ToolOutcome } from "@asterism-app/sdk/contracts";

/** Complete arguments can be paired with an unavailable result; unfinished JSON never becomes executable input. */
export function hasModelContent(block: ModelBlock): boolean {
  return block.kind === "toolcall" ? block.argumentsText === null : block.complete;
}

/** A normal reply contains every block of a stopped response and no tool calls; the terminal ordinal establishes the expected block count. */
export function isCompletedResponse(blocks: readonly ModelBlock[]): boolean {
  const terminal = blocks.find(block => block.completion);
  return terminal?.completion?.finishReason === "stop"
    && (!terminal.completion.termination || terminal.completion.termination.reason === "completed")
    && terminal.ordinal + 1 === blocks.length
    && blocks.every(block => block.ordinal < blocks.length && block.complete && block.kind !== "toolcall");
}

/** Shared by model input and history shells. Each response precedes its following user/context boundary. */
export function participatingBlocks(blocks: readonly ModelBlock[]): ModelBlock[] {
  const ordered = blocks.filter(hasModelContent).sort((a, b) => a.ordinal - b.ordinal);
  while (ordered.at(-1)?.kind === "thinking") ordered.pop();
  return ordered;
}

const missingResult = (kind: "cancelled" | "unknown", message: string): ToolOutcome =>
  ({ kind, message, data: null, model: [{ kind: "text", text: message }] });
/** Generation ended before the tool batch, so the call never ran. */
const notExecuted = missingResult("cancelled", "This tool call was not executed because the response did not complete.");
/** The call was handed to execution, but no result was recorded; its effects are unknown. */
const unrecorded = missingResult("unknown", "This tool call was submitted for execution, but its result was not recorded. Its effects are unknown.");

/** One response and its tool outcomes project together, independent of timeline or temporary conversation storage.
 * submitted lists call IDs handed to execution; other calls without an outcome never ran. */
export function responseMessages(blocks: readonly ModelBlock[], submitted: ReadonlySet<string> = new Set()): ModelItem[] {
  const ordered = participatingBlocks(blocks);
  const first = ordered[0];
  if (!first) return [];
  const parts: ModelPart[] = ordered.map(block => block.kind === "toolcall"
    ? { kind: "toolcall", callId: block.callId, name: block.name, arguments: block.arguments, continuation: block.continuation }
    : block.kind === "thinking"
      ? { kind: "thinking", text: block.text, summary: block.summary, continuation: block.continuation }
      : { kind: "text", text: block.text, continuation: block.continuation });
  const items: ModelItem[] = parts.length ? [{ kind: "output", scope: first.source.scope, adapter: first.source.adapter, parts }] : [];
  for (const block of ordered) if (block.kind === "toolcall")
    items.push({ kind: "result", callId: block.callId, name: block.name, outcome: block.outcome ?? (submitted.has(block.callId) ? unrecorded : notExecuted) });
  return items;
}
