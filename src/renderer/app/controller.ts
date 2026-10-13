import type { UiText } from "@atelier/sdk/contracts";

import type { AppSnapshot, DesktopBridge, RuntimeStatus } from "../../shared/contracts";
import { errorDisplay } from "../../shared/error-display";
import { commonMessages } from "../messages/common";

export type ApplicationState = { snapshot: AppSnapshot | null; busy: boolean; error: UiText | null; status: RuntimeStatus };
/** 应用只管理列表和连接状态；刷新列表不能改变会话视图或导航。 */
export class ApplicationController {
  private state: ApplicationState = { snapshot: null, busy: false, error: null, status: "starting" };
  private listeners = new Set<() => void>();
  private reading = false;
  private dirty = false;
  private pending: ReturnType<typeof setTimeout> | null = null;
  constructor(private readonly bridge: Pick<DesktopBridge, "execute" | "onStatus" | "session">, private readonly settleMs = 300) {}
  getSnapshot = (): ApplicationState => this.state;
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(next: Partial<ApplicationState>): void {
    this.state = { ...this.state, ...next };
    this.listeners.forEach(listener => listener());
  }
  connect(): () => void {
    const unsubscribe = this.bridge.onStatus(status => this.update({ status, ...(status === "unavailable" ? { error: commonMessages.runtimeStopped } : {}) }));
    // 应用层观察业务层：任一会话提交（含后台会话自动命名）都可能改变列表标题；无专门名称通道，合并一段时间内的通知后静默重读。
    const stopSessions = this.bridge.session.onChanged(event => {
      if (event.kind !== "session.changed" || this.pending) return;
      this.pending = setTimeout(() => { this.pending = null; void this.refresh({ quiet: true }); }, this.settleMs);
    });
    void this.refresh();
    return () => {
      unsubscribe(); stopSessions();
      if (this.pending) { clearTimeout(this.pending); this.pending = null; }
    };
  }
  clearError = (): void => this.update({ error: null });
  /** quiet 用于后台同步：不标记忙碌、不清除错误，避免侧栏随会话运行闪烁禁用。 */
  refresh = async ({ quiet = false }: { quiet?: boolean } = {}): Promise<void> => {
    if (this.reading) { this.dirty = true; return; }
    this.reading = true;
    if (!quiet) this.update({ busy: true, error: null });
    try {
      do {
        this.dirty = false;
        const result = await this.bridge.execute({ type: "workspace.read" });
        if (result.ok) this.update({ snapshot: result.snapshot, status: "ready" });
        else this.update({ error: errorDisplay(result.error), ...(result.error.code === "unavailable" ? { status: "unavailable" as const } : {}) });
      } while (this.dirty);
    } catch { this.update({ status: "unavailable", error: commonMessages.connectionLost }); }
    finally { this.reading = false; if (!quiet) this.update({ busy: false }); }
  };
}
