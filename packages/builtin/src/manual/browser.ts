import type { ManualSource } from "@asterism-app/sdk/runtime";
import { FilesystemError, failed } from "../filesystem/errors.ts";
import { withinDirectory } from "../filesystem/paths.ts";
import { readViewerFile } from "../filesystem/file-io.ts";
import { readChildren } from "../filesystem/read.ts";
import { manualPath } from "./paths.ts";

/** Virtual ancestors list source prefix segments as directories; source paths list their physical directory without following symlinks. */
export async function readManualChildren(sources: readonly ManualSource[], path: string, signal: AbortSignal): Promise<{ entries: Array<{ name: string; directory: boolean }> }> {
  signal.throwIfAborted();
  const selected = manualPath(sources, path);
  if (selected.kind === "directory") return { entries: selected.entries.map(name => ({ name, directory: true })) };
  return readChildren(selected.scope.source.directory, selected.scope.path, signal);
}

export async function readManualFile(sources: readonly ManualSource[], path: string, signal: AbortSignal) {
  signal.throwIfAborted();
  const selected = manualPath(sources, path);
  if (selected.kind === "directory") throw new FilesystemError(failed("not_file", "The manual path selects a directory, not a file."));
  const file = await withinDirectory(selected.scope.source.directory, selected.scope.path);
  return readViewerFile(file, signal);
}
