import type { z } from "zod";
import type { DirectoryStatus, gitStatusValue } from "./contract.ts";
import { git, GitExit } from "./git.ts";

type Status = z.infer<typeof gitStatusValue>;
type Summary = NonNullable<z.infer<typeof DirectoryStatus.output>>;

function classify(x: string, y: string): Status | null {
  if (x === "?" && y === "?") return "untracked";
  if (x === "!") return null;
  if (x === "D" || y === "D") return "deleted";
  if (x === "R" || y === "R") return "renamed";
  if (x === "A" || x === "C" || y === "A" || y === "C") return "added";
  return "modified";
}

/** Parse `git status --porcelain=v1 -z`; paths are repository-relative and re-rooted at `prefix` (ending in '/' or empty). */
export function parseStatus(output: string, prefix: string): Array<{ path: string; status: Status }> {
  const records = output.split("\0");
  const files: Array<{ path: string; status: Status }> = [];
  for (let i = 0; i < records.length; i++) {
    const record = records[i]!;
    if (record.length < 4) continue;
    const x = record[0]!, y = record[1]!, path = record.slice(3);
    // Rename and copy records carry the original path in the following NUL-separated field.
    if ("RC".includes(x) || "RC".includes(y)) i++;
    const status = classify(x, y);
    if (status && path.startsWith(prefix) && path.length > prefix.length) files.push({ path: path.slice(prefix.length), status });
  }
  return files;
}

/** Sum `git diff --numstat -z --no-renames`; binary files report '-' and contribute no lines. */
export function sumNumstat(output: string): { added: number; removed: number } {
  let added = 0, removed = 0;
  for (const record of output.split("\0")) {
    const [a, r] = record.split("\t");
    if (r === undefined) continue;
    if (a !== "-") added += Number(a);
    if (r !== "-") removed += Number(r);
  }
  return { added, removed };
}

/**
 * Parse `rev-parse --is-inside-work-tree --show-prefix --verify --quiet HEAD`. An unborn branch omits the HEAD line;
 * null means the directory is not inside a work tree (for example, inside the Git directory).
 */
export function parseProbe(output: string): { prefix: string; head: string | null } | null {
  const [inside, prefix = "", head = ""] = output.split(/\r?\n/u);
  return inside === "true" ? { prefix, head: head.trim() || null } : null;
}

/** Staged and unstaged changes against HEAD within `root`; null when `root` is outside a work tree or git is unavailable. */
export async function readDirectoryStatus(root: string, signal: AbortSignal): Promise<Summary | null> {
  const probe = await git(root, ["rev-parse", "--is-inside-work-tree", "--show-prefix", "--verify", "--quiet", "HEAD"], signal).catch(error => {
    signal.throwIfAborted();
    if (!(error instanceof GitExit)) throw error;
    // Exit 1 is the missing HEAD after the earlier fields were printed; 128 and ENOENT mean no work tree.
    if (error.exitCode === 1) return error.stdout;
    if (error.exitCode === 128 || error.exitCode === "ENOENT") return "";
    throw error;
  });
  const location = parseProbe(probe);
  if (!location) return null;
  const { prefix, head } = location;
  // An unborn branch compares against the empty tree of the repository's object format.
  const base = head ?? (await git(root, ["hash-object", "-t", "tree", "--stdin"], signal)).trim();
  const [status, numstat] = await Promise.all([
    git(root, ["status", "--porcelain=v1", "-z", "--untracked-files=normal", "--", "."], signal),
    git(root, ["diff", base, "--numstat", "-z", "--no-renames", "--", "."], signal),
  ]);
  return { files: parseStatus(status, prefix), ...sumNumstat(numstat) };
}
