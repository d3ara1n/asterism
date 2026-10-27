import { directoryCard } from "../shared/card-appearance.ts";
import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, isAbsolute, join } from "node:path";
import { defineModule, implementResource, implementCreation, implementTool, implementCall, PluginApiError, type CallResult } from "@asterism/sdk/runtime";
import { TextError, readToModel, editText, textChange, writeToModel, editToModel } from "../shared/text.ts";
import { Directory, CreateDirectory, ReadDirectoryDefaults, DirectoryView, DirectoryList, DirectoryRead, DirectoryEdit, DirectoryWrite, DirectorySee, DirectoryTree } from "./contract.ts";
import { readImageFile } from "./image-io.ts";
import { withinDirectory, writableTarget } from "./paths.ts";
import { failed, filesystemFailure } from "./errors.ts";
import { readTextFile, commitTextFile, validateTextSize } from "./text-io.ts";
import { DirectoryExec } from "./exec-contract.ts";
import { execToModel } from "../shell/contract.ts";
import type { ShellService } from "../shell/service.ts";
import { simpleGit } from "simple-git";
import { searchTools } from "./search.ts";
import { listFiles, readFileContent } from "./read.ts";

function textFailure(error: unknown, signal: AbortSignal, operation: string): CallResult<never> {
  if (signal.aborted) return { kind: "cancelled", message: `${operation} was cancelled before committing file content.` };
  return error instanceof TextError ? error.outcome() : filesystemFailure(error, operation);
}

/** Entry names excluded from the directory tree at every depth: `.git` (including submodule and worktree .git files) and macOS Finder metadata `.DS_Store`. */
const TREE_EXCLUDED = new Set([".git", ".DS_Store"]);

/** Recursively reads directory-tree paths; directory paths end in '/'. Maximum depth is 5. */
async function readTreePaths(rootPath: string, relPath: string, depth: number, signal: AbortSignal): Promise<string[]> {
  if (depth > 5) return [];
  signal.throwIfAborted();
  const absPath = relPath === "." ? rootPath : join(rootPath, ...relPath.split("/"));
  let entries: import("node:fs").Dirent[];
  try { entries = await readdir(absPath, { withFileTypes: true }); }
  catch { return []; }
  const paths: string[] = [];
  for (const entry of entries) {
    signal.throwIfAborted();
    if (TREE_EXCLUDED.has(entry.name)) continue;
    const rel = relPath === "." ? entry.name : `${relPath}/${entry.name}`;
    if (entry.isDirectory()) {
      paths.push(`${rel}/`);
      paths.push(...await readTreePaths(rootPath, rel, depth + 1, signal));
    } else paths.push(rel);
  }
  return paths;
}

/** Reads git status and maps it to the pierre trees GitStatusEntry format. Returns an empty result outside git repositories. */
async function readGitStatus(rootPath: string): Promise<{ entries: Array<{ path: string; status: string }>; hasGit: boolean }> {
  const git = simpleGit(rootPath);
  const hasGit = await git.checkIsRepo().catch(() => false);
  if (!hasGit) return { entries: [], hasGit: false };
  const status = await git.status();
  const entries: Array<{ path: string; status: string }> = [
    ...status.modified.map(path => ({ path, status: "modified" })),
    ...status.not_added.map(path => ({ path, status: "untracked" })),
    ...status.created.map(path => ({ path, status: "added" })),
    ...status.deleted.map(path => ({ path, status: "deleted" })),
    ...status.renamed.map(({ to }) => ({ path: to, status: "renamed" })),
  ];
  return { entries, hasGit: true };
}

export function createFilesystemModule(shell: ShellService) { return defineModule(() => ({
  resources: [implementResource(Directory, DirectoryView, {
    card: directoryCard,
    project: directory => ({ path: directory.path }),
    async inspect(directory, object) {
      const resource = object.snapshot();
      if (!resource) throw new PluginApiError("unavailable", "The directory is not available on this session path.");
      const base = { type: Directory.kind, title: resource.title, path: directory.path, shell: await shell.inspect() };
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
      call: (directory, target, _args, { signal }) => listFiles(directory.path, target, signal),
    }),
    implementTool(DirectoryRead, {
      call: (directory, target, args, { signal }) => readFileContent(directory.path, target, args, signal),
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
  calls: [
    implementCall(ReadDirectoryDefaults, async () => ({ path: homedir() })),
    implementCall(DirectoryTree, async (_input, { object, signal }) => {
      const snapshot = object.snapshot();
      if (!snapshot) throw new PluginApiError("unavailable", "The directory is not available on this session path.");
      const rootPath = Directory.stateSchema.parse(snapshot.data).path;
      signal.throwIfAborted();
      const [pathsResult, gitResult] = await Promise.allSettled([
        readTreePaths(rootPath, ".", 0, signal),
        readGitStatus(rootPath),
      ]);
      signal.throwIfAborted();
      return {
        paths: pathsResult.status === "fulfilled" ? pathsResult.value : [],
        gitStatus: gitResult.status === "fulfilled" ? gitResult.value.entries : [],
        hasGit: gitResult.status === "fulfilled" ? gitResult.value.hasGit : false,
      };
    }),
  ],
})); }
