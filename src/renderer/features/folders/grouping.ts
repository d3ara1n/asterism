import { folderColors, type Folder, type FolderColor } from "../../../shared/folders";

export interface FolderGroup<T> {
  /** null is the no-folder group. */
  folder: Folder | null;
  items: T[];
}

/** Stable folder order: locale name order, then creation order for equal names. */
export function sortFolders(folders: readonly Folder[], locale: string): Folder[] {
  const collator = new Intl.Collator(locale, { sensitivity: "base", numeric: true });
  return [...folders].sort((a, b) => collator.compare(a.name, b.name) || a.createdAt.localeCompare(b.createdAt));
}

/**
 * The only interpretation of folder membership for navigation: named folders in stable order (empty folders included),
 * then the no-folder group when it has items. Item order within a group follows the input order.
 * A membership naming an absent folder falls into the no-folder group.
 */
export function groupByFolder<T>(folders: readonly Folder[], items: readonly T[], folderOf: (item: T) => string | null, locale: string): FolderGroup<T>[] {
  const groups = sortFolders(folders, locale).map(folder => ({ folder, items: [] as T[] }));
  const byId = new Map(groups.map(group => [group.folder.id, group]));
  const loose: T[] = [];
  for (const item of items) {
    const id = folderOf(item);
    const group = id === null ? undefined : byId.get(id);
    if (group) group.items.push(item); else loose.push(item);
  }
  return loose.length ? [...groups, { folder: null, items: loose }] : groups;
}

/** A new folder takes the least-used palette color, earliest in palette order on ties. */
export function nextFolderColor(folders: readonly Folder[]): FolderColor {
  const counts = new Map<FolderColor, number>(folderColors.map(color => [color, 0]));
  for (const folder of folders) counts.set(folder.color, (counts.get(folder.color) ?? 0) + 1);
  return folderColors.reduce((best, color) => counts.get(color)! < counts.get(best)! ? color : best, folderColors[0]);
}
