import { readdir, readFile, stat } from "node:fs/promises";
import { basename, isAbsolute } from "node:path";
import { z } from "zod";
import { SessionError } from "../../session/tree.ts";
import { implementResource } from "../../resources/contract.ts";
import { implement, type CallResult } from "../../tools/contract.ts";
import { TextError, readText, readToModel, editText, textChange, changeToModel } from "../../tools/text.ts";
import { defineModule } from "../../plugins/contract.ts";
import { Directory, DirectoryView, DirectoryList, DirectoryRead, DirectoryEdit, DirectoryWrite } from "./contract.ts";
import { withinDirectory, writableTarget } from "./paths.ts";
import { failed, filesystemFailure } from "./errors.ts";
import { readTextFile, withFileMutation, commitTextFile, validateTextSize, UnconfirmedWriteError } from "./text-io.ts";

const directoryCreate = z.strictObject({ path: z.string().min(1).max(4096), title: z.string().trim().min(1).max(160).optional() });
function textFailure(error: unknown, signal: AbortSignal, operation: string): CallResult<never> {
  if (error instanceof UnconfirmedWriteError) return { kind: "unknown", message: error.message };
  if (signal.aborted) return { kind: "cancelled", message: `${operation} was cancelled before committing file content.` };
  return error instanceof TextError ? error.outcome() : filesystemFailure(error, operation);
}

export default defineModule(() => ({
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
    implement(DirectoryRead, {
      async call(state, target, args, { signal }) {
        try {
          const file = await readTextFile(state.path, target.path, signal);
          const data = readText(file.text, args.anchored !== false, {
            offset: target.offset, limit: target.limit ?? 1000, maxBytes: 64 * 1024,
          });
          return { kind: "succeeded", data: { path: target.path, ...data } };
        } catch (error) { return textFailure(error, signal, "Read target file"); }
      },
      toModel: data => `${data.path}\n${readToModel(data)}`,
    }),
    implement(DirectoryEdit, {
      async call(state, target, args, { signal }) {
        try {
          const resolved = await withinDirectory(state.path, target.path);
          return await withFileMutation(resolved, async () => {
            const before = await readTextFile(state.path, target.path, signal);
            if (before.path !== resolved) throw new TextError("file_changed", "The target path changed while waiting for an earlier operation. Read it again before retrying.");
            const edited = editText(before.text, args.edits);
            validateTextSize(edited.text);
            const data = { path: target.path, ...textChange(before.text, edited.text, target.path, edited.touchedLines) };
            await commitTextFile(state.path, target.path, before, edited.text, signal);
            return { kind: "succeeded" as const, data };
          });
        } catch (error) { return textFailure(error, signal, "Edit target file"); }
      },
      toModel: data => `${data.path}\n${changeToModel(data)}`,
    }),
    implement(DirectoryWrite, {
      async call(state, target, args, { signal }) {
        try {
          signal.throwIfAborted();
          validateTextSize(args.content);
          const selected = await writableTarget(state.path, target.path);
          return await withFileMutation(selected.path, async () => {
            signal.throwIfAborted();
            let before: Awaited<ReturnType<typeof readTextFile>> | null = null;
            try { before = await readTextFile(state.path, target.path, signal); }
            catch (error) {
              const outcome = filesystemFailure(error, "Read existing target");
              if (outcome.error.code !== "path_not_found") throw error;
              // 断开的符号链接不会被当成不存在的目标覆盖。
              await writableTarget(state.path, target.path);
            }
            if ((await writableTarget(state.path, target.path)).path !== selected.path) throw new TextError("file_changed", "The target path changed while waiting for an earlier operation. Read it again before retrying.");
            const change = textChange(before?.text ?? "", args.content, target.path);
            const data = { path: target.path, created: before === null, ...change, changed: before === null || change.changed };
            if (before === null || data.changed) await commitTextFile(state.path, target.path, before, args.content, signal);
            return { kind: "succeeded" as const, data };
          });
        } catch (error) { return textFailure(error, signal, "Write target file"); }
      },
      toModel: data => `${data.path}${data.created ? " (created)" : ""}\n${changeToModel(data)}`,
    }),
  ],
}));
