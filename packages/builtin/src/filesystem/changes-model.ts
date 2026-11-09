import type { z } from "zod";
import type { DirectoryStatus } from "./contract.ts";

export type ChangeEntry = NonNullable<z.infer<typeof DirectoryStatus.output>>["files"][number];

/** Compare siblings directory-first, keeping each subtree contiguous and its parent first. */
function comparePaths(left: string, right: string): number {
  const leftGroup = left.endsWith("/"), rightGroup = right.endsWith("/");
  const a = (leftGroup ? left.slice(0, -1) : left).split("/");
  const b = (rightGroup ? right.slice(0, -1) : right).split("/");
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const aDirectory = leftGroup || i < a.length - 1, bDirectory = rightGroup || i < b.length - 1;
    if (aDirectory !== bDirectory) return aDirectory ? -1 : 1;
    if (a[i] !== b[i]) return a[i]! < b[i]! ? -1 : 1;
  }
  return a.length - b.length;
}

/**
 * Build a virtual tree from Git changes alone. Only inferred groups end in '/';
 * a Git directory summary is a terminal leaf whose lookup retains the original path.
 */
export function buildChanges(changes: readonly ChangeEntry[]): { paths: string[]; entries: Map<string, ChangeEntry> } {
  const paths = new Set<string>();
  const entries = new Map<string, ChangeEntry>();
  for (const entry of changes) {
    const path = entry.path.endsWith("/") ? entry.path.slice(0, -1) : entry.path;
    paths.add(path);
    entries.set(path, entry);
    for (let slash = path.lastIndexOf("/"); slash >= 0; slash = path.lastIndexOf("/", slash - 1)) {
      const parent = path.slice(0, slash + 1);
      if (paths.has(parent)) break;
      paths.add(parent);
    }
  }
  return { paths: [...paths].sort(comparePaths), entries };
}

/** Git status has one entry per path; compare snapshots independently of their order. */
export function sameChanges(before: readonly ChangeEntry[], after: readonly ChangeEntry[]): boolean {
  if (before.length !== after.length) return false;
  const statuses = new Map(before.map(entry => [entry.path, entry.status]));
  return after.every(entry => statuses.get(entry.path) === entry.status);
}
