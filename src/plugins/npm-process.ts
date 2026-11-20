import { findPackageJSON } from "node:module";
import { dirname, join, delimiter } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { npmLauncher } from "./npm-launcher.ts";
import { unpackedArchivePath } from "./package-modules.ts";
import { startShellProcess } from "../shell/process.ts";

export interface NpmProcessResult { code: number | null; stdout: string; stderr: string }
export interface NpmProcess {
  run(args: string[], cwd: string, signal: AbortSignal, output: (stream: "stdout" | "stderr", text: string) => void): Promise<NpmProcessResult>;
}

/** Package resolution works in development and in the packaged application's unpacked dependencies. */
export function pnpmLauncher(): string {
  const manifest = findPackageJSON(npmLauncher.package, import.meta.url);
  if (!manifest) throw new Error("The bundled pnpm package is missing.");
  const file = join(dirname(manifest), npmLauncher.entry);
  return unpackedArchivePath(file) ?? file;
}

/** Diagnostics retain package-manager context without echoing registry credentials. */
export function redactNpmOutput(value: string): string {
  return value.replace(/(https?:\/\/)[^\s/@]+(?::[^\s/@]*)?@/giu, "$1[redacted]@")
    .replace(/(authorization\s*[=:]\s*)(?:(?:Bearer|Basic)\s+)?[^\r\n,;]+/giu, "$1[redacted]")
    .replace(/((?:_authToken|_auth|password)\s*[=:]\s*)[^\s,;]+/giu, "$1[redacted]")
    .replace(/\b(Bearer|Basic)\s+[^\s,;]+/giu, "$1 [redacted]")
    .replace(/([?&](?:token|access_token|auth|key)=)[^&\s]+/giu, "$1[redacted]");
}

/** Owns the installer process tree; cancellation settles output before installation cleanup. */
export function createNpmProcess(launcher: () => string = pnpmLauncher, options: { executable?: string; env?: NodeJS.ProcessEnv } = {}): NpmProcess {
  return {
    async run(args, cwd, signal, output) {
      signal.throwIfAborted();
      const executable = options.executable ?? process.execPath;
      const commandDirectory = join(cwd, ".asterism-bin");
      mkdirSync(commandDirectory, { recursive: true });
      // Lifecycle scripts and /usr/bin/env node use the application's own Node-mode executable.
      // Windows command resolution uses node.cmd; POSIX shebangs resolve the executable shell shim.
      if (process.platform === "win32") writeFileSync(join(commandDirectory, "node.cmd"), `@echo off\r\n"${executable.replaceAll("%", "%%")}" %*\r\n`);
      else writeFileSync(join(commandDirectory, "node"), `#!/bin/sh\nexec '${executable.replaceAll("'", "'\\''")}' "$@"\n`, { mode: 0o755 });
      const environment = options.env ?? process.env;
      const decoder = { stdout: new TextDecoder(), stderr: new TextDecoder() };
      let stdout = "", stderr = "";
      const lines = { stdout: "", stderr: "" };
      // Process output is a bounded diagnostic tail, not a credential/configuration log.
      const limit = 64 * 1024;
      const child = startShellProcess(executable, [launcher(), ...args], {
        cwd,
        env: { ...environment, PATH: `${commandDirectory}${delimiter}${environment.PATH ?? ""}`, ...(process.versions.electron ? { ELECTRON_RUN_AS_NODE: "1" } : {}) },
        async onData(stream, bytes) {
          const chunk = decoder[stream].decode(bytes, { stream: true });
          if (stream === "stdout") { stdout += chunk; if (stdout.length > limit) { stdout = stdout.slice(-limit); } }
          else stderr = (stderr + chunk).slice(-64 * 1024);
          // Publish complete lines so credentials split across pipe chunks are redacted together.
          lines[stream] += chunk;
          const end = lines[stream].lastIndexOf("\n");
          if (end >= 0) { output(stream, lines[stream].slice(0, end + 1)); lines[stream] = lines[stream].slice(end + 1); }
        },
      });
      let stopping: Promise<void> | undefined;
      const abort = () => { stopping = child.stop(); void stopping.catch(() => {}); };
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
      try {
        const result = await child.settled;
        await stopping;
        signal.throwIfAborted();
        for (const stream of ["stdout", "stderr"] as const) {
          const tail = decoder[stream].decode();
          if (stream === "stdout") stdout += tail; else stderr += tail;
          if (lines[stream] || tail) output(stream, lines[stream] + tail);
        }
        if (result.error) throw new Error(result.error);
        return { code: result.exitCode, stdout, stderr };
      } finally { signal.removeEventListener("abort", abort); }
    },
  };
}
