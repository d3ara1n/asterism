import { readdir, readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { z } from "zod";
import { jsonSchema, type Json, type ToolOutcome } from "../shared/model.ts";
import type { FoldedObject } from "../session/fold.ts";
import type { ObjectStore } from "../runtime/storage.ts";

/** 资源类型声明的工具；同语义工具跨类型共享名称（如 read），由 resource_id 区分目标。 */
export interface ResourceTool {
  name: string; description: string; schema: z.ZodType<Json>; effect: "read" | "write";
  execute(resource: FoldedObject, args: Json, signal: AbortSignal): Promise<ToolOutcome>;
}
export interface ResourceType {
  kind: FoldedObject["kind"];
  tools: ResourceTool[];
  /** 实时状态：外部变化不通知模型，由 inspect 感知。 */
  inspect(resource: FoldedObject): Promise<Json>;
}

const fail = (code: string, message: string): ToolOutcome => ({ kind: "failed", error: { code, message } });
const schemaOf = (s: z.ZodType<Json>): Json => jsonSchema.parse(z.toJSONSchema(s));

export function noteType(objects: ObjectStore): ResourceType {
  const content = (r: FoldedObject) => typeof r.data.contentRef === "string" ? objects.get(r.data.contentRef) : null;
  return {
    kind: "note",
    async inspect(r) { const text = content(r); return { type: "note", title: r.title, available: text !== null, length: text?.length ?? null }; },
    tools: [{ name: "read", description: "Read the full note text.", schema: z.strictObject({}), effect: "read",
      async execute(r) {
        const text = content(r);
        return text === null ? fail("object_missing", "The note content is unavailable.") : { kind: "succeeded", model: { text }, data: { text } };
      } }],
  };
}

/** 目录是对文件系统的引用：路径由用户加入，所有访问解析真实路径并限制在根目录内。 */
async function within(root: string, rel: string): Promise<string | null> {
  if (isAbsolute(rel)) return null;
  const base = await realpath(root);
  const target = await realpath(resolve(base, rel)).catch(() => null);
  if (target === null) return null;
  const r = relative(base, target);
  return r === "" || (!r.startsWith("..") && !isAbsolute(r) && !r.split(sep).includes("..")) ? target : null;
}
const pathArgs = z.strictObject({ path: z.string().max(4096).default(".") });
export const directoryType: ResourceType = {
  kind: "directory",
  async inspect(r) {
    const path = String(r.data.path);
    const info = await stat(path).catch(() => null);
    return { type: "directory", title: r.title, path, exists: !!info?.isDirectory() };
  },
  tools: [
    { name: "list", description: "List entries of a directory relative to the resource root.", schema: pathArgs as z.ZodType<Json>, effect: "read",
      async execute(r, args, signal) {
        const { path } = pathArgs.parse(args);
        const target = await within(String(r.data.path), path);
        if (!target) return { kind: "rejected", error: { code: "outside_resource", message: "The path is outside this directory resource or does not exist." } };
        signal.throwIfAborted();
        const entries = await readdir(target, { withFileTypes: true }).catch(() => null);
        if (!entries) return fail("not_directory", "The path is not a readable directory.");
        const list = entries.slice(0, 500).map(e => ({ name: e.name, type: e.isDirectory() ? "directory" : e.isFile() ? "file" : "other" }));
        return { kind: "succeeded", model: { entries: list, truncated: entries.length > 500 }, data: { path, entries: list } };
      } },
    { name: "read", description: "Read a UTF-8 text file relative to the resource root (up to 256 KB).", schema: z.strictObject({ path: z.string().min(1).max(4096) }) as z.ZodType<Json>, effect: "read",
      async execute(r, args, signal) {
        const { path } = z.strictObject({ path: z.string() }).parse(args);
        const target = await within(String(r.data.path), path);
        if (!target) return { kind: "rejected", error: { code: "outside_resource", message: "The path is outside this directory resource or does not exist." } };
        signal.throwIfAborted();
        const info = await stat(target).catch(() => null);
        if (!info?.isFile()) return fail("not_file", "The path is not a readable file.");
        if (info.size > 256 * 1024) return fail("too_large", "The file exceeds the 256 KB read limit.");
        const text = await readFile(target, "utf8");
        return { kind: "succeeded", model: { path, text }, data: { path, text } };
      } },
  ],
};

/** 链接时附给模型的工具摘要，省去一次 inspect。 */
export function toolSummary(type: ResourceType): Json {
  return type.tools.map(t => ({ name: t.name, description: t.description, parameters: schemaOf(t.schema) }));
}
export { schemaOf };

/** 控制器读取代理已链接目录根下的 AGENTS.md；每次请求读取，不缓存，不经过模型。 */
export async function readContextFiles(directories: FoldedObject[]): Promise<{ file: string; text: string }[]> {
  const out: { file: string; text: string }[] = [];
  for (const d of directories) {
    const file = join(String(d.data.path), "AGENTS.md");
    const text = await readFile(file, "utf8").catch(() => null);
    if (text !== null) out.push({ file, text: text.slice(0, 64 * 1024) });
  }
  return out;
}
