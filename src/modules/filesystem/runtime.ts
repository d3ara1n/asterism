import { readdir, readFile, stat } from "node:fs/promises";
import { basename, isAbsolute } from "node:path";
import { z } from "zod";
import { SessionError } from "../../session/tree.ts";
import { implementResource } from "../../resources/contract.ts";
import { implement } from "../../tools/contract.ts";
import type { RuntimeModuleFactory } from "../runtime-contract.ts";
import { Directory, DirectoryView, DirectoryList } from "./contract.ts";
import { withinDirectory } from "./paths.ts";
import { failed, filesystemFailure } from "./errors.ts";

const directoryCreate = z.strictObject({ path: z.string().min(1).max(4096), title: z.string().trim().min(1).max(160).optional() });

export default (() => ({
  resources: [implementResource(Directory, DirectoryView, {
    project: state => ({ path: state.path }),
    async inspect(state, resource) {
      const base = { type: Directory.kind, title: resource.title, path: state.path };
      try {
        const info = await stat(state.path);
        return info.isDirectory() ? { ...base, exists: true }
          : { ...base, exists: false, error: failed("resource_not_directory", "The resource root is no longer a directory. Ask the user to relink an existing directory.").error };
      } catch (error) {
        const failure = filesystemFailure(error, "Inspect resource root", true);
        return { ...base, exists: failure.error.code === "resource_not_found" || failure.error.code === "resource_not_directory" ? false : null, error: failure.error };
      }
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
        try {
          const resolved = await withinDirectory(state.path, path);
          signal.throwIfAborted();
          const entries = await readdir(resolved, { withFileTypes: true });
          return { kind: "succeeded", data: { path, truncated: entries.length > 500,
            entries: entries.slice(0, 500).map(entry => ({
              name: entry.name, type: entry.isDirectory() ? "directory" : entry.isFile() ? "file" : "other",
            } as const)) } };
        } catch (error) {
          signal.throwIfAborted();
          return filesystemFailure(error, "List target directory");
        }
      },
    }),
  ],
})) satisfies RuntimeModuleFactory;
