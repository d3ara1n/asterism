import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { ManualSource } from "@asterism-app/sdk/runtime";
import { FilesystemError, failed } from "../filesystem/errors.ts";
import { withinDirectory } from "../filesystem/paths.ts";
import { readViewerFile } from "../filesystem/file-io.ts";
import { manualPath } from "./paths.ts";

/** Source prefixes preserve virtual identity, including empty source directories. Symlinks are not traversed. */
export async function readManualTree(sources: readonly ManualSource[], signal: AbortSignal): Promise<{ paths: string[] }> {
  const paths: string[] = [];
  async function visit(directory: string, prefix: string): Promise<void> {
    signal.throwIfAborted();
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      signal.throwIfAborted();
      if (entry.name === ".git" || entry.name === ".DS_Store") continue;
      const path = `${prefix}/${entry.name}`;
      paths.push(`${path}${entry.isDirectory() ? "/" : ""}`);
      if (entry.isDirectory()) await visit(join(directory, entry.name), path);
    }
  }
  for (const source of sources) {
    signal.throwIfAborted();
    paths.push(`${source.path}/`);
    await visit(source.directory, source.path);
  }
  return { paths };
}

export async function readManualFile(sources: readonly ManualSource[], path: string, signal: AbortSignal) {
  signal.throwIfAborted();
  const selected = manualPath(sources, path);
  if (selected.kind === "directory") throw new FilesystemError(failed("not_file", "The manual path selects a directory, not a file."));
  const file = await withinDirectory(selected.scope.source.directory, selected.scope.path);
  return readViewerFile(file, signal);
}
