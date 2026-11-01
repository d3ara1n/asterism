import { execFile } from "node:child_process";
import { dirname, relative, sep } from "node:path";
import { promisify } from "node:util";
import { simpleGit } from "simple-git";
import { MAX_TEXT_BYTES, validateTextSize } from "./text-io.ts";

const execute = promisify(execFile);

/** Capture HEAD once for this read; missing HEAD or an untracked file has an empty baseline. */
export async function readGitBase(path: string, signal: AbortSignal): Promise<string | null> {
  const directory = dirname(path);
  if (!await simpleGit({ baseDir: directory, abort: signal }).checkIsRepo()) return null;
  const git = async (cwd: string, args: string[], allowAbsent = false): Promise<string> => {
    try {
      return (await execute("git", ["-C", cwd, ...args], {
        encoding: "utf8", signal, maxBuffer: MAX_TEXT_BYTES,
      })).stdout;
    } catch (error) {
      signal.throwIfAborted();
      if (allowAbsent && (error as { code?: unknown }).code === 1) return "";
      throw error;
    }
  };
  const root = (await git(directory, ["rev-parse", "--show-toplevel"])).replace(/\r?\n$/, "");
  const file = relative(root, path).split(sep).join("/");
  if (await git(root, ["check-ignore", "--", file], true)) return null;
  const head = (await git(root, ["rev-parse", "--verify", "--quiet", "HEAD"], true)).trim();
  if (!head || !await git(root, ["--literal-pathspecs", "ls-tree", "-z", head, "--", file])) return "";
  const text = await git(root, ["show", `${head}:${file}`]);
  validateTextSize(text);
  return text;
}
