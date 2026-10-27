import type { SessionNode } from "../shared/session.ts";

/** Workbench objects result from folding event nodes along paths and appear or disappear with paths during backtracking. */
export interface FoldedObject { id: string; kind: string; title: string; data: Record<string, unknown> }
export interface FoldedState { objects: FoldedObject[]; links: { receiverId: string; resourceId: string }[] }

export function foldWorkbench(path: readonly SessionNode[]): FoldedState {
  const objects = new Map<string, FoldedObject>();
  const links = new Map<string, { receiverId: string; resourceId: string }>();
  for (const node of path) {
    const d = (node.data ?? {}) as Record<string, unknown>;
    const id = String(d.id ?? "");
    switch (node.contract) {
      // Agents and other resources both use resource_created; only data.type distinguishes types.
      case "resource_created": {
        if (typeof d.type !== "string" || !d.type) throw new Error("Resource creation is missing its type.");
        objects.set(id, { id, kind: d.type, title: String(d.title ?? "Resource"), data: d });
        break;
      }
      case "resource_renamed": {
        const object = objects.get(id);
        if (object) object.title = String(d.title);
        break;
      }
      case "object_removed": objects.delete(id); for (const [k, l] of links) if (l.receiverId === id || l.resourceId === id) links.delete(k); break;
      // Both link endpoints are resources; the payload stores the recipient and the host workbench is the origin.
      case "resource_attached": if (typeof d.receiverId === "string") links.set(`${d.receiverId}:${id}`, { receiverId: d.receiverId, resourceId: id }); break;
      case "resource_detached": if (typeof d.receiverId === "string") links.delete(`${d.receiverId}:${id}`); break;
    }
  }
  return { objects: [...objects.values()], links: [...links.values()] };
}
