import { realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

/** 目录是文件系统引用；访问解析真实路径并限制在根目录内。 */
export async function withinDirectory(root: string, rel: string): Promise<string | null> {
  if (isAbsolute(rel)) return null;
  const base = await realpath(root);
  const target = await realpath(resolve(base, rel)).catch(() => null);
  if (target === null) return null;
  const path = relative(base, target);
  return path === "" || (!isAbsolute(path) && !path.split(sep).includes("..")) ? target : null;
}
