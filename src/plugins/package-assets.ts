import { realpathSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { PluginApiError } from "@asterism-app/sdk/runtime";
import { pathWithin } from "../storage/paths.ts";

/** Resolve assets against the contributing package, including compiled and symlink-installed packages. */
export function packageAsset(root: string, path: string): string {
  if (isAbsolute(path) || path.includes("\0")) throw new PluginApiError("invalid_argument", "Assets use package-relative paths.");
  const base = realpathSync(root), candidate = resolve(base, path);
  if (pathWithin(base, candidate) === null) throw new PluginApiError("invalid_argument", "The asset path is outside the package.");
  const actual = realpathSync(candidate);
  if (pathWithin(base, actual) === null) throw new PluginApiError("invalid_argument", "The asset symbolic link is outside the package.");
  return actual;
}
