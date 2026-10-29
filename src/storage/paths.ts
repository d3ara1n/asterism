import { isAbsolute, relative } from "node:path";

/** The path relative to root when it lies within root (the empty string for root itself); otherwise null. Segment-aware, so `..name` is inside. */
export function pathWithin(root: string, path: string): string | null {
  const rel = relative(root, path);
  return rel.split(/[\\/]/u)[0] === ".." || isAbsolute(rel) ? null : rel;
}
