import { readdir, readFile, stat } from "node:fs/promises";
import { basename, isAbsolute } from "node:path";
import { defineModule, implementResource, implementCreation, implementTool, PluginApiError, type CallResult } from "@atelier/sdk/runtime";
import { TextError, readText, readToModel, editText, textChange, writeToModel, editToModel } from "../shared/text.ts";
import { Directory, CreateDirectory, DirectoryView, DirectoryList, DirectoryRead, DirectoryEdit, DirectoryWrite, DirectorySee } from "./contract.ts";
import { readImageFile } from "./image-io.ts";
import { withinDirectory, writableTarget } from "./paths.ts";
import { failed, filesystemFailure } from "./errors.ts";
import { readTextFile, commitTextFile, validateTextSize } from "./text-io.ts";

function textFailure(error: unknown, signal: AbortSignal, operation: string): CallResult<never> {
  if (signal.aborted) return { kind: "cancelled", message: `${operation} was cancelled before committing file content.` };
  return error instanceof TextError ? error.outcome() : filesystemFailure(error, operation);
}

export default defineModule(() => ({
  resources: [implementResource(Directory, DirectoryView, {
    project: directory => ({ path: directory.path }),
    async inspect(directory, object) {
      const resource = object.snapshot();
      if (!resource) throw new PluginApiError("unavailable", "The directory is not available on this session path.");
      const base = { type: Directory.kind, title: resource.title, path: directory.path };
      try {
        const info = await stat(directory.path);
        return info.isDirectory() ? { ...base, exists: true }
          : { ...base, exists: false, error: failed("resource_not_directory", "The resource root requires an existing directory.").error };
      } catch (error) {
        const failure = filesystemFailure(error, "Inspect resource root", true);
        return { ...base, exists: failure.error.code === "resource_not_found" || failure.error.code === "resource_not_directory" ? false : null, error: failure.error };
      }
    },
    creation: implementCreation(CreateDirectory, {
      /** 拖入与对话框共用；title 可选，不填用 basename。只接受存在的绝对目录路径。 */
      async prepare({ path }, { signal }) {
        signal.throwIfAborted();
        if (!isAbsolute(path)) throw new PluginApiError("invalid_argument", "Directory path must be absolute.");
        if (!(await stat(path).catch(() => null))?.isDirectory()) throw new PluginApiError("invalid_argument", "The path is not an existing directory.");
        signal.throwIfAborted();
        return { action: "accept" };
      },
      create({ path, title }) {
        return { title: title ?? (basename(path) || path), data: { path } };
      },
    }),
    async context(directory) {
      const file = await withinDirectory(directory.path, "AGENTS.md").catch(() => null);
      if (!file) return [];
      const text = await readFile(file, "utf8").catch(() => null);
      return text === null ? [] : [{ file, text: text.slice(0, 64 * 1024) }];
    },
  })],
  tools: [
    implementTool(DirectoryList, {
      async call(directory, target, _args, { signal }) {
        const path = target?.path ?? ".";
        try {
          const resolved = await withinDirectory(directory.path, path);
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
    implementTool(DirectoryRead, {
      async call(directory, target, args, { signal }) {
        try {
          const file = await readTextFile(await withinDirectory(directory.path, target.path), signal);
          const data = readText(file.text, args.anchored !== false, {
            offset: target.offset, limit: target.limit ?? 1000, maxBytes: 64 * 1024,
          });
          return { kind: "succeeded", data: { path: target.path, ...data } };
        } catch (error) { return textFailure(error, signal, "Read target file"); }
      },
      toModel: data => `${data.path}\n${readToModel(data)}`,
    }),
    implementTool(DirectoryEdit, {
      async call(directory, target, args, { signal }) {
        try {
          const selected = await writableTarget(directory.path, target.path);
          const before = await readTextFile(selected.path, signal);
          const edited = editText(before.text, args.edits);
          validateTextSize(edited.text);
          const data = { path: target.path, ...textChange(before.text, edited.text, target.path, edited.touchedLines) };
          await commitTextFile(selected.path, before, edited.text, signal);
          return { kind: "succeeded" as const, data };
        } catch (error) { return textFailure(error, signal, "Edit target file"); }
      },
      toModel: data => `${data.path}\n${editToModel(data)}`,
    }),
    implementTool(DirectoryWrite, {
      async call(directory, target, args, { signal }) {
        try {
          signal.throwIfAborted();
          validateTextSize(args.content);
          const selected = await writableTarget(directory.path, target.path);
          let before: Awaited<ReturnType<typeof readTextFile>> | null = null;
          try { before = await readTextFile(selected.path, signal); }
          catch (error) {
            const outcome = filesystemFailure(error, "Read existing target");
            if (outcome.error.code !== "path_not_found") throw error;
          }
          const change = textChange(before?.text ?? "", args.content, target.path);
          const data = { path: target.path, created: before === null, ...change, changed: before === null || change.changed };
          if (before === null || data.changed) await commitTextFile(selected.path, before, args.content, signal);
          return { kind: "succeeded" as const, data };
        } catch (error) { return textFailure(error, signal, "Write target file"); }
      },
      toModel: data => `${data.path}${data.created ? " (created)" : ""}: ${writeToModel(data)}`,
    }),
    implementTool(DirectorySee, {
      async call(directory, target, _args, { object, signal }) {
        try {
          const image = await readImageFile(directory.path, target.path, signal);
          const ref = await object.content.stage(image.bytes);
          return { kind: "succeeded", data: { path: target.path, mediaType: image.mediaType, size: image.bytes.length, image: ref } };
        } catch (error) { return textFailure(error, signal, "View target image"); }
      },
      toModel: data => [{ kind: "text", text: `${data.path} (${data.mediaType}, ${data.size} bytes)` },
        { kind: "file", file: data.image, mediaType: data.mediaType, filename: basename(data.path) }],
    }),
  ],
}));
