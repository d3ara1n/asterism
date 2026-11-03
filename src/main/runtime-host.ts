import { utilityProcess, type MessagePortMain, type UtilityProcess } from "electron";
import { applicationBrand } from "../shared/application.ts";
import { observeProcess } from "./logging.ts";
import { runtimeMessageSchema, type Command, type CommandResult, type RuntimeStatus } from "../shared/contracts.ts";
import { RuntimeRequests } from "./requests.ts";
import { handleSecretRequest } from "./secrets.ts";
import { handleProxyRequest } from "./proxy.ts";
import type { StartupStage } from "../shared/startup.ts";
import type { PluginStorageFailure } from "../shared/recovery.ts";

/**
 * Task process supervision and control: startup, exit reporting, shutdown, and credential decryption stay in the main process.
 * Renderer business traffic enters the task process over direct ports without forwarding here.
 * Requests have no deadline; the task process becomes unavailable only when it exits or fails as a process.
 */
export class RuntimeHost {
  private child: UtilityProcess | null = null;
  private requests: RuntimeRequests | null = null;
  private status: RuntimeStatus = "starting";
  constructor(private readonly onStatus: (status: RuntimeStatus) => void,
    private readonly onStage: (stage: StartupStage, detail?: string) => void = () => {}) {}
  private setStatus(status: RuntimeStatus): void { this.status = status; this.onStatus(status); }
  get ready(): boolean { return this.status === "ready" && this.child !== null; }

  start(entry: string, root: string, storageFailures: readonly PluginStorageFailure[], pluginBuild: string): Promise<void> {
    if (this.status !== "starting") return Promise.reject(new Error("Task runtime startup was cancelled."));
    let child: UtilityProcess;
    try {
      child = utilityProcess.fork(entry, [root, JSON.stringify(storageFailures), pluginBuild], { serviceName: `${applicationBrand.en} task runtime`, stdio: "pipe" });
    } catch (error) {
      this.setStatus("unavailable");
      return Promise.reject(error);
    }
    this.child = child;
    observeProcess(child, "runtime");
    const requests = this.requests = new RuntimeRequests(message => child.postMessage(message));
    return new Promise((resolve, reject) => {
      const fail = (error: Error) => {
        clearTimeout(timeout);
        requests.close();
        this.setStatus("unavailable");
        child.kill();
        reject(error);
      };
      // The total deadline covers build, import, and synchronous assembly; progress messages do not extend it.
      const timeout = setTimeout(() => fail(Object.assign(new Error("Task runtime initialization timed out after 60 seconds."), { reason: "timeout" })), 60_000);
      child.on("error", () => {
        console.error("Task runtime encountered a fatal process error.");
        fail(new Error("Task runtime encountered a fatal process error."));
      });
      child.on("message", raw => {
        if (raw?.kind === "proxy.request") {
          void handleProxyRequest(raw).then(response => {
            if (response && this.child === child) {
              try { child.postMessage(response); } catch { /* The child has exited. */ }
            }
          });
          return;
        }
        if (raw?.kind === "secret.request") {
          void handleSecretRequest(raw).then(response => {
            if (response && this.child === child && this.status !== "stopping") {
              try { child.postMessage(response); } catch { /* The child may have exited; do not log credential messages. */ }
            }
          });
          return;
        }
        if (raw?.kind === "response") { requests.receive(raw); return; }
        const parsed = runtimeMessageSchema.safeParse(raw);
        if (!parsed.success) return;
        if (parsed.data.kind === "startup") {
          if (this.status === "starting") this.onStage(parsed.data.stage, parsed.data.detail);
        } else if (parsed.data.kind === "ready") {
          clearTimeout(timeout);
          if (this.status !== "starting") return;
          this.setStatus("ready");
          resolve();
        } else if (parsed.data.kind === "fatal") {
          fail(Object.assign(new Error(parsed.data.message), { reason: parsed.data.reason, directory: parsed.data.directory }));
        }
      });
      child.once("exit", code => {
        clearTimeout(timeout);
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

  /** Hand one end of the renderer's direct connection to the task process; return false if unavailable so the caller closes the other end. */
  connect(id: string, port: MessagePortMain): boolean {
    if (!this.ready) return false;
    try { this.child!.postMessage({ kind: "connection.open", id }, [port]); return true; }
    catch { this.setStatus("unavailable"); return false; }
  }
  disconnect(id: string): void {
    if (!this.ready) return;
    try { this.child!.postMessage({ kind: "connection.close", id }); } catch { /* The child has exited. */ }
  }

  stop(): Promise<void> {
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
