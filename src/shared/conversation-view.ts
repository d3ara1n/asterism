import type { ConversationNode } from "./conversation.ts";

/** 只检查可续接形状；执行授权仍由 runtime 判断。 */
export function canContinue(node: ConversationNode): boolean {
  return node.kind !== "model" || node.state === "complete" && node.parts.every(part =>
    part.complete && (part.kind !== "tool" || part.execution === "settled" && part.outcome !== null && part.outcome.kind !== "unknown"));
}
export function conversationPath(nodes: readonly ConversationNode[], cursor: string | null): ConversationNode[] {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const path: ConversationNode[] = [];
  const seen = new Set<string>();
  while (cursor !== null) {
    const node = byId.get(cursor);
    if (!node || seen.has(cursor)) throw new Error("Invalid conversation path.");
    seen.add(cursor); path.push(node); cursor = node.parentId;
  }
  return path.reverse();
}
export function completeAncestor(nodes: readonly ConversationNode[], cursor: string | null): string | null {
  let complete: string | null = null;
  for (const node of conversationPath(nodes, cursor)) {
    if (!canContinue(node)) break;
    complete = node.id;
  }
  return complete;
}
