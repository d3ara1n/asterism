import { SessionTitleChanged, type EventSubscriber, type UiText } from "@atelier/sdk/contracts";

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
  /** 订阅生效后收到的标题；之后读取的列表快照以它为准，避免旧快照覆盖新标题。 */
  private titles = new Map<string, string>();
  constructor(private readonly bridge: Pick<DesktopBridge, "execute" | "onStatus" | "session">,
    private readonly events?: EventSubscriber, private readonly settleMs = 300) {}
  getSnapshot = (): ApplicationState => this.state;
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(next: Partial<ApplicationState>): void {
    this.state = { ...this.state, ...next };
    const snapshot = this.state.snapshot;
    if (snapshot && this.titles.size && snapshot.sessions.some(session => this.titles.has(session.id) && this.titles.get(session.id) !== session.title))
      this.state.snapshot = { ...snapshot, sessions: snapshot.sessions.map(session => ({ ...session, title: this.titles.get(session.id) ?? session.title })) };
    this.listeners.forEach(listener => listener());
  }
  /** 先订阅标题再读取列表；断连后重新订阅并重读，不依赖补发。 */
  private watchTitles(): () => void {
    this.titles.clear();
    const subscription = this.events?.subscribe(SessionTitleChanged, { delivery: "latest" }, event => {
      this.titles.set(event.data.sessionId, event.data.title);
      this.update({});
    });
    return () => subscription?.close();
  }
  connect(): () => void {
    let stopTitles = this.watchTitles();
    const unsubscribe = this.bridge.onStatus(status => {
      if (status === "ready" && this.state.status !== "ready" && this.state.status !== "starting") {
        stopTitles(); stopTitles = this.watchTitles(); void this.refresh({ quiet: true });
      }
      this.update({ status, ...(status === "unavailable" ? { error: commonMessages.runtimeStopped } : {}) });
    });
    // 标题经公共标题事件即时更新；会话提交通知只用于列表结构（新增、删除）的合并重读。
    const stopSessions = this.bridge.session.onChanged(event => {
      if (event.kind !== "session.changed" || this.pending) return;
      this.pending = setTimeout(() => { this.pending = null; void this.refresh({ quiet: true }); }, this.settleMs);
    });
    void this.refresh();
    return () => {
      unsubscribe(); stopSessions(); stopTitles();
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
