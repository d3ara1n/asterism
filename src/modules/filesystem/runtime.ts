import { readdir, readFile, stat } from "node:fs/promises";
import { basename, isAbsolute } from "node:path";
import { z } from "zod";
import { SessionError } from "../../session/tree.ts";
import { implementResource } from "../../resources/contract.ts";
import { implement } from "../../tools/contract.ts";
import type { RuntimeModuleFactory } from "../runtime-contract.ts";
import { Directory, DirectoryView, DirectoryRead, DirectoryList } from "./contract.ts";
import { withinDirectory } from "./paths.ts";

const directoryCreate = z.strictObject({ path: z.string().min(1).max(4096), title: z.string().trim().min(1).max(160).optional() });
const fail = (code: string, message: string) => ({ kind: "failed" as const, error: { code, message } });
const outside = () => ({ kind: "rejected" as const, error: { code: "outside_resource", message: "The path is outside this directory resource or does not exist." } });

export default (() => ({
  resources: [implementResource(Directory, DirectoryView, {
    project: state => ({ path: state.path }),
    async inspect(state, resource) {
      const info = await stat(state.path).catch(() => null);
      return { type: Directory.kind, title: resource.title, path: state.path, exists: !!info?.isDirectory() };
    },
    controller: {
      /** 拖入与对话框共用；title 可选，不填用 basename。只接受存在的绝对目录路径。 */
      async prepareCreate(input) {
        const { path, title } = directoryCreate.parse(input);
        if (!isAbsolute(path)) throw new SessionError("invalid_request", "Directory path must be absolute.");
        if (!(await stat(path).catch(() => null))?.isDirectory()) throw new SessionError("invalid_request", "The path is not an existing directory.");
        return { path, ...(title ? { title } : {}) };
      },
      create(_sessionId, _objectId, input) {
        const { path, title } = directoryCreate.parse(input);
        return { title: title ?? (basename(path) || path), data: { path } };
      },
    },
    async context(state) {
      const file = await withinDirectory(state.path, "AGENTS.md").catch(() => null);
      if (!file) return [];
      const text = await readFile(file, "utf8").catch(() => null);
      return text === null ? [] : [{ file, text: text.slice(0, 64 * 1024) }];
    },
  })],
  tools: [
    implement(DirectoryList, {
      async call(state, target, _args, { signal }) {
        const path = target?.path ?? ".";
        const resolved = await withinDirectory(state.path, path);
        if (!resolved) return outside();
        signal.throwIfAborted();
        const entries = await readdir(resolved, { withFileTypes: true }).catch(() => null);
        if (!entries) return fail("not_directory", "The path is not a readable directory.");
        return { kind: "succeeded", data: { path, truncated: entries.length > 500,
          entries: entries.slice(0, 500).map(entry => ({
            name: entry.name, type: entry.isDirectory() ? "directory" : entry.isFile() ? "file" : "other",
          })) } };
      },
    }),
    implement(DirectoryRead, {
      async call(state, target, _args, { signal }) {
        const resolved = await withinDirectory(state.path, target.path);
        if (!resolved) return outside();
        signal.throwIfAborted();
        const info = await stat(resolved).catch(() => null);
        if (!info?.isFile()) return fail("not_file", "The path is not a readable file.");
        if (info.size > 256 * 1024) return fail("too_large", "The file exceeds the 256 KB read limit.");
        const text = await readFile(resolved, "utf8");
        return { kind: "succeeded", data: { path: target.path, text } };
      },
    }),
  ],
})) satisfies RuntimeModuleFactory;
