import { utilityProcess } from "electron";
import { createWriteStream, mkdirSync } from "node:fs";
import { join } from "node:path";
import { preparationMessageSchema, type PreparationResult, type RecoveryAction } from "../shared/recovery.ts";
import { applicationBrand, applicationStorage } from "../shared/application.ts";

export type PreparationAction = { kind: "prepare" } | RecoveryAction;

/** 数据准备无普通启动期限；退出时终止，下一次启动按持久状态续接。宿主存储状态先于结果回报。 */
export function prepareDataProcess(entry: string, root: string, version: string, action: PreparationAction, signal: AbortSignal,
  onHost: (status: "migrating" | "ready") => void = () => {}): Promise<PreparationResult> {
  signal.throwIfAborted();
  mkdirSync(join(root, applicationStorage.logsDirectory), { recursive: true });
  const log = createWriteStream(join(root, applicationStorage.logsDirectory, applicationStorage.runtimeLogFile), { flags: "a", mode: 0o600 });
  log.on("error", error => console.error("Data preparation log failed.", error));
  const args = [root, version, action.kind, ...action.kind === "restore" ? [action.point] : []];
  return new Promise((resolve, reject) => {
    let child: ReturnType<typeof utilityProcess.fork>;
    try { child = utilityProcess.fork(entry, args, { serviceName: `${applicationBrand.en} data preparation`, stdio: "pipe" }); }
    catch (error) { log.end(); reject(error); return; }
    child.stdout?.pipe(log, { end: false }); child.stderr?.pipe(log, { end: false });
    let result: PreparationResult | undefined, failure: Error | undefined;
    const abort = () => { failure = new Error("Data preparation was cancelled."); child.kill(); };
    signal.addEventListener("abort", abort, { once: true });
    child.on("message", raw => {
      const parsed = preparationMessageSchema.safeParse(raw);
      if (!parsed.success) return;
      const message = parsed.data;
      if (message.kind === "host") onHost(message.status);
      else if (message.kind === "result") result = message.result;
      else failure = new Error(message.error);
    });
    child.once("error", error => { failure = new Error(String(error)); child.kill(); });
    child.once("exit", code => {
      signal.removeEventListener("abort", abort); log.end();
      if (failure || code !== 0 || !result) reject(failure ?? new Error(`Data preparation exited with code ${code}.`));
      else resolve(result);
    });
  });
}
