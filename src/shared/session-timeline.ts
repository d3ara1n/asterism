import type { SessionNode } from "./session.ts";
import type { UiText } from "@atelier/sdk/contracts";

export class SessionError extends Error {
  constructor(readonly code: string, message: string, readonly display?: UiText) {
    super(message);
  }
}

/** 从逻辑根到任意末端的只读时间线；末端不必是会话树的叶子，null 表示空时间线。 */
export function sessionTimeline(nodes: readonly SessionNode[], at: string | null): SessionNode[] {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const path: SessionNode[] = [];
  for (let cursor = at; cursor !== null;) {
    const node = byId.get(cursor);
    if (!node) throw new SessionError("not_found", "Session node not found.");
    if (path.length >= byId.size) throw new SessionError("conflict", "Session tree contains a cycle.");
    path.push(node);
    cursor = node.parentId;
  }
  return path.reverse();
}
