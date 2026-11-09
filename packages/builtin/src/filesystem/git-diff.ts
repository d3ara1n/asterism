import { isUtf8 } from "node:buffer";
import { lstat, readFile, readlink } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { formatPatch, structuredPatch } from "diff";
import type { z } from "zod";
import type { ReadDirectoryDiff } from "./editor-contract.ts";
import { FilesystemError, failed } from "./errors.ts";
import { git, GitExit, insideWorkTree } from "./git.ts";
import { directoryEntryTarget } from "./paths.ts";
import { MAX_TEXT_BYTES, validateTextSize } from "./text-io.ts";
import { TextError } from "../shared/text.ts";

type DiffResult = z.infer<typeof ReadDirectoryDiff.output>;

/** Git does not include untracked additions in diff, so construct just that case from current bytes. */
export function untrackedDiff(path: string, bytes: Buffer, mode: string): DiffResult {
  if (!isUtf8(bytes)) return { kind: "binary" };
  const text = bytes.toString("utf8");
  try { validateTextSize(text); }
  catch (error) {
    if (error instanceof TextError && error.code === "unsupported_text") return { kind: "binary" };
    throw error;
  }
  const patch = structuredPatch("/dev/null", `b/${path}`, "", text);
  patch.isGit = true; patch.isCreate = true; patch.newMode = mode;
  return { kind: "patch", patch: formatPatch(patch) };
}

export function gitDiffResult(patch: string): DiffResult {
  if (!patch) return { kind: "empty" };
  return /^Binary files .* differ$/mu.test(patch) ? { kind: "binary" } : { kind: "patch", patch };
}

/** Current net Git changes against HEAD, independent of staging; missing files are valid deletion targets. */
export async function readDirectoryDiff(root: string, path: string, signal: AbortSignal): Promise<DiffResult> {
  signal.throwIfAborted();
  const selected = await directoryEntryTarget(root, path);
  if (!await insideWorkTree(selected.root, signal)) return { kind: "empty" };
  // Keep the lexical Git path after validating its resolution inside the resource.
  const target = resolve(selected.root, path);
  const status = await git(selected.root, ["--literal-pathspecs", "status", "--porcelain=v1", "-z", "--untracked-files=all", "--", path], signal);
  if (status.startsWith("?? ")) {
    const info = await lstat(selected.path);
    if (info.isSymbolicLink()) return untrackedDiff(path, await readlink(selected.path, { encoding: "buffer" }), "120000");
    if (!info.isFile()) throw new FilesystemError(failed("not_file", "The diff target requires a file; directories are not expanded."));
    if (info.size > MAX_TEXT_BYTES) throw new TextError("file_too_large", "The target exceeds the 8 MiB text file limit.");
    return untrackedDiff(path, await readFile(selected.path, { signal }), info.mode & 0o111 ? "100755" : "100644");
  }
  const head = await git(selected.root, ["rev-parse", "--verify", "--quiet", "HEAD"], signal).then(out => out.trim(), error => {
    signal.throwIfAborted();
    if (error instanceof GitExit && error.exitCode === 1) return "";
    throw error;
  });
  const base = head || (await git(selected.root, ["hash-object", "-t", "tree", "--stdin"], signal)).trim();
  const file = relative(selected.root, target).split(sep).join("/");
  // Git owns attributes, EOL normalization and file-mode semantics. External renderers cannot supply a patch contract.
  return gitDiffResult(await git(selected.root, ["--literal-pathspecs", "diff", "--no-ext-diff", "--no-textconv", "--no-color", base, "--", file], signal));
}
