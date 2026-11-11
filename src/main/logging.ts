import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { format } from "node:util";
import type { UtilityProcess } from "electron";
import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import { applicationStorage } from "../shared/application.ts";
import type { RendererFailure } from "../shared/renderer-failure.ts";

let logger: winston.Logger | undefined;
let transport: DailyRotateFile | undefined;
let writeFailed = false;
const startupId = randomUUID();
const processOutput = new Set<Promise<void>>();

type LogLevel = "log" | "info" | "warn" | "error" | "debug" | "stdout" | "stderr";

function logFailure(error: unknown): void {
  writeFailed = true;
  // Bypass the captured console so a failed transport cannot log into itself.
  process.stderr.write(`Application log write failed: ${String(error)}\n`);
}

/** Main owns the file transport; renderer failures and child output enter the same asynchronous queue. */
function record(source: string, level: LogLevel, message: string, pid: number | undefined): void {
  if (!logger || writeFailed) return;
  const severity = level === "stderr" ? "error" : level === "stdout" || level === "log" ? "info" : level;
  try {
    logger.log({
      level: severity, recordedLevel: level, time: new Date().toISOString(),
      startupId, source, pid, message,
    });
  } catch (error) { logFailure(error); }
}

/** Connect after acquiring the single-instance lock and before starting any child process; retain existing main-process console output. */
export function initializeApplicationLog(root: string, version: string): void {
  try {
    const directory = join(root, applicationStorage.logsDirectory);
    transport = new DailyRotateFile({
      dirname: directory,
      filename: applicationStorage.runtimeLogPattern,
      auditFile: join(directory, applicationStorage.runtimeLogAuditFile),
      datePattern: "YYYY-MM-DD",
      maxSize: "20m",
      maxFiles: "15d",
      options: { flags: "a", mode: 0o600 },
      eol: "\n",
    });
    // DailyRotateFile 5 exposes its underlying stream separately from transport errors.
    transport.logStream.on("error", logFailure);
    logger = winston.createLogger({
      level: "debug",
      format: winston.format.printf(info => JSON.stringify({
        time: info.time, startupId: info.startupId, source: info.source, pid: info.pid,
        level: info.recordedLevel, message: info.message,
      })),
      transports: [transport],
    });
    logger.on("error", logFailure);
  } catch (error) {
    logFailure(error);
    return;
  }
  for (const level of ["log", "info", "warn", "error", "debug"] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      record("main", level, format(...args), process.pid);
      original(...args);
    };
  }
  console.info(`Application starting. version=${version} startupId=${startupId} pid=${process.pid}`);
}

/** Called only at final application exit, after resource cleanup and window closure. */
export async function closeApplicationLog(): Promise<void> {
  // Process exit and pipe completion are separate events; include final unterminated output lines before draining.
  await Promise.all(processOutput);
  const current = logger;
  const output = transport?.logStream;
  logger = undefined;
  transport = undefined;
  if (!current || !output) return;
  try {
    if (writeFailed) {
      current.close();
      return;
    }
    await new Promise<void>(resolve => {
      const done = () => {
        current.removeListener("error", done);
        output.removeListener("error", done);
        resolve();
      };
      current.once("error", done);
      output.once("error", done);
      // Winston finish drains transport inputs; DailyRotateFile's file stream has its own completion callback.
      current.end(() => output.end(done));
    });
  } catch (error) { logFailure(error); }
}

export function recordRendererFailure(failure: RendererFailure, pid: number): void {
  const detail = [
    `Interface failure. stage=${failure.stage} ${failure.message}`,
    failure.stack,
    failure.componentStack && `Component stack:\n${failure.componentStack}`,
  ].filter(Boolean).join("\n");
  record("renderer", "error", detail, pid);
}

/** Collect child output and fatal reports; readline delivers the final fragment when the stream ends. */
export function observeProcess(child: UtilityProcess, source: string, root: string): void {
  const started = performance.now();
  let pid: number | undefined;
  child.once("spawn", () => {
    pid = child.pid;
    console.info(`Process spawned. source=${source} pid=${pid}`);
  });
  child.on("error", (type, location, report) => {
    const directory = join(root, applicationStorage.diagnosticsDirectory);
    const path = join(directory, `${source}-${startupId}-${randomUUID()}.json`);
    try {
      // Save the original report before later error listeners terminate the child; it is independent of log rotation.
      mkdirSync(directory, { recursive: true, mode: 0o700 });
      writeFileSync(path, report, { encoding: "utf8", mode: 0o600, flag: "wx" });
      console.error("Process diagnostic report saved.", { source, pid, type, location, path });
    } catch (error) {
      // Report capture failure must not interrupt the process supervisor's fatal-error handling.
      console.error("Process diagnostic report write failed.", { source, pid, type, location, path, error });
    }
  });
  for (const [stream, level] of [[child.stdout, "stdout"], [child.stderr, "stderr"]] as const) {
    if (!stream) continue;
    const reader = createInterface({ input: stream, crlfDelay: Infinity });
    const completed = new Promise<void>(resolve => reader.once("close", resolve));
    processOutput.add(completed);
    void completed.then(() => processOutput.delete(completed));
    reader.on("line", line => record(source, level, line, pid))
      .on("error", error => {
        console.error(`Process log read failed. source=${source}`, error);
        reader.close();
      });
  }
  child.once("exit", code => console.info(`Process exited. source=${source} pid=${pid} code=${code} elapsedMs=${Math.round(performance.now() - started)}`));
}
