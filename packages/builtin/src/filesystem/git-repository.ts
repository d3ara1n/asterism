import { lstat, realpath } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { git, GitExit } from "./git.ts";
import { insideDirectory } from "./paths.ts";

export type GitWorktree = { worktree: string; gitDir: string; commonDir: string; prefix: string };

/** A gitfile counts too. This is only a cheap negative check; Git interprets the marker. */
async function hasGitMarker(root: string, signal: AbortSignal): Promise<boolean> {
  for (let path = root; ; path = dirname(path)) {
    signal.throwIfAborted();
    try { await lstat(join(path, ".git")); return true; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    if (dirname(path) === path) return false;
  }
}

export async function discoverGitWorktree(root: string, signal: AbortSignal, run = git): Promise<GitWorktree | null> {
  const explicit = process.env.GIT_DIR || process.env.GIT_WORK_TREE;
  if (!explicit && !await hasGitMarker(root, signal)) return null;
  let output: string;
  try {
    output = await run(root, ["rev-parse", "--path-format=absolute", "--is-inside-work-tree", "--show-toplevel",
      "--absolute-git-dir", "--git-common-dir", "--show-prefix"], signal);
  } catch (error) {
    signal.throwIfAborted();
    // --show-toplevel fails inside the Git directory, after Git has already printed "false".
    if (error instanceof GitExit && (error.exitCode === "ENOENT" || /^false\r?\n/.test(error.stdout))) return null;
    throw error;
  }
  const [inside, top, gitDir, commonDir, prefix = ""] = output.split(/\r?\n/u);
  if (inside !== "true") return null;
  if (!top || !gitDir || !commonDir) throw new Error("Git did not report the worktree layout.");
  const [worktree, metadata, shared] = await Promise.all([
    realpath(resolve(root, top)), realpath(resolve(root, gitDir)), realpath(resolve(root, commonDir)),
  ]);
  signal.throwIfAborted();
  if (!insideDirectory(worktree, root)) return null;
  return { worktree, gitDir: metadata, commonDir: shared, prefix };
}
