import type { CallResult, ShellExecution } from "@asterism-app/sdk/runtime";
import type { Json } from "@asterism-app/sdk/contracts";
import { MAX_TIMEOUT_SECONDS, type ExecResult, type ShellSettings } from "@asterism-app/sdk/contracts";
import { ShellOutputBuffer } from "./output.ts";
import { resolveShell } from "./profiles.ts";
import { startShellProcess, type ShellProcess } from "./process.ts";

/** Piped shell execution; each call owns its process, while the host manages cancellation and settling. */
export class ShellExecutor implements ShellExecution {
  constructor(private readonly settings: () => ShellSettings, private readonly closingSignal: AbortSignal,
    private readonly temporaryRoot?: string) {}
  async inspect(): Promise<Json> {
    try {
      const shell = await resolveShell(this.settings());
      return { profile: shell.profile.id, executable: shell.executable, platform: process.platform, interactive: false };
    } catch (error) { return { platform: process.platform, error: String(error) }; }
  }
  async execute(cwd: string, args: { command: string; timeout?: number }, options: {
    signal: AbortSignal; publish(data: ExecResult): void;
  }): Promise<CallResult<ExecResult>> {
    if (args.timeout !== undefined && (!Number.isFinite(args.timeout) || args.timeout <= 0 || args.timeout > MAX_TIMEOUT_SECONDS))
      return { kind: "rejected", error: { code: "invalid_timeout", message: `timeout must be greater than 0 and at most ${MAX_TIMEOUT_SECONDS} seconds.` } };
    const signal = AbortSignal.any([options.signal, this.closingSignal]);
    if (signal.aborted) return { kind: "cancelled", message: "Command cancelled before starting." };
    let shell;
    try { shell = await resolveShell(this.settings()); }
    catch (error) { return { kind: "failed", error: { code: "shell_unavailable", message: String(error) } }; }
    if (signal.aborted) return { kind: "cancelled", message: "Command cancelled before starting." };
    const output = new ShellOutputBuffer(this.temporaryRoot);
    const started = performance.now();
    let process: ShellProcess | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined, update: ReturnType<typeof setTimeout> | undefined;
    let reason: "timeout" | "cancelled" | null = null;
    let cleanupError: unknown, progressError: unknown;
    let publishing = true;
    let cleanup: Promise<void> | undefined;
    const snapshot = (): ExecResult => ({
      ...output.snapshot(), shell: shell.executable, termination: "running",
      exitCode: null, signal: null, durationMs: Math.round(performance.now() - started),
    });
    const stop = () => cleanup ??= process!.stop().catch(error => { cleanupError = error; });
    const publish = () => {
      update = undefined;
      if (!publishing || progressError) return;
      try { options.publish(snapshot()); }
      catch (error) { progressError = error; void stop(); }
    };
    const cancel = () => { reason ??= "cancelled"; void stop(); };
    try {
      process = startShellProcess(shell.executable, [...shell.profile.args, ...shell.profile.commandArgs, args.command], {
        cwd, env: shell.env,
        onData: async (stream, bytes) => {
          await output.append(stream, bytes);
          if (publishing && !progressError) update ??= setTimeout(publish, 100);
        },
      });
      publish();
      signal.addEventListener("abort", cancel, { once: true });
      if (signal.aborted) cancel();
      if (args.timeout !== undefined) timeout = setTimeout(() => { reason ??= "timeout"; void stop(); }, args.timeout * 1000);
      // After the main command exits, only finalize output; background programs already started continue according to their own command lifecycles.
      const exit = await process.exited;
      clearTimeout(timeout);
      signal.removeEventListener("abort", cancel);
      await cleanup;
      const settled = await process.settled;
      clearTimeout(update);
      const final = await output.finish();
      const termination = reason ?? (exit.error ? "spawn_error" : settled.error || cleanupError || progressError ? "io_error" : "exited");
      const data: ExecResult = { ...final, shell: shell.executable, termination,
        exitCode: exit.exitCode, signal: exit.signal, durationMs: Math.round(performance.now() - started) };
      if (exit.error) return { kind: "failed", data, error: { code: "spawn_error", message: exit.error } };
      if (reason || settled.error || cleanupError || progressError) return { kind: "unknown", data,
        message: reason === "timeout" ? `Command timed out after ${args.timeout} seconds. Its side effects may already have occurred.`
          : reason === "cancelled" ? "Command was cancelled. Its side effects may already have occurred."
            : `Command output or process cleanup failed: ${settled.error ?? String(cleanupError ?? progressError)}` };
      return exit.exitCode === 0 ? { kind: "succeeded", data }
        : { kind: "failed", data, error: { code: "command_failed", message: `Command exited with ${exit.signal ?? `code ${exit.exitCode}`}.` } };
    } catch (error) {
      if (process) { await stop(); await process.settled; }
      const data: ExecResult = { ...snapshot(), termination: process ? "io_error" : "spawn_error" };
      return process ? { kind: "unknown", data, message: `Command execution failed: ${String(error)}` }
        : { kind: "failed", data, error: { code: "spawn_error", message: String(error) } };
    } finally {
      publishing = false;
      clearTimeout(timeout); clearTimeout(update);
      signal.removeEventListener("abort", cancel);
      await cleanup;
      await process?.settled;
      await output.close();
    }
  }
}
