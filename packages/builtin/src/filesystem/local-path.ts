import { homedir } from "node:os";
import { isAbsolute, join, normalize, sep } from "node:path";
import { FilesystemError, rejected } from "./errors.ts";

/** Local paths have no resource root or implicit working directory; only the current user's home shorthand expands. */
export function resolveLocalPath(path: string): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/") || (sep === "\\" && path.startsWith("~\\"))) return join(homedir(), path.slice(2));
  if (!isAbsolute(path)) throw new FilesystemError(rejected("absolute_path", "Path must be absolute or start with ~/ for the current user's home directory."));
  return normalize(path);
}
