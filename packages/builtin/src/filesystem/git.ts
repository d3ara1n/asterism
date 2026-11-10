import { execFile } from "node:child_process";

/**
 * A failed git invocation; `exitCode` is the process exit status, or a system code such as ENOENT when git cannot start.
 * `stdout` keeps output written before the failure.
 */
export class GitExit extends Error {
  constructor(readonly exitCode: number | string | undefined, message: string, readonly stdout = "") { super(message); }
}

/** Run a read-only git command in `cwd` and return stdout. Stdin is closed so commands reading it see empty input. */
export function git(cwd: string, args: string[], signal: AbortSignal, maxBuffer = 64 * 1024 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile("git", ["--no-optional-locks", "-C", cwd, ...args], { encoding: "utf8", signal, maxBuffer },
      (error, stdout) => error ? reject(new GitExit((error as { code?: number | string }).code, error.message, stdout)) : resolve(stdout));
    child.stdin?.end();
  });
}

/**
 * Whether `cwd` is inside a git work tree. Git is optional: a missing executable (ENOENT) and git's exit 128 outside a
 * repository both mean no work tree. Other failures propagate.
 */
export async function insideWorkTree(cwd: string, signal: AbortSignal): Promise<boolean> {
  try { return (await git(cwd, ["rev-parse", "--is-inside-work-tree"], signal)).trim() === "true"; }
  catch (error) {
    signal.throwIfAborted();
    if (error instanceof GitExit && (error.exitCode === 128 || error.exitCode === "ENOENT")) return false;
    throw error;
  }
}
