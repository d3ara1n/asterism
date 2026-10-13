import type { SessionNode } from "./session.ts";
import type { UiText } from "@atelier/sdk/contracts";

export class SessionError extends Error {
  constructor(readonly code: string, message: string, readonly display?: UiText) {
    super(message);
  }
}

export function selectable(node: SessionNode): boolean {
  return node.position;
}

/** 根到 at 的祖先路径；运行时与渲染进程共享校验和遍历规则。 */
export function sessionPath(nodes: readonly SessionNode[], at: string | null): SessionNode[] {
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
