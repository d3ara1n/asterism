import { utilityProcess } from "electron";
import { preparationMessageSchema, type PreparationProgress, type PreparationResult, type RecoveryAction } from "../shared/recovery.ts";
import { applicationBrand } from "../shared/application.ts";
import { observeProcess } from "./logging.ts";

export type PreparationAction = { kind: "prepare" } | RecoveryAction;

/** 尚未确认进程退出时只允许重启应用，恢复操作仍需独占数据目录。 */
export class PreparationTerminationError extends Error {}

/** 工作期间无启动期限；最终结果到达后由主进程终止，确认退出才交付结果。 */
export function prepareDataProcess(entry: string, root: string, version: string, action: PreparationAction, signal: AbortSignal,
  onHost: (status: "migrating" | "ready") => void = () => {},
  onProgress: (progress: PreparationProgress) => void = () => {},
  onFinalizing: () => void = () => {}): Promise<PreparationResult> {
  signal.throwIfAborted();
  const args = [root, version, action.kind, ...action.kind === "restore" ? [action.point] : []];
  console.info(`Data preparation starting. action=${action.kind}`);
  return new Promise((resolve, reject) => {
    const child = utilityProcess.fork(entry, args, { serviceName: `${applicationBrand.en} data preparation`, stdio: "pipe" });
    observeProcess(child, "preparation");
    let result: PreparationResult | undefined, failure: Error | undefined;
    let stopping = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stop = () => {
      if (stopping) return;
      stopping = true;
      console.info("Data preparation process termination requested.");
      timer = setTimeout(() => {
        signal.removeEventListener("abort", abort);
        const error = new PreparationTerminationError("Data preparation process did not exit within 5 seconds of termination. Restart the application before trying again.");
        console.error(error);
        reject(error);
      }, 5_000);
      child.kill();
    };
    const abort = () => { failure = new Error("Data preparation was cancelled."); stop(); };
    signal.addEventListener("abort", abort, { once: true });
    child.on("message", raw => {
      if (stopping) return;
      try {
        const message = preparationMessageSchema.parse(raw);
        if (message.kind === "host") {
          console.info(`Host storage status received. status=${message.status}`);
          onHost(message.status);
        } else if (message.kind === "progress") onProgress(message);
        else {
          if (message.kind === "result") {
            result = message.result;
            console.info(`Data preparation result received. ok=${result.ok}`);
            if (!result.ok) console.error(`Data preparation failed. ${result.error}`);
          } else {
            failure = new Error(message.error);
            console.error("Data preparation failed.", failure);
          }
          onFinalizing();
          stop();
        }
      } catch (error) {
        failure = error instanceof Error ? error : new Error(String(error));
        console.error("Data preparation message handling failed.", failure);
        stop();
      }
    });
    child.once("error", error => { failure = new Error(String(error)); stop(); });
    child.once("exit", code => {
      signal.removeEventListener("abort", abort);
      clearTimeout(timer);
      // 收到最终结果后的主动结束允许非零退出码；提前退出始终失败。
      if (failure || !result) reject(failure ?? new Error(`Data preparation exited before delivering its result. code=${code}`));
      else resolve(result);
    });
  });
}
