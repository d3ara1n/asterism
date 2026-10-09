import type { LiveBlock, SessionNode } from "./session.ts";
import { isBlockNode, sessionPath } from "./session-path.ts";
export { isBlockNode, sessionPath } from "./session-path.ts";

export type TimelineItem = SessionNode | LiveBlock;
/** 展示身份贯穿内存和持久化阶段；历史节点 ID 仅用于路径与选择。 */
export function timelineKey(item: TimelineItem): string {
  return "responseId" in item ? JSON.stringify([item.responseId, item.ordinal]) : item.id;
}
export function conversationTimeline(nodes: readonly SessionNode[], at: string | null, agentId: string, live: readonly LiveBlock[]): TimelineItem[] {
  const saved = agentTimeline(nodes, at, agentId);
  const keys = new Set(saved.map(timelineKey));
  return [...saved, ...live.filter(block => block.agentId === agentId && !keys.has(timelineKey(block)))];
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
    if (n.kind !== "event" && mine(n)) out.push(n);
    for (const d of dangling.get(n.id) ?? []) if (mine(d)) out.push(d);
  }
  return out;
}
