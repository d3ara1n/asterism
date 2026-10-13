import type { SessionNode } from "../shared/session.ts";

/** 工作台对象：沿路径折叠 event 节点得到；回溯时随路径出现或消失。 */
export interface FoldedObject { id: string; kind: string; title: string; data: Record<string, unknown> }
export interface FoldedState { objects: FoldedObject[]; links: { agentId: string; resourceId: string }[] }

export function foldWorkbench(path: readonly SessionNode[]): FoldedState {
  const objects = new Map<string, FoldedObject>();
  const links = new Map<string, { agentId: string; resourceId: string }>();
  for (const node of path) {
    if (node.kind !== "event") continue;
    const d = (node.data ?? {}) as Record<string, unknown>;
    const id = String(d.id ?? "");
    switch (node.type) {
      // 代理与其他资源同为 resource_created；类型只由 data.type 区分。
      case "resource_created": {
        if (typeof d.type !== "string" || !d.type) throw new Error("Resource creation is missing its type.");
        objects.set(id, { id, kind: d.type, title: String(d.title ?? "Resource"), data: d });
        break;
      }
      case "object_removed": objects.delete(id); for (const [k, l] of links) if (l.agentId === id || l.resourceId === id) links.delete(k); break;
      // 链接事件的代理是关联对象，保存在载荷中；来源是宿主工作台。
      case "resource_attached": if (typeof d.agentId === "string") links.set(`${d.agentId}:${id}`, { agentId: d.agentId, resourceId: id }); break;
      case "resource_detached": if (typeof d.agentId === "string") links.delete(`${d.agentId}:${id}`); break;
    }
  }
  return { objects: [...objects.values()], links: [...links.values()] };
}
