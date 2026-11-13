import { readdir, stat } from "node:fs/promises";
import type { z } from "zod";
import { defineTopLevelTool, type CallResult } from "@asterism-app/sdk/runtime";
import { InspectPathResult, inspectPathInputSchema } from "./inspection-contract.ts";
import { resolveLocalPath } from "./local-path.ts";
import { filesystemFailure } from "./errors.ts";

type Inspection = z.infer<typeof InspectPathResult.schema>;

export async function inspectPath(path: string, list: boolean, signal: AbortSignal): Promise<CallResult<Inspection>> {
  try {
    signal.throwIfAborted();
    const absolutePath = resolveLocalPath(path);
    const info = await stat(absolutePath).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    signal.throwIfAborted();
    if (!info) return { kind: "succeeded", data: {
      path: absolutePath, exists: false, type: null, size: null, modifiedAt: null, entries: null, truncated: false,
    } };
    const children = list && info.isDirectory() ? await readdir(absolutePath, { withFileTypes: true }) : null;
    signal.throwIfAborted();
    return { kind: "succeeded", data: {
      path: absolutePath, exists: true, type: info.isDirectory() ? "directory" : info.isFile() ? "file" : "other",
      size: info.isFile() ? info.size : null, modifiedAt: info.mtime.toISOString(),
      entries: children?.slice(0, 500).map(entry => ({
        name: entry.name, type: entry.isDirectory() ? "directory" : entry.isFile() ? "file" : "other",
      })) ?? null,
      truncated: children !== null && children.length > 500,
    } };
  } catch (error) {
    signal.throwIfAborted();
    return filesystemFailure(error, "Inspect local path");
  }
}

export const inspectPathTool = defineTopLevelTool({
  id: InspectPathResult.id, name: "inspect_path",
  description: "Inspect a local filesystem path and optionally list a directory, without a Directory resource.",
  guidelines: [
    "Absolute paths and current-user home shorthand (~ or ~/path) are supported. Home expansion uses the operating system, independently of the shell profile.",
    "Metadata follows symbolic links. A missing path or broken symbolic link succeeds with exists:false; permission errors and other filesystem failures remain errors.",
    "list:true returns up to 500 direct directory entries, including hidden entries. No ignore-file filtering is applied; symbolic link entries are reported as other. Files are inspected without reading their contents.",
    "The returned absolute path can be used in Directory creation. Inspection observes current filesystem facts; later creation reports its own operation result.",
    "The operation runs with the current OS user's filesystem permissions and does not create resources or modify files.",
  ],
  argsSchema: inspectPathInputSchema, resultSchema: InspectPathResult.schema, effect: "read", execution: "parallel",
  execute: ({ path, list }, { signal }) => inspectPath(path, list, signal),
});
