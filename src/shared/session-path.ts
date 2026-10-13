import type { BlockNode, SessionNode } from "./session.ts";
import type { UiText } from "@atelier/sdk/contracts";

export class SessionError extends Error {
  constructor(readonly code: string, message: string, readonly display?: UiText) {
    super(message);
  }
}

export function isBlockNode(node: SessionNode): node is BlockNode {
  return node.kind === "thinking" || node.kind === "text" || node.kind === "toolcall";
}

export function selectable(node: SessionNode): boolean {
  return !isBlockNode(node) || node.complete;
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

/** 按模型投影顺序判断每个代理的末块；收束元数据不能使 thinking 成为合法续接点。 */
export function continuable(path: readonly SessionNode[]): boolean {
  const last = new Map<string, BlockNode>();
  for (const node of path) {
    if (!isBlockNode(node) || !node.complete) continue;
    const owner = node.source.resource?.id ?? "";
    const previous = last.get(owner);
    if (!previous || previous.responseId !== node.responseId || previous.ordinal < node.ordinal) {
      last.set(owner, node);
    }
  }
  return [...last.values()].every(node => node.kind !== "thinking");
}

export function snap(nodes: readonly SessionNode[], nodeId: string): string | null {
  const path = sessionPath(nodes, nodeId);
  if (!selectable(path.at(-1)!)) {
    throw new SessionError("invalid_request", "Incomplete blocks cannot be selected.");
  }
  while (path.length && !continuable(path)) path.pop();
  return path.at(-1)?.id ?? null;
}
