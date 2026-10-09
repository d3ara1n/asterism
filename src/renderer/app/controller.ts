import { t } from "../shared/i18n";
import type { AppSnapshot, DesktopBridge, RuntimeStatus } from "../../shared/contracts";

export type ApplicationState = { snapshot: AppSnapshot | null; busy: boolean; error: string | null; status: RuntimeStatus };
/** 应用只管理列表和连接状态；刷新列表不能改变会话视图或导航。 */
export class ApplicationController {
  private state: ApplicationState = { snapshot: null, busy: false, error: null, status: "starting" };
  private listeners = new Set<() => void>();
  private reading = false;
  private dirty = false;
  constructor(private readonly bridge: Pick<DesktopBridge, "execute" | "onStatus">) {}
  getSnapshot = (): ApplicationState => this.state;
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(next: Partial<ApplicationState>): void {
    this.state = { ...this.state, ...next };
    this.listeners.forEach(listener => listener());
  }
  connect(): () => void {
    const unsubscribe = this.bridge.onStatus(status => this.update({ status, ...(status === "unavailable" ? { error: t.runtimeStopped } : {}) }));
    void this.refresh();
    return unsubscribe;
  }
  clearError = (): void => this.update({ error: null });
  refresh = async (): Promise<void> => {
    if (this.reading) { this.dirty = true; return; }
    this.reading = true;
    this.update({ busy: true, error: null });
    try {
      do {
        this.dirty = false;
        const result = await this.bridge.execute({ type: "workspace.read" });
        if (result.ok) this.update({ snapshot: result.snapshot, status: "ready" });
        else this.update({ error: result.error.message, ...(result.error.code === "unavailable" ? { status: "unavailable" as const } : {}) });
      } while (this.dirty);
    } catch { this.update({ status: "unavailable", error: t.connectionLost }); }
    finally { this.reading = false; this.update({ busy: false }); }
  };
}
