import type { SessionNode } from "./session.ts";

/** 根到 at 的祖先路径；渲染进程与运行时共用同一定义。 */
export function sessionPath(nodes: readonly SessionNode[], at: string | null): SessionNode[] {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const out: SessionNode[] = [];
  for (let cursor = at; cursor !== null;) {
    const node = byId.get(cursor);
    if (!node || out.length > byId.size) throw new Error("Invalid session path.");
    out.push(node); cursor = node.parentId;
  }
  return out.reverse();
}
export function isBlockNode(node: SessionNode): node is Extract<SessionNode, { kind: "thinking" | "text" | "toolcall" }> {
  return node.kind === "thinking" || node.kind === "text" || node.kind === "toolcall";
}

/** 代理卡片的用户视图：沿路径取本代理的节点；不完整块挂在其父节点后显示，供查看与审计。 */
export function agentTimeline(nodes: readonly SessionNode[], at: string | null, agentId: string): SessionNode[] {
  const path = sessionPath(nodes, at);
  const onPath = new Set(path.map(n => n.id));
  const dangling = new Map<string, SessionNode[]>();
  for (const n of nodes) if (isBlockNode(n) && !n.complete && n.parentId && onPath.has(n.parentId)) {
    dangling.set(n.parentId, [...(dangling.get(n.parentId) ?? []), n]);
  }
  const mine = (n: SessionNode) => "agentId" in n && (n.agentId === agentId || (n.kind === "notice" && n.agentId === null));
  const out: SessionNode[] = [];
  for (const n of path) {
    if (n.kind !== "event" && n.kind !== "response_end" && mine(n)) out.push(n);
    for (const d of dangling.get(n.id) ?? []) if (mine(d)) out.push(d);
  }
  return out;
}
