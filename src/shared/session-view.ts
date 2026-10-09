import type { SessionNode } from "./session.ts";
import { isBlockNode, sessionPath } from "./session-path.ts";
export { isBlockNode, sessionPath } from "./session-path.ts";

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
    if (n.kind !== "event" && mine(n)) out.push(n);
    for (const d of dangling.get(n.id) ?? []) if (mine(d)) out.push(d);
  }
  return out;
}
