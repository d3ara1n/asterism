import type { ModelBlock, ModelGeneratedBlock, ModelItem, ModelPart, ToolOutcome } from "@asterism-app/sdk/contracts";
import type { AgentResponseBlock } from "@asterism-app/builtin-api/contracts";

/** Keep generated content through the last reusable body block. A complete tool input counts before it has an outcome. */
export function contextPhantoms(blocks: readonly ModelGeneratedBlock[]): ReadonlySet<number> {
  const end = blocks.findLastIndex(block => block.generated && block.kind !== "thinking");
  return new Set(blocks.flatMap((block, index) => !block.generated || index > end ? [index] : []));
}

/** A final reply has visible text, every block of a normally stopped response, and no tool calls. */
export function isFinalReply(blocks: readonly ModelBlock[]): boolean {
  const terminal = blocks.find(block => block.completion);
  return terminal?.completion?.finishReason === "stop"
    && (!terminal.completion.termination || terminal.completion.termination.reason === "completed")
    && terminal.ordinal + 1 === blocks.length
    && blocks.every(block => block.ordinal < blocks.length && block.complete && block.kind !== "toolcall")
    && blocks.some(block => block.kind === "text" && block.text.trim() !== "");
}

function participatingBlocks(blocks: readonly AgentResponseBlock[]): AgentResponseBlock[] {
  const ordered = blocks.filter(block => !block.phantom).sort((a, b) => a.ordinal - b.ordinal);
  // Rewinding into a response may hide the body that originally followed some thinking.
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
export function responseMessages(blocks: readonly AgentResponseBlock[], submitted: ReadonlySet<string> = new Set()): ModelItem[] {
  const ordered = participatingBlocks(blocks);
  const first = ordered[0];
  if (!first) return [];
  const parts: ModelPart[] = ordered.map(block => {
    const { continuation } = block;
    if (block.kind === "toolcall") {
      if (!block.input) throw new Error("A reusable tool call must have a complete input.");
      return { kind: "toolcall", callId: block.callId, name: block.name, input: block.input, continuation };
    }
    return block.kind === "thinking" ? { kind: "thinking", text: block.text, summary: block.summary, continuation }
      : { kind: "text", text: block.text, continuation };
  });
  const items: ModelItem[] = parts.length ? [{ kind: "output", scope: first.source.scope, adapter: first.source.adapter, parts }] : [];
  for (const block of ordered) if (block.kind === "toolcall")
    items.push({ kind: "result", callId: block.callId, name: block.name, outcome: block.outcome ?? (submitted.has(block.callId) ? unrecorded : notExecuted) });
  return items;
}
