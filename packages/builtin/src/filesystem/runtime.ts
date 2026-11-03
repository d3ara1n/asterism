import { directoryCard } from "../shared/card-appearance.ts";
import { createReadStream } from "node:fs";
import { z } from "zod";
import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, isAbsolute, join } from "node:path";
import { defineModule, implementResource, implementCreation, implementTool, implementCall, PluginApiError, type CallResult, type ObjectReader } from "@asterism-app/sdk/runtime";
import { TextError, readToModel, editText, textChange, writeToModel, editToModel } from "../shared/text.ts";
import { Directory, CreateDirectory, ReadDirectoryDefaults, DirectoryView, DirectoryList, DirectoryRead, DirectoryEdit, DirectoryWrite, DirectorySave, DirectoryReplace, DirectorySee, DirectoryChildren, DirectoryStatus } from "./contract.ts";
import { saveFileContent } from "./save.ts";
import { replaceText, replaceToModel } from "../shared/replace.ts";
import { readImageFile } from "./image-io.ts";
import { withinDirectory, writableTarget } from "./paths.ts";
import { failed, filesystemFailure } from "./errors.ts";
import { readTextFile, commitTextFile, validateTextSize } from "./text-io.ts";
import { DirectoryExec } from "./exec-contract.ts";
import { execToModel } from "../shell/contract.ts";
import type { ShellExecution } from "@asterism-app/sdk/runtime";
import { searchTools } from "./search.ts";
import { listFiles, readFileContent, readChildren } from "./read.ts";
import { readDirectoryStatus } from "./git-status.ts";
import { fileFailure } from "./file-io.ts";
import { editorCalls } from "./editor-runtime.ts";

function textFailure(error: unknown, signal: AbortSignal, operation: string): CallResult<never> {
  if (signal.aborted) return { kind: "cancelled", message: `${operation} was cancelled before committing file content.` };
  return error instanceof TextError ? error.outcome() : filesystemFailure(error, operation);
}

function rootOf(object: ObjectReader): string {
  const snapshot = object.snapshot();
  if (!snapshot) throw new PluginApiError("unavailable", "The directory is not available on this session path.");
  return Directory.stateSchema.parse(snapshot.data).path;
}

export function createFilesystemModule(shell: ShellExecution) { return defineModule(plugin => ({
  resources: [implementResource(Directory, DirectoryView, {
    card: directoryCard,
    async *openFile(directory, locator, { signal }) {
      const parsed = z.strictObject({ path: z.string().min(1) }).safeParse(locator);
      if (!parsed.success) throw new PluginApiError("invalid_argument", "A directory file locator requires a relative path.");
      try {
        signal.throwIfAborted();
        const path = await withinDirectory(directory.path, parsed.data.path);
        yield* createReadStream(path, { signal });
      } catch (error) {
        signal.throwIfAborted();
        const failure = filesystemFailure(error, "Open referenced file");
        throw new PluginApiError(failure.kind === "rejected" ? "invalid_argument"
          : failure.error.code === "path_not_found" || failure.error.code === "resource_not_found" ? "not_found" : "unavailable",
        failure.error.message, failure.error.code);
      }
    },
    template: { current: [] },
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
      /** Shared by drag-and-drop and dialogs; title is optional and falls back to basename. Accepts only existing absolute directory paths. */
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
    ...searchTools,
    implementTool(DirectoryExec, {
      call: (directory, _target, args, context) => shell.execute(directory.path, args, context),
      toModel: execToModel,
    }),
    implementTool(DirectoryList, {
      async call(directory, target, _args, { signal, object }) {
        const result = await listFiles(directory.path, target, signal);
        if (result.kind !== "succeeded") return result;
        return { ...result, data: { ...result.data, entries: result.data.entries.map(entry => entry.type === "file"
          ? { ...entry, ref: { source: { ...object.ref }, locator: { path: join(result.data.path, entry.name) } } }
          : entry) } };
      },
    }),
    implementTool(DirectoryRead, {
      call: (directory, target, _args, { signal }) => readFileContent(directory.path, target, signal),
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
    implementTool(DirectoryReplace, {
      async call(directory, target, args, { signal }) {
        try {
          const selected = await writableTarget(directory.path, target.path);
          const before = await readTextFile(selected.path, signal);
          const replaced = replaceText(before.text, args);
          validateTextSize(replaced.text);
          const data = { path: target.path, matches: replaced.matches, ...textChange(before.text, replaced.text, target.path, "diff") };
          if (data.changed) await commitTextFile(selected.path, before, replaced.text, signal);
          return { kind: "succeeded" as const, data };
        } catch (error) { return textFailure(error, signal, "Replace target text"); }
      },
      toModel: data => `${data.path}\n${replaceToModel(data)}`,
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
    implementTool(DirectorySave, {
      async call(directory, target, { ref }, { object, signal }) {
        try {
          const selected = await writableTarget(directory.path, target.path);
          const size = await saveFileContent(selected.path, plugin.files.open(ref, { signal }), signal);
          return { kind: "succeeded", data: { path: target.path, size, ref: { source: { ...object.ref }, locator: { path: target.path } } } };
        } catch (error) { return textFailure(error, signal, "Save referenced file"); }
      },
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
  calls: [
    ...editorCalls,
    implementCall(ReadDirectoryDefaults, async () => ({ path: homedir() })),
    implementCall(DirectoryChildren, async ({ path }, { object, signal }) => {
      try { return await readChildren(rootOf(object), path, signal); }
      catch (error) { signal.throwIfAborted(); return fileFailure(error); }
    }),
    implementCall(DirectoryStatus, async (_input, { object, signal }) => readDirectoryStatus(rootOf(object), signal)),
  ],
})); }
