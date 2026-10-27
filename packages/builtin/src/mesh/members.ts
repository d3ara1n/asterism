import { z } from "zod";
import type { ResourceRef } from "@asterism-app/sdk/contracts";
import type { MeshProfile } from "./contract.ts";

export const allocationSchema = z.array(z.strictObject({
  channelId: z.string(), title: z.string(), nextId: z.number().int().nonnegative(),
  members: z.array(z.strictObject({ key: z.string(), id: z.number().int().nonnegative() })),
}));
export type Allocations = z.infer<typeof allocationSchema>;
export interface Membership {
  channelId: string;
  mesh: ResourceRef;
  ref: ResourceRef;
  title: string;
  type: string;
  description: string;
}
export interface Member {
  channelId: string;
  ref: ResourceRef;
  meshes: ResourceRef[];
  profile: MeshProfile;
}
export const memberKey = (ref: ResourceRef) => JSON.stringify([ref.sessionId, ref.id]);

/** Preserve active addresses before allocating newcomers; duplicate Mesh routes never consume an ID. */
export function reconcileMembers(previous: Allocations, sources: readonly Membership[]): { allocations: Allocations; members: Member[] } {
  const groups = new Map<string, Membership[]>();
  for (const source of sources) {
    const key = JSON.stringify([source.channelId, source.title]);
    const group = groups.get(key) ?? [];
    group.push(source); groups.set(key, group);
  }
  const oldGroups = new Map(previous.map(group => [JSON.stringify([group.channelId, group.title]), group]));
  const allocations: Allocations = [], members: Member[] = [];
  for (const [key, sources] of groups) {
    const old = oldGroups.get(key);
    const first = sources[0]!;
    const group: Allocations[number] = { channelId: first.channelId, title: first.title, nextId: old?.nextId ?? 0, members: [] };
    const identities = new Map<string, Membership[]>();
    for (const source of sources) {
      const id = memberKey(source.ref), routes = identities.get(id) ?? [];
      routes.push(source); identities.set(id, routes);
    }
    for (const [identity, routes] of identities) {
      const id = old?.members.find(member => member.key === identity)?.id ?? group.nextId++;
      group.members.push({ key: identity, id });
      const source = routes[0]!;
      members.push({ channelId: first.channelId, ref: source.ref, meshes: routes.map(route => route.mesh), profile: {
        title: source.title, id, type: source.type,
        descriptions: [...new Set(routes.map(route => route.description).filter(Boolean))],
      } });
    }
    allocations.push(group);
  }
  return { allocations, members };
}
