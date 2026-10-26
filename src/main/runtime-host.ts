import { utilityProcess, type MessagePortMain, type UtilityProcess } from "electron";
import { applicationBrand, applicationStorage } from "../shared/application.ts";
import { createWriteStream, mkdirSync } from "node:fs";
import { join } from "node:path";
import { runtimeMessageSchema, type Command, type CommandResult, type RuntimeStatus } from "../shared/contracts.ts";
import { RuntimeRequests } from "./requests.ts";
import { handleSecretRequest } from "./secrets.ts";
import type { StartupStage } from "../shared/startup.ts";
import type { PluginStorageFailure } from "../shared/recovery.ts";

/**
 * 任务进程监护与控制链路：启动、存活、退出流程与凭据解密留在主进程。
 * renderer 的业务流量经直连端口进入任务进程，不经此处转发。
 */
export class RuntimeHost {
  private child: UtilityProcess | null = null;
  private requests: RuntimeRequests | null = null;
  private status: RuntimeStatus = "starting";
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  /**
   * 存活检测：就绪后定期 ping，超过期限没有 pong 视为卡死并结束进程。
   * renderer 直连请求不设等待期限，任务进程失联由此转为 unavailable 状态通知。
   */
  constructor(private readonly onStatus: (status: RuntimeStatus) => void,
    private readonly liveness = { intervalMs: 5_000, timeoutMs: 15_000 },
    private readonly onStage: (stage: StartupStage, detail?: string) => void = () => {}) {}
  private setStatus(status: RuntimeStatus): void { this.status = status; this.onStatus(status); }
  get ready(): boolean { return this.status === "ready" && this.child !== null; }

  start(entry: string, root: string, storageFailures: readonly PluginStorageFailure[] = []): Promise<void> {
    if (this.status !== "starting") return Promise.reject(new Error("Task runtime startup was cancelled."));
    mkdirSync(join(root, applicationStorage.logsDirectory), { recursive: true });
    const log = createWriteStream(join(root, applicationStorage.logsDirectory, applicationStorage.runtimeLogFile), { flags: "a", mode: 0o600 });
    // 流错误必须有监听器，不能把日志故障变成未捕获异常。
    log.on("error", error => console.error("Runtime log write failed.", error));
    let child: UtilityProcess;
    try {
      child = utilityProcess.fork(entry, [root, JSON.stringify(storageFailures)], { serviceName: `${applicationBrand.en} task runtime`, stdio: "pipe" });
    } catch (error) {
      log.end();
      this.setStatus("unavailable");
      return Promise.reject(error);
    }
    this.child = child;
    child.stdout?.pipe(log, { end: false });
    child.stderr?.pipe(log, { end: false });
    const requests = this.requests = new RuntimeRequests(message => child.postMessage(message), () => {
      this.setStatus("unavailable");
      child.kill();
    });
    return new Promise((resolve, reject) => {
      const fail = (error: Error) => {
        clearTimeout(timeout);
        requests.close();
        this.setStatus("unavailable");
        child.kill();
        reject(error);
      };
      // 总等待期限覆盖构建、导入与同步装配，进度消息不延长它。
      const timeout = setTimeout(() => fail(Object.assign(new Error("Task runtime initialization timed out after 60 seconds."), { reason: "timeout" })), 60_000);
      let lastPong = 0;
      const watch = () => {
        lastPong = Date.now();
        this.heartbeat = setInterval(() => {
          if (this.child !== child || this.status !== "ready") return;
          if (Date.now() - lastPong > this.liveness.timeoutMs) {
            console.error("Task runtime stopped responding and was terminated.");
            this.stopHeartbeat();
            requests.close(`The task runtime stopped responding. Restart ${applicationBrand.en} and inspect the workspace before retrying.`);
            this.setStatus("unavailable");
            child.kill();
            return;
          }
          try { child.postMessage({ kind: "ping" }); } catch { /* 退出由 exit 事件处理。 */ }
        }, this.liveness.intervalMs);
      };
      child.on("error", () => {
        console.error("Task runtime encountered a fatal process error.");
        fail(new Error("Task runtime encountered a fatal process error."));
      });
      child.on("message", raw => {
        if (raw?.kind === "secret.request") {
          void handleSecretRequest(raw).then(response => {
            if (response && this.child === child && this.status !== "stopping") {
              try { child.postMessage(response); } catch { /* 子进程可能已退出；不记录凭据消息。 */ }
            }
          });
          return;
        }
        if (raw?.kind === "pong") { lastPong = Date.now(); return; }
        if (raw?.kind === "response") { requests.receive(raw); return; }
        const parsed = runtimeMessageSchema.safeParse(raw);
        if (!parsed.success) return;
        if (parsed.data.kind === "startup") {
          if (this.status === "starting") this.onStage(parsed.data.stage, parsed.data.detail);
        } else if (parsed.data.kind === "ready") {
          clearTimeout(timeout);
          if (this.status !== "starting") return;
          this.setStatus("ready");
          watch();
          resolve();
        } else if (parsed.data.kind === "fatal") {
          fail(Object.assign(new Error(parsed.data.message), { reason: parsed.data.reason, directory: parsed.data.directory }));
        }
      });
      child.once("exit", code => {
        clearTimeout(timeout);
        this.stopHeartbeat();
        log.end();
        this.child = null;
        requests.close();
        if (this.status !== "stopping") this.setStatus("unavailable");
        reject(new Error("Task runtime exited with code " + code));
      });
    });
  }

  execute(command: Command): Promise<CommandResult> {
    if (!this.ready || !this.requests) return Promise.resolve({
      ok: false, error: { code: "unavailable", message: `The workspace is unavailable. Restart ${applicationBrand.en} to reopen it.` },
    });
    return this.requests.execute(command);
  }

  /** 把 renderer 直连的一端交给任务进程；不可用时返回 false，调用方关闭另一端。 */
  connect(id: string, port: MessagePortMain): boolean {
    if (!this.ready) return false;
    try { this.child!.postMessage({ kind: "connection.open", id }, [port]); return true; }
    catch { this.setStatus("unavailable"); return false; }
  }
  disconnect(id: string): void {
    if (!this.ready) return;
    try { this.child!.postMessage({ kind: "connection.close", id }); } catch { /* 子进程已退出。 */ }
  }

  private stopHeartbeat(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
  }

  stop(): Promise<void> {
    this.stopHeartbeat();
    this.setStatus("stopping");
    this.requests?.close(`${applicationBrand.en} is shutting down.`);
    const child = this.child;
    if (!child) return Promise.resolve();
    return new Promise(resolve => {
      const timeout = setTimeout(() => { child.kill(); resolve(); }, 5_000);
      child.once("exit", () => { clearTimeout(timeout); resolve(); });
      try { child.postMessage({ kind: "shutdown" }); }
      catch { clearTimeout(timeout); child.kill(); resolve(); }
    });
  }
}
