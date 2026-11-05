import { exec } from "node:child_process";
import { homedir } from "node:os";
import { closeProcessTree } from "../shell/process-tree.ts";

export type CredentialCommand = (command: string, signal: AbortSignal) => Promise<string>;

/** Use the platform shell and the login environment inherited from the main process. */
const executeCredentialCommand: CredentialCommand = (command, signal) => new Promise((resolve, reject) => {
  const child = exec(command, { cwd: homedir(), encoding: "utf8" }, (error, stdout) => {
    signal.removeEventListener("abort", abort);
    if (error) reject(error); else resolve(stdout);
  });
  const exited = new Promise<void>(done => { child.once("exit", () => done()); child.once("error", () => done()); });
  function abort() { void closeProcessTree(child.pid ?? null, async () => { child.kill("SIGKILL"); await exited; }).catch(() => {}); }
  signal.addEventListener("abort", abort, { once: true });
  child.stdin?.end();
});

/** Stop waiting when the caller's signal aborts; the underlying work continues for other callers. */
function abandonable<T>(work: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) return work;
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

/**
 * Credentials beginning with `!` are shell commands. Each distinct expression runs on first use and its output stays in memory
 * for this process; concurrent readers share one execution. Failures are not retained, so the next read runs the command again.
 * A command is stopped once every waiting reader has cancelled, or when the resolver's lifetime ends.
 */
export class CredentialResolver {
  private readonly resolved = new Map<string, string>();
  private readonly pending = new Map<string, { result: Promise<string>; abort: AbortController; waiters: number }>();
  constructor(private readonly lifetime: AbortSignal, private readonly run: CredentialCommand = executeCredentialCommand) {}
  async resolve(value: string, signal?: AbortSignal): Promise<string> {
    if (!value.startsWith("!")) return value;
    const command = value.slice(1).trim();
    if (!command) throw new Error("The credential command is empty.");
    this.lifetime.throwIfAborted();
    signal?.throwIfAborted();
    const cached = this.resolved.get(command);
    if (cached !== undefined) return cached;
    const entry = this.pending.get(command) ?? this.start(command);
    entry.waiters++;
    try { return await abandonable(entry.result, signal); }
    finally { if (--entry.waiters === 0 && this.pending.get(command) === entry) entry.abort.abort(); }
  }
  private start(command: string) {
    const abort = new AbortController();
    const result = this.run(command, AbortSignal.any([abort.signal, this.lifetime])).then(output => {
      const credential = output.trim();
      if (!credential) throw new Error("The credential command returned no value.");
      this.resolved.set(command, credential);
      return credential;
    }, () => {
      // Child-process errors include the command and output, which may contain credentials.
      throw new Error("The credential command failed. Check the command and unlock the credential manager.");
    }).finally(() => { if (this.pending.get(command) === entry) this.pending.delete(command); });
    const entry = { result, abort, waiters: 0 };
    this.pending.set(command, entry);
    return entry;
  }
}
