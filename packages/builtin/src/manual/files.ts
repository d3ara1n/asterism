import { posix } from "node:path";
import type { z } from "zod";
import type { ManualSource } from "@asterism-app/builtin-api/runtime";
import type { CallResult } from "@asterism-app/sdk/runtime";
import { DirectoryList, DirectoryRead } from "../filesystem/contract.ts";
import { DirectoryFind, DirectoryGrep } from "../filesystem/search-contract.ts";
import { filesystemFailure, failed } from "../filesystem/errors.ts";
import { listFiles, readFileContent } from "../filesystem/read.ts";
import { searchScope } from "../filesystem/search.ts";
import { findOutput, grepOutput } from "../filesystem/search-output.ts";
import { runSearch, searchArguments } from "../filesystem/search-process.ts";
import { manualPath } from "./paths.ts";

function failure(error: unknown, signal: AbortSignal): CallResult<never> {
  return signal.aborted ? { kind: "cancelled", message: "The manual operation was cancelled." }
    : filesystemFailure(error, "Read manual");
}

export async function listManual(sources: readonly ManualSource[], target: z.infer<typeof DirectoryList.targetSchema>,
  signal: AbortSignal): Promise<CallResult<z.infer<typeof DirectoryList.schema>>> {
  try {
    signal.throwIfAborted();
    const selected = manualPath(sources, target?.path ?? ".");
    if (selected.kind === "directory") return { kind: "succeeded", data: {
      path: selected.path, entries: selected.entries.slice(0, 500).map(name => ({ name, type: "directory" })),
      truncated: selected.entries.length > 500,
    } };
    const result = await listFiles(selected.scope.source.directory, { path: selected.scope.path }, signal);
    return result.kind === "succeeded" ? { ...result, data: { ...result.data, path: selected.path } } : result;
  } catch (error) { return failure(error, signal); }
}

export async function readManual(sources: readonly ManualSource[], target: z.infer<typeof DirectoryRead.targetSchema>,
  args: z.infer<typeof DirectoryRead.tool.argsSchema>, signal: AbortSignal): Promise<CallResult<z.infer<typeof DirectoryRead.schema>>> {
  try {
    signal.throwIfAborted();
    const selected = manualPath(sources, target.path);
    if (selected.kind === "directory") return failed("not_file", "The manual path selects a directory, not a file.");
    const result = await readFileContent(selected.scope.source.directory, { ...target, path: selected.scope.path }, args, signal);
    return result.kind === "succeeded" ? { ...result, data: { ...result.data, path: selected.path } } : result;
  } catch (error) { return failure(error, signal); }
}

export async function findManual(sources: readonly ManualSource[], target: z.infer<typeof DirectoryFind.targetSchema>,
  args: z.infer<typeof DirectoryFind.tool.argsSchema>, signal: AbortSignal): Promise<CallResult<z.infer<typeof DirectoryFind.schema>>> {
  try {
    signal.throwIfAborted();
    const selected = manualPath(sources, target?.path ?? ".");
    let prefix = "";
    const output = findOutput(selected.path, () => prefix, args.limit ?? 500);
    for (const scope of selected.kind === "source" ? [selected.scope] : selected.scopes) {
      const search = await searchScope(scope.source.directory, scope.path, true);
      prefix = posix.join(scope.source.path, search.prefix);
      output.result.stopReason = await runSearch(search.cwd, searchArguments("find", args, search.operand), output.records, signal);
      if (output.result.stopReason !== null) break;
    }
    return { kind: "succeeded", data: output.result };
  } catch (error) { return failure(error, signal); }
}

export async function grepManual(sources: readonly ManualSource[], target: z.infer<typeof DirectoryGrep.targetSchema>,
  args: z.infer<typeof DirectoryGrep.tool.argsSchema>, signal: AbortSignal): Promise<CallResult<z.infer<typeof DirectoryGrep.schema>>> {
  try {
    signal.throwIfAborted();
    const selected = manualPath(sources, target?.path ?? ".");
    let prefix = "";
    const output = grepOutput(selected.path, () => prefix, args);
    for (const scope of selected.kind === "source" ? [selected.scope] : selected.scopes) {
      const search = await searchScope(scope.source.directory, scope.path, false);
      prefix = posix.join(scope.source.path, search.prefix);
      output.result.stopReason = await runSearch(search.cwd, searchArguments("grep", args, search.operand), output.records, signal);
      if (output.result.stopReason !== null) break;
    }
    return { kind: "succeeded", data: output.result };
  } catch (error) { return failure(error, signal); }
}
