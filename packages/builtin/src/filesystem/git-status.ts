import type { GitChange, GitSummary } from "./contract.ts";
import type { GitWorktree } from "./git-repository.ts";
import { git } from "./git.ts";

function classify(x: string, y: string): GitChange["status"] {
  if (x === "D" || y === "D") return "deleted";
  if (x === "R" || y === "R") return "renamed";
  if (x === "A" || x === "C" || y === "A" || y === "C") return "added";
  return "modified";
}

/** Read the HEAD OID from the same porcelain snapshot as the files. Paths are repository-relative. */
export function parseStatus(output: string, prefix: string): { head: string | null; files: GitChange[] } {
  const records = output.split("\0");
  const files: GitChange[] = [];
  let head: string | null | undefined;
  for (let i = 0; i < records.length; i++) {
    const record = records[i]!;
    if (record.startsWith("# branch.oid ")) {
      const oid = record.slice("# branch.oid ".length);
      if (oid === "(initial)") head = null;
      else if (/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(oid)) head = oid;
      continue;
    }
    const type = record[0];
    let path: string, status: GitChange["status"];
    if (type === "?") {
      path = record.slice(2);
      status = "untracked";
    } else if (type === "1" || type === "2" || type === "u") {
      // Consume only the fixed header; a path can contain spaces, tabs, and newlines.
      const fields = record.split(" ", type === "1" ? 8 : type === "2" ? 9 : 10);
      if (type === "2") i++; // The source of a rename/copy is the next NUL record.
      const xy = fields[1];
      if (xy?.length !== 2) continue;
      status = classify(xy[0]!, xy[1]!);
      path = record.slice(fields.join(" ").length + 1);
    } else continue;
    if (path.startsWith(prefix) && path.length > prefix.length) files.push({ path: path.slice(prefix.length), status });
  }
  if (head === undefined) throw new Error("Git status did not report HEAD.");
  return { head, files };
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

/** Staged and unstaged changes against HEAD within the resource, without requiring another repository probe. */
export async function readDirectoryStatus(root: string, repository: GitWorktree, signal: AbortSignal, run = git): Promise<GitSummary> {
  const status = await run(root, ["status", "--porcelain=v2", "--branch", "--no-ahead-behind", "-z", "--untracked-files=normal", "--", "."], signal);
  const { files, head } = parseStatus(status, repository.prefix);
  if (files.every(file => file.status === "untracked")) return { files, added: 0, removed: 0 };
  // An unborn branch compares against the empty tree of the repository's object format.
  const base = head ?? (await run(root, ["hash-object", "-t", "tree", "--stdin"], signal)).trim();
  const numstat = await run(root, ["diff", base, "--numstat", "-z", "--no-renames", "--", "."], signal);
  return { files, ...sumNumstat(numstat) };
}
