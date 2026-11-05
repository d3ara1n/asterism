import type { WorkbenchSnapshot } from "../../../../shared/workbench";

/** Partition object ids into undirected connected components using union-find.
 *  Link direction (resourceId → receiverId) carries no layout meaning; only adjacency matters. */
export function connectedComponents(ids: readonly string[], links: WorkbenchSnapshot["links"]): string[][] {
  const parent = new Map<string, string>(ids.map(id => [id, id]));
  const rank = new Map<string, number>(ids.map(id => [id, 0]));
  const set = new Set(ids);

  function find(x: string): string {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    // path compression
    let cur = x;
    while (cur !== root) { const next = parent.get(cur)!; parent.set(cur, root); cur = next; }
    return root;
  }

  function union(a: string, b: string) {
    const ra = find(a), rb = find(b);
    if (ra === rb) return;
    const da = rank.get(ra)!, db = rank.get(rb)!;
    if (da < db) { parent.set(ra, rb); }
    else if (da > db) { parent.set(rb, ra); }
    else { parent.set(rb, ra); rank.set(ra, da + 1); }
  }

  for (const link of links) {
    if (set.has(link.resourceId) && set.has(link.receiverId)) union(link.resourceId, link.receiverId);
  }

  const groups = new Map<string, string[]>();
  for (const id of ids) {
    const root = find(id);
    const group = groups.get(root);
    if (group) group.push(id);
    else groups.set(root, [id]);
  }
  return [...groups.values()];
}
