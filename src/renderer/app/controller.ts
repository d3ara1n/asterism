import { ResourceStatusChanged, ResourcePresenceChanged, SessionTitleChanged, type EventSubscriber, type UiText } from "@atelier/sdk/contracts";

import type { AppSnapshot, DesktopBridge, RuntimeStatus } from "../../shared/contracts";
import type { RuntimeBridge } from "../../shared/connection";
import { errorDisplay } from "../../shared/error-display";
import { commonMessages } from "@atelier/ui/messages/common";
import type { ResourceStatusMark } from "./resource-status";

export type ApplicationState = {
  snapshot: AppSnapshot | null;
  busy: boolean;
  error: UiText | null;
  status: RuntimeStatus;
  resourceStatuses: readonly ResourceStatusMark[];
};
/** 应用管理列表、资源状态和连接状态；刷新列表不能改变会话视图或导航。 */
export class ApplicationController {
  private state: ApplicationState = { snapshot: null, busy: false, error: null, status: "starting", resourceStatuses: [] };
  private visibleSessionId: string | null = null;
  private listeners = new Set<() => void>();
  private reading = false;
  private dirty = false;
  private pending: ReturnType<typeof setTimeout> | null = null;
  /** 订阅生效后收到的标题；之后读取的列表快照以它为准，避免旧快照覆盖新标题。 */
  private titles = new Map<string, string>();
  constructor(private readonly bridge: Pick<RuntimeBridge, "execute" | "session"> & Pick<DesktopBridge, "onStatus">,
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
  private watchResourceStatuses(): () => void {
    const presence = this.events?.subscribe(ResourcePresenceChanged, {}, ({ data }) => {
      const removed = new Set(data.disappeared);
      this.setResourceStatuses(this.state.resourceStatuses.filter(mark => mark.resource.sessionId !== data.sessionId || !removed.has(mark.resource.id)));
    });
    const subscription = this.events?.subscribe(ResourceStatusChanged, { delivery: "latest" }, event => {
      // 公共契约要求资源来源，身份由宿主发布入口校验。
      const resource = event.source!.resource!;
      const mark: ResourceStatusMark = { ...event.data, resource };
      const marks = [...this.state.resourceStatuses];
      const index = marks.findIndex(item => item.resource.id === resource.id);
      if (index < 0) marks.push(mark);
      else marks[index] = mark;
      this.setResourceStatuses(marks);
    });
    return () => { subscription?.close(); presence?.close(); };
  }
  /** 四种状态统一替换后，消费已查看的终态；相同展示数据不触发刷新。 */
  private setResourceStatuses(marks: readonly ResourceStatusMark[]): void {
    const resourceStatuses = marks.filter(mark => mark.status === "running" || mark.resource.sessionId !== this.visibleSessionId);
    if (JSON.stringify(resourceStatuses) !== JSON.stringify(this.state.resourceStatuses))
      this.update({ resourceStatuses });
  }
  /** 查看只消费终态；running 及其进度保留，打开 popup 不算进入会话。 */
  setVisibleSession(sessionId: string | null): void {
    this.visibleSessionId = sessionId;
    this.setResourceStatuses(this.state.resourceStatuses);
  }
  connect(): () => void {
    let stopTitles = this.watchTitles();
    let stopResourceStatuses = this.watchResourceStatuses();
    const unsubscribe = this.bridge.onStatus(status => {
      if (status === "ready" && this.state.status !== "ready" && this.state.status !== "starting") {
        stopTitles(); stopTitles = this.watchTitles();
        stopResourceStatuses(); stopResourceStatuses = this.watchResourceStatuses();
        void this.refresh({ quiet: true });
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
      unsubscribe(); stopSessions(); stopTitles(); stopResourceStatuses();
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
        if (result.ok) this.update({ snapshot: result.snapshot, status: "ready", error: null });
        else this.update({ error: errorDisplay(result.error), ...(result.error.code === "unavailable" ? { status: "unavailable" as const } : {}) });
      } while (this.dirty);
    } catch { this.update({ status: "unavailable", error: commonMessages.connectionLost }); }
    finally { this.reading = false; if (!quiet) this.update({ busy: false }); }
  };
}
