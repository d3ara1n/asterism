import type { FolderGroup } from "../features/folders/grouping";

/** Collapse key of the no-folder group; folder groups use their identity. */
export const noFolderGroup = "none";

export type SidebarListRow<T> =
  | { kind: "group"; key: string; groupKey: string; group: FolderGroup<T>; open: boolean }
  | { kind: "session"; key: string; session: T; nested: boolean }
  | { kind: "empty-group"; key: string };

/** Group headers and visible children are independent virtual items, even for very large folders. */
export function sidebarListRows<T extends { id: string }>(sessions: readonly T[], groups: readonly FolderGroup<T>[] | null, collapsed: ReadonlySet<string>): SidebarListRow<T>[] {
  if (groups === null) return sessions.map(session => ({ kind: "session", key: `session:${session.id}`, session, nested: false }));
  const rows: SidebarListRow<T>[] = [];
  for (const group of groups) {
    const groupKey = group.folder?.id ?? noFolderGroup;
    const open = !collapsed.has(groupKey);
    rows.push({ kind: "group", key: `group:${groupKey}`, groupKey, group, open });
    if (!open) continue;
    if (!group.items.length) rows.push({ kind: "empty-group", key: `empty:${groupKey}` });
    for (const session of group.items) rows.push({ kind: "session", key: `session:${session.id}`, session, nested: true });
  }
  return rows;
}
