import { randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { format } from "node:util";
import type { UtilityProcess } from "electron";
import { applicationStorage } from "../shared/application.ts";

let file: string | undefined;
const startupId = randomUUID();

/** 主进程统一落盘；同步追加使启动失败和进程退出前的记录无需等待日志流排空。 */
function record(source: string, level: string, message: string, pid: number | undefined): void {
  if (!file) return;
  try {
    appendFileSync(file, JSON.stringify({ time: new Date().toISOString(), startupId, source, pid, level, message }) + "\n", { mode: 0o600 });
  } catch (error) {
    process.stderr.write(`Application log write failed: ${String(error)}\n`);
  }
}

/** 取得单实例锁后、启动任何子进程之前接入；主进程原有控制台输出同时保留。 */
export function initializeApplicationLog(root: string, version: string): void {
  try { mkdirSync(join(root, applicationStorage.logsDirectory), { recursive: true }); }
  catch (error) {
    process.stderr.write(`Application log initialization failed: ${String(error)}\n`);
    return;
  }
  file = join(root, applicationStorage.logsDirectory, applicationStorage.runtimeLogFile);
  for (const level of ["log", "info", "warn", "error", "debug"] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      record("main", level, format(...args), process.pid);
      original(...args);
    };
  }
  console.info(`Application starting. version=${version} startupId=${startupId} pid=${process.pid}`);
}

/** 按行汇集子进程输出；流结束时 readline 交付最后一个不带换行的片段。 */
export function observeProcess(child: UtilityProcess, source: string): void {
  const started = performance.now();
  let pid: number | undefined;
  child.once("spawn", () => {
    pid = child.pid;
    console.info(`Process spawned. source=${source} pid=${pid}`);
  });
  for (const [stream, level] of [[child.stdout, "stdout"], [child.stderr, "stderr"]] as const) {
    if (stream) createInterface({ input: stream, crlfDelay: Infinity })
      .on("line", line => record(source, level, line, pid))
      .on("error", error => console.error(`Process log read failed. source=${source}`, error));
  }
  child.once("exit", code => console.info(`Process exited. source=${source} pid=${pid} code=${code} elapsedMs=${Math.round(performance.now() - started)}`));
}
