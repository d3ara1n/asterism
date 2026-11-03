import { dirname, relative, sep } from "node:path";
import { MAX_TEXT_BYTES, validateTextSize } from "./text-io.ts";
import { git, GitExit, insideWorkTree } from "./git.ts";

/** Capture HEAD once for this read; missing HEAD or an untracked file has an empty baseline. */
export async function readGitBase(path: string, signal: AbortSignal): Promise<string | null> {
  const directory = dirname(path);
  if (!await insideWorkTree(directory, signal)) return null;
  // Exit status 1 reports absence for check-ignore and `rev-parse --verify --quiet`.
  const read = (cwd: string, args: string[], allowAbsent = false) => git(cwd, args, signal, MAX_TEXT_BYTES).catch(error => {
    signal.throwIfAborted();
    if (allowAbsent && error instanceof GitExit && error.exitCode === 1) return "";
    throw error;
  });
  const root = (await read(directory, ["rev-parse", "--show-toplevel"])).replace(/\r?\n$/, "");
  const file = relative(root, path).split(sep).join("/");
  if (await read(root, ["check-ignore", "--", file], true)) return null;
  const head = (await read(root, ["rev-parse", "--verify", "--quiet", "HEAD"], true)).trim();
  if (!head || !await read(root, ["--literal-pathspecs", "ls-tree", "-z", head, "--", file])) return "";
  const text = await read(root, ["show", `${head}:${file}`]);
  validateTextSize(text);
  return text;
}
