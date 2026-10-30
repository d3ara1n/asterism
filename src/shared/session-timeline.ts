import type { SessionNode } from "./session.ts";
import type { UiText } from "@asterism-app/sdk/contracts";

export class SessionError extends Error {
  constructor(readonly code: string, message: string, readonly display?: UiText) {
    super(message);
  }
}

/** Read-only timeline from logical root to any endpoint, not necessarily a tree leaf; null denotes an empty timeline. */
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

/** Append new positions and replace completed operation bodies without moving or duplicating their original nodes. */
export function applySessionNodes(current: SessionNode[], appended: readonly SessionNode[], completed: readonly SessionNode[] = []): SessionNode[] {
  const nodes = appended.length ? [...current, ...appended] : current;
  if (!completed.length) return nodes;
  const replacements = new Map(completed.map(node => [node.id, node]));
  return nodes.map(node => replacements.get(node.id) ?? node);
}
