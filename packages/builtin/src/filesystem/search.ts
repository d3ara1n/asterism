import { stat } from "node:fs/promises";
import type { z } from "zod";
import { basename, dirname, relative, sep } from "node:path";
import { implementTool, type CallResult } from "@asterism/sdk/runtime";
import { DirectoryFind, DirectoryGrep } from "./search-contract.ts";
import { directoryRoot, withinDirectory } from "./paths.ts";
import { filesystemFailure, FilesystemError, failed, rejected } from "./errors.ts";
import { findOutput, grepOutput } from "./search-output.ts";
import { findToModel, grepToModel } from "./search-presentation.ts";
import { runSearch, searchArguments } from "./search-process.ts";

export async function searchScope(rootPath: string, path: string, directoryOnly: boolean) {
  const root = await directoryRoot(rootPath);
  const selected = await withinDirectory(root, path);
  if (relative(root, selected).split(sep).includes(".git")) {
    throw new FilesystemError(rejected("excluded_search_target", "Git metadata is excluded from directory searches. Select a working-tree file or directory."));
  }
  const info = await stat(selected);
  if (directoryOnly ? !info.isDirectory() : !info.isDirectory() && !info.isFile()) {
    throw new FilesystemError(failed("invalid_search_target", directoryOnly
      ? "find requires a directory target." : "grep requires a regular file or directory target."));
  }
  const cwd = info.isDirectory() ? selected : dirname(selected);
  return { cwd, prefix: relative(root, cwd).split(sep).join("/"),
    operand: info.isDirectory() ? "." : `./${basename(selected)}` };
}
function failure(error: unknown, signal: AbortSignal): CallResult<never> {
  return signal.aborted ? { kind: "cancelled", message: "The directory search was cancelled." }
    : filesystemFailure(error, "Search directory");
}

export async function findFiles(root: string, target: z.infer<typeof DirectoryFind.targetSchema>,
  args: z.infer<typeof DirectoryFind.tool.argsSchema>, signal: AbortSignal): Promise<CallResult<z.infer<typeof DirectoryFind.schema>>> {
  const path = target?.path ?? ".";
  try {
    const selected = await searchScope(root, path, true);
    const output = findOutput(path, selected.prefix, args.limit ?? 500);
    output.result.stopReason = await runSearch(selected.cwd, searchArguments("find", args, selected.operand), output.records, signal);
    return { kind: "succeeded", data: output.result };
  } catch (error) { return failure(error, signal); }
}

export async function grepFiles(root: string, target: z.infer<typeof DirectoryGrep.targetSchema>,
  args: z.infer<typeof DirectoryGrep.tool.argsSchema>, signal: AbortSignal): Promise<CallResult<z.infer<typeof DirectoryGrep.schema>>> {
  const path = target?.path ?? ".";
  try {
    const selected = await searchScope(root, path, false);
    const output = grepOutput(path, selected.prefix, args);
    output.result.stopReason = await runSearch(selected.cwd, searchArguments("grep", args, selected.operand), output.records, signal);
    return { kind: "succeeded", data: output.result };
  } catch (error) { return failure(error, signal); }
}

export const searchTools = [
  implementTool(DirectoryFind, {
    call: (directory, target, args, { signal }) => findFiles(directory.path, target, args, signal),
    toModel: findToModel,
  }),
  implementTool(DirectoryGrep, {
    call: (directory, target, args, { signal }) => grepFiles(directory.path, target, args, signal),
    toModel: grepToModel,
  }),
];
