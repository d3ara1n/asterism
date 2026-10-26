import { utilityProcess } from "electron";
import { createWriteStream, mkdirSync } from "node:fs";
import { join } from "node:path";
import { dataPreparationResultSchema, type DataPreparationResult } from "../shared/migrations.ts";
import { applicationStorage } from "../shared/application.ts";

/** 数据准备无普通启动期限；退出时终止，下一次启动由持久记录续接。 */
export function prepareDataProcess(entry: string, root: string, version: string, action: string, signal: AbortSignal): Promise<DataPreparationResult> {
  signal.throwIfAborted();
  mkdirSync(join(root, applicationStorage.logsDirectory), { recursive: true });
  const log = createWriteStream(join(root, applicationStorage.logsDirectory, applicationStorage.runtimeLogFile), { flags: "a", mode: 0o600 });
  log.on("error", error => console.error("Data preparation log failed.", error));
  return new Promise((resolve, reject) => {
    let child: ReturnType<typeof utilityProcess.fork>;
    try { child = utilityProcess.fork(entry, [root, version, action], { serviceName: "Atelier data preparation", stdio: "pipe" }); }
    catch (error) { log.end(); reject(error); return; }
    child.stdout?.pipe(log, { end: false }); child.stderr?.pipe(log, { end: false });
    let result: DataPreparationResult | undefined, failure: Error | undefined;
    const abort = () => { failure = new Error("Data preparation was cancelled."); child.kill(); };
    signal.addEventListener("abort", abort, { once: true });
    child.on("message", raw => {
      const parsed = dataPreparationResultSchema.safeParse(raw);
      if (parsed.success) result = parsed.data;
      else if (typeof raw?.error === "string") failure = new Error(raw.error);
    });
    child.once("error", error => { failure = new Error(String(error)); child.kill(); });
    child.once("exit", code => {
      signal.removeEventListener("abort", abort); log.end();
      if (failure || code !== 0 || !result) reject(failure ?? new Error(`Data preparation exited with code ${code}.`));
      else resolve(result);
    });
  });
}
