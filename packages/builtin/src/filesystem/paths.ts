import { lstat, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep, join } from "node:path";
import { FilesystemError, failed, filesystemFailure, rejected } from "./errors.ts";

export function insideDirectory(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel === "" || (!isAbsolute(rel) && !rel.split(sep).includes(".."));
}
export const outsideDirectory = () => new FilesystemError(rejected("outside_resource", "target.path resolves outside this directory resource. Choose a path within the resource; for another directory, ask the user to link it and use its resource_id."));
export async function directoryRoot(root: string): Promise<string> {
  try {
    const base = await realpath(root);
    if (!(await stat(base)).isDirectory()) throw new FilesystemError(failed("resource_not_directory", "The resource root is no longer a directory. Ask the user to relink an existing directory."));
    return base;
  } catch (error) { throw new FilesystemError(filesystemFailure(error, "Resolve resource root", true)); }
}
function relativeTarget(base: string, rel: string): string {
  if (isAbsolute(rel)) throw new FilesystemError(rejected("absolute_path", "target.path must be relative to this directory resource. Pass a relative path; list accepts target:null for the root."));
  if (rel.includes("\0")) throw new FilesystemError(rejected("invalid_path", "target.path contains a NUL character. Remove it and use a valid relative path."));
  const candidate = resolve(base, rel);
  if (!insideDirectory(base, candidate)) throw outsideDirectory();
  return candidate;
}
/** 目录是文件系统引用；访问解析真实路径并限制在根目录内。 */
export async function withinDirectory(root: string, rel: string): Promise<string> {
  const base = await directoryRoot(root);
  const candidate = relativeTarget(base, rel);
  let target: string;
  try { target = await realpath(candidate); }
  catch (error) { throw new FilesystemError(filesystemFailure(error, "Resolve target.path")); }
  if (!insideDirectory(base, target)) throw outsideDirectory();
  return target;
}
/** 尚不存在的写入目标逐段解析；已有符号链接必须在根内，断链不能当成新文件。 */
export async function writableTarget(root: string, rel: string): Promise<{ root: string; path: string }> {
  const base = await directoryRoot(root);
  const candidate = relativeTarget(base, rel);
  const parts = relative(base, candidate).split(sep).filter(Boolean);
  let path = base;
  for (let i = 0; i < parts.length; i++) {
    path = join(path, parts[i]);
    try {
      const entry = await lstat(path);
      path = await realpath(path);
      if (!insideDirectory(base, path)) throw outsideDirectory();
      if (i < parts.length - 1 && !(entry.isDirectory() || (entry.isSymbolicLink() && (await stat(path)).isDirectory()))) {
        throw new FilesystemError(failed("not_directory", "A target.path parent is not a directory. Use list to check the parent and correct the path."));
      }
    } catch (error) {
      // 只有 lstat 确认不存在时才采用剩余路径；realpath 的 ENOENT 可能是断开的链接。
      if ((error as NodeJS.ErrnoException).code === "ENOENT" && !(await lstat(path).catch(() => null))) {
        return { root: base, path: join(path, ...parts.slice(i + 1)) };
      }
      throw error;
    }
  }
  return { root: base, path };
}
