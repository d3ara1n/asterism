import { realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { FilesystemError, failed, filesystemFailure, rejected } from "./errors.ts";

/** 目录是文件系统引用；访问解析真实路径并限制在根目录内。 */
export async function withinDirectory(root: string, rel: string): Promise<string> {
  if (isAbsolute(rel)) throw new FilesystemError(rejected("absolute_path", "target.path must be relative to this directory resource. Use resource_inspect to find the root, then pass a relative path. For list on the root, use target: null."));
  if (rel.includes("\0")) throw new FilesystemError(rejected("invalid_path", "target.path contains a NUL character. Remove it and use a valid relative path."));
  let base: string;
  try {
    base = await realpath(root);
    if (!(await stat(base)).isDirectory()) throw new FilesystemError(failed("resource_not_directory", "The resource root is no longer a directory. Ask the user to relink an existing directory."));
  } catch (error) {
    throw new FilesystemError(filesystemFailure(error, "Resolve resource root", true));
  }
  const inside = (path: string) => {
    const rel = relative(base, path);
    return rel === "" || (!isAbsolute(rel) && !rel.split(sep).includes(".."));
  };
  const outside = () => new FilesystemError(rejected("outside_resource", "target.path resolves outside this directory resource. Choose a path within the resource; for another directory, ask the user to link it and use its resource_id."));
  const candidate = resolve(base, rel);
  if (!inside(candidate)) throw outside();
  let target: string;
  try { target = await realpath(candidate); }
  catch (error) { throw new FilesystemError(filesystemFailure(error, "Resolve target.path")); }
  if (!inside(target)) throw outside();
  return target;
}
