import { t } from "../shared/i18n";
import type { AppSnapshot, Command, DesktopBridge, RuntimeStatus } from "../../shared/contracts";

export type ApplicationState = { snapshot: AppSnapshot | null; busy: boolean; error: string | null; status: RuntimeStatus };
/** 串行提交应用意图；切换任务和变更使用相同顺序，避免晚到响应覆盖当前任务。 */
export class ApplicationController {
  private state: ApplicationState = { snapshot: null, busy: false, error: null, status: "starting" };
  private listeners = new Set<() => void>();
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private readonly bridge: DesktopBridge) {}
  getSnapshot = (): ApplicationState => this.state;
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(next: Partial<ApplicationState>): void {
    this.state = { ...this.state, ...next };
    this.listeners.forEach(listener => listener());
  }
  connect(): () => void {
    const unsubscribe = this.bridge.onStatus(status => this.update({
      status, ...(status === "unavailable" ? { error: t.runtimeStopped } : {}),
    }));
    void this.run({ type: "workspace.read" });
    return unsubscribe;
  }
  clearError = (): void => this.update({ error: null });
  run(command: Command): Promise<boolean> {
    const operation = this.queue.then(async () => {
      this.update({ busy: true, error: null });
      try {
        const result = await this.bridge.execute(command);
        if (!result.ok) {
          this.update({ error: result.error.message, ...(result.error.code === "unavailable" ? { status: "unavailable" as const } : {}) });
          return false;
        }
        this.update({ snapshot: result.snapshot, status: "ready" });
        return true;
      } catch {
        this.update({ status: "unavailable", error: t.connectionLost });
        return false;
      } finally { this.update({ busy: false }); }
    });
    this.queue = operation;
    return operation;
  }
}
