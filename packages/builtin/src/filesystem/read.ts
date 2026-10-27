import { readdir } from "node:fs/promises";
import type { z } from "zod";
import type { CallResult } from "@asterism/sdk/runtime";
import { TextError, readText } from "../shared/text.ts";
import { DirectoryList, DirectoryRead } from "./contract.ts";
import { withinDirectory } from "./paths.ts";
import { filesystemFailure } from "./errors.ts";
import { readTextFile } from "./text-io.ts";

/** Directories and static manuals share the read mechanism; resource implementations provide the root path. */
export async function listFiles(root: string, target: z.infer<typeof DirectoryList.targetSchema>, signal: AbortSignal): Promise<CallResult<z.infer<typeof DirectoryList.schema>>> {
  const path = target?.path ?? ".";
  try {
    const resolved = await withinDirectory(root, path);
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
}

export async function readFileContent(root: string, target: z.infer<typeof DirectoryRead.targetSchema>,
  args: z.infer<typeof DirectoryRead.tool.argsSchema>, signal: AbortSignal): Promise<CallResult<z.infer<typeof DirectoryRead.schema>>> {
  try {
    const file = await readTextFile(await withinDirectory(root, target.path), signal);
    const data = readText(file.text, args.anchored !== false, {
      offset: target.offset, limit: target.limit ?? 1000, maxBytes: 64 * 1024,
    });
    return { kind: "succeeded", data: { path: target.path, ...data } };
  } catch (error) {
    if (signal.aborted) return { kind: "cancelled", message: "Read target file was cancelled." };
    return error instanceof TextError ? error.outcome() : filesystemFailure(error, "Read target file");
  }
}
