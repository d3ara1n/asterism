import type { ModelBlock, ModelItem, ModelPart } from "@asterism-app/sdk/contracts";

/** One response and its tool outcomes project together, independent of timeline or temporary conversation storage. */
export function responseMessages(blocks: readonly ModelBlock[]): ModelItem[] {
  const ordered = blocks.filter(block => block.complete).sort((a, b) => a.ordinal - b.ordinal);
  const first = ordered[0];
  if (!first) return [];
  const parts: ModelPart[] = ordered.map(block => block.kind === "toolcall"
    ? { kind: "toolcall", callId: block.callId, name: block.name, arguments: block.arguments, continuation: block.continuation }
    : block.kind === "thinking"
      ? { kind: "thinking", text: block.text, summary: block.summary, continuation: block.continuation }
      : { kind: "text", text: block.text, continuation: block.continuation });
  while (parts.at(-1)?.kind === "thinking") parts.pop();
  const items: ModelItem[] = parts.length ? [{ kind: "output", scope: first.source.scope, adapter: first.source.adapter, parts }] : [];
  for (const block of ordered) if (block.kind === "toolcall" && block.outcome)
    items.push({ kind: "result", callId: block.callId, name: block.name, outcome: block.outcome });
  return items;
}
