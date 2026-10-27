import { posix, win32 } from "node:path";
import type { ManualSource } from "@asterism-app/builtin-api/runtime";
import { failed, FilesystemError, rejected } from "../filesystem/errors.ts";

export interface ManualScope { source: ManualSource; path: string }
export type ManualPath =
  | { kind: "directory"; path: string; entries: string[]; scopes: ManualScope[] }
  | { kind: "source"; path: string; scope: ManualScope };

/** Resolve virtual ancestors and source-local paths without consulting or merging physical directories. */
export function manualPath(sources: readonly ManualSource[], input: string): ManualPath {
  const normalized = input.replaceAll("\\", "/");
  const path = posix.normalize(normalized).replace(/\/$/u, "") || ".";
  if (posix.isAbsolute(normalized) || win32.isAbsolute(input) || input.includes("\0") || path === ".." || path.startsWith("../"))
    throw new FilesystemError(rejected("invalid_path", "Manual paths must be relative and remain within the manual."));
  const source = sources.find(source => path === source.path || path.startsWith(`${source.path}/`));
  if (source) return { kind: "source", path, scope: { source, path: posix.relative(source.path, path) || "." } };
  const prefix = path === "." ? "" : `${path}/`;
  const descendants = sources.filter(source => source.path.startsWith(prefix));
  if (!descendants.length && path !== ".") throw new FilesystemError(failed("path_not_found", "The manual path does not exist."));
  return { kind: "directory", path,
    entries: [...new Set(descendants.map(source => source.path.slice(prefix.length).split("/")[0]!))],
    scopes: descendants.map(source => ({ source, path: "." })),
  };
}
