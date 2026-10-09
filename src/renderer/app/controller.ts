import { t } from "../shared/i18n";
import type { AppSnapshot, Command, DesktopBridge, RuntimeStatus } from "../../shared/contracts";

export type ApplicationState = { snapshot: AppSnapshot | null; busy: boolean; error: string | null; status: RuntimeStatus };
/** 串行提交应用意图；历史位置由会话控制器提供，视图保存不能改变查看位置。 */
export class ApplicationController {
  private state: ApplicationState = { snapshot: null, busy: false, error: null, status: "starting" };
  private listeners = new Set<() => void>();
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private readonly bridge: Pick<DesktopBridge, "execute" | "onStatus">) {}
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
  run(command: Command, inspected: () => string | undefined = () => undefined): Promise<boolean> {
    const operation = this.queue.then(async () => {
      if (inspected() !== undefined && command.type !== "workspace.read" && command.type !== "view.set" && command.type !== "viewport.set") {
        this.update({ error: t.historyReadOnly });
        return false;
      }
      this.update({ busy: true, error: null });
      try {
        const result = await this.bridge.execute(command);
        if (!result.ok) {
          this.update({ error: result.error.message, ...(result.error.code === "unavailable" ? { status: "unavailable" as const } : {}) });
          return false;
        }
        const at = inspected();
        if (command.type !== "workspace.read" && at !== undefined) {
          const viewed = await this.bridge.execute({ type: "workspace.read", session_id: command.session_id, at });
          if (!viewed.ok) { this.update({ error: viewed.error.message }); return false; }
          this.update({ snapshot: viewed.snapshot, status: "ready" });
        } else this.update({ snapshot: result.snapshot, status: "ready" });
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
