export interface TreeEntry { name: string; directory: boolean }

/**
 * Tree paths follow the file-tree model's canonical form: root-relative, '/'-separated, directories end in '/'.
 * The root directory is the empty string.
 */
export function childPath(directory: string, entry: TreeEntry): string {
  return `${directory}${entry.name}${entry.directory ? "/" : ""}`;
}

/** The directory key containing `path`; root children return the empty string. */
export function parentOf(path: string): string {
  const trimmed = path.endsWith("/") ? path.slice(0, -1) : path;
  const slash = trimmed.lastIndexOf("/");
  return slash < 0 ? "" : trimmed.slice(0, slash + 1);
}

/** Every path reachable through loaded directories, parents before their descendants. */
export function loadedPaths(children: ReadonlyMap<string, readonly TreeEntry[]>): string[] {
  const paths: string[] = [];
  const visit = (directory: string) => {
    for (const entry of children.get(directory) ?? []) {
      const path = childPath(directory, entry);
      paths.push(path);
      if (entry.directory) visit(path);
    }
  };
  visit("");
  return paths;
}

/**
 * Case-insensitive substring filter over full paths. A matching path keeps its ancestors visible;
 * a matching directory therefore keeps every loaded descendant visible. An empty query keeps all paths.
 */
export function filterPaths(paths: readonly string[], query: string): string[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...paths];
  const visible = new Set<string>();
  for (const path of paths) {
    const bare = path.endsWith("/") ? path.slice(0, -1) : path;
    if (!bare.toLowerCase().includes(needle)) continue;
    visible.add(path);
    for (let slash = bare.indexOf("/"); slash >= 0; slash = bare.indexOf("/", slash + 1)) visible.add(bare.slice(0, slash + 1));
  }
  return paths.filter(path => visible.has(path));
}

export type TreeOperation = { type: "add"; path: string } | { type: "remove"; path: string; recursive: boolean };

/**
 * Operations that turn `previous` into `next`. Both lists keep parents before descendants.
 * A removed directory removes its subtree, so its removed descendants are not listed again.
 */
export function diffPaths(previous: readonly string[], next: readonly string[]): TreeOperation[] {
  const kept = new Set(next);
  const known = new Set(previous);
  const operations: TreeOperation[] = [];
  let removedRoot: string | null = null;
  for (const path of previous) {
    if (kept.has(path)) continue;
    if (removedRoot !== null && path.startsWith(removedRoot)) continue;
    const directory = path.endsWith("/");
    operations.push({ type: "remove", path, recursive: directory });
    removedRoot = directory ? path : null;
  }
  for (const path of next) if (!known.has(path)) operations.push({ type: "add", path });
  return operations;
}
