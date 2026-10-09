import { readdir, readFile, stat } from "node:fs/promises";
import { implementResource } from "../../resources/contract.ts";
import { implement } from "../../tools/contract.ts";
import type { RuntimeModuleFactory } from "../runtime-contract.ts";
import { Directory, DirectoryView, DirectoryRead, DirectoryList } from "./contract.ts";
import { withinDirectory } from "./paths.ts";

const fail = (code: string, message: string) => ({ kind: "failed" as const, error: { code, message } });
const outside = () => ({ kind: "rejected" as const, error: { code: "outside_resource", message: "The path is outside this directory resource or does not exist." } });

export default (() => ({
  resources: [implementResource(Directory, DirectoryView, {
    project: state => ({ path: state.path }),
    async inspect(state, resource) {
      const info = await stat(state.path).catch(() => null);
      return { type: Directory.kind, title: resource.title, path: state.path, exists: !!info?.isDirectory() };
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
