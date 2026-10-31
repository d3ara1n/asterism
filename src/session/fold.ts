import type { SessionNode } from "../shared/session.ts";
import { ResourceCreated, ResourceRenamed, ResourceRemoved, ResourceAttached, ResourceDetached, type Json } from "@asterism-app/sdk/contracts";

/** The host reconstructs workbench state from these public record identities. */
export const workbenchRecordIds = [ResourceCreated, ResourceRenamed, ResourceRemoved, ResourceAttached, ResourceDetached].map(contract => contract.id);

/** Workbench objects result from folding event nodes along paths and appear or disappear with paths during backtracking. */
export interface FoldedObject { id: string; kind: string; title: string; data: Json }
export interface FoldedState { objects: FoldedObject[]; links: { receiverId: string; resourceId: string }[] }

export function foldWorkbench(path: readonly SessionNode[]): FoldedState {
  const objects = new Map<string, FoldedObject>();
  const links = new Map<string, { receiverId: string; resourceId: string }>();
  for (const node of path) {
    switch (node.contract) {
      case ResourceCreated.id: {
        const created = ResourceCreated.schema.parse(node.data);
        objects.set(created.id, { id: created.id, kind: created.type, title: created.title, data: created.data });
        break;
      }
      case ResourceRenamed.id: {
        const data = ResourceRenamed.schema.parse(node.data);
        const object = objects.get(data.id);
        if (object) object.title = data.title;
        break;
      }
      case ResourceRemoved.id: {
        const { id } = ResourceRemoved.schema.parse(node.data);
        objects.delete(id);
        for (const [key, link] of links) if (link.receiverId === id || link.resourceId === id) links.delete(key);
        break;
      }
      // Both link endpoints are resources; the payload stores the recipient and the host workbench is the origin.
      case ResourceAttached.id: {
        const { id, receiverId } = ResourceAttached.schema.parse(node.data);
        links.set(`${receiverId}:${id}`, { receiverId, resourceId: id });
        break;
      }
      case ResourceDetached.id: {
        const { id, receiverId } = ResourceDetached.schema.parse(node.data);
        links.delete(`${receiverId}:${id}`);
        break;
      }
    }
  }
  return { objects: [...objects.values()], links: [...links.values()] };
}
