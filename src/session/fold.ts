import type { SessionNode } from "../shared/session.ts";

/** 工作台对象：沿路径折叠 event 节点得到；回溯时随路径出现或消失。 */
export interface FoldedObject { id: string; kind: "agent" | "note" | "directory"; title: string; data: Record<string, unknown> }
export interface FoldedState { objects: FoldedObject[]; links: { agentId: string; resourceId: string }[] }

export function foldWorkbench(path: readonly SessionNode[]): FoldedState {
  const objects = new Map<string, FoldedObject>();
  const links = new Map<string, { agentId: string; resourceId: string }>();
  for (const node of path) {
    if (node.kind !== "event") continue;
    const d = (node.data ?? {}) as Record<string, unknown>;
    const id = String(d.id ?? d.resourceId ?? "");
    switch (node.type) {
      case "agent_created": objects.set(id, { id, kind: "agent", title: String(d.title ?? "Agent"), data: d }); break;
      case "resource_created": objects.set(id, { id, kind: d.type === "directory" ? "directory" : "note", title: String(d.title ?? "Resource"), data: d }); break;
      case "object_removed": objects.delete(id); for (const [k, l] of links) if (l.agentId === id || l.resourceId === id) links.delete(k); break;
      case "resource_attached": if (node.agentId) links.set(`${node.agentId}:${id}`, { agentId: node.agentId, resourceId: id }); break;
      case "resource_detached": if (node.agentId) links.delete(`${node.agentId}:${id}`); break;
    }
  }
  return { objects: [...objects.values()], links: [...links.values()] };
}

/** 执行层授权：当前路径上对该代理有效的链接。 */
export function linkedResources(path: readonly SessionNode[], agentId: string): Set<string> {
  return new Set(foldWorkbench(path).links.filter(l => l.agentId === agentId).map(l => l.resourceId));
}
