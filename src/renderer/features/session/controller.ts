import type { UiText } from "@atelier/sdk/contracts";
import { errorDisplay } from "../../../shared/error-display.ts";
import { applyLive } from "../../../shared/live-patch.ts";
import { viewLive } from "../../../shared/partial-arguments.ts";
import type { SessionBridge, SessionMutation, SessionResult, SessionData, SessionProgress, SessionChanged, LiveBlock } from "../../../shared/session.ts";

export type SessionView = Omit<SessionData, "progress">;
type SessionOperation = Exclude<SessionMutation, { type: "start" }>;
export type WorkbenchOperation = Exclude<SessionOperation, { type: "select" }>;
export type SessionViewState = {
  data: SessionView | null; status: "loading" | "ready" | "error"; readError: UiText | null; missing: boolean;
  navigating: boolean;
};
const emptyProgress: SessionProgress = { busyObjectIds: [], timelineBusy: false, live: [] };

/** 打开时取得当前数据，之后按序应用后台变化；动作完成直接返回。 */
export class SessionController {
  private state: SessionViewState = { data: null, status: "loading", navigating: false, readError: null, missing: false };
  private progress: SessionProgress = emptyProgress;
  /** 线上形态的流式块：增量的应用基线；对外的 progress.live 由此推导预览参数。 */
  private wire: LiveBlock[] = [];
  private listeners = new Set<() => void>();
  private progressListeners = new Set<() => void>();
  private connections = 0;
  private pending = 0;
  private scope: AbortController | null = null;
  constructor(private readonly bridge: SessionBridge, readonly sessionId: string, private readonly onRelease?: () => void) {}
  getSnapshot = (): SessionViewState => this.state;
  getProgress = (): SessionProgress => this.progress;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  subscribeProgress = (listener: () => void) => { this.progressListeners.add(listener); return () => { this.progressListeners.delete(listener); }; };
  private update(patch: Partial<SessionViewState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach(listener => listener());
  }
  private receive(event: SessionChanged): void {
    if (event.sessionId !== this.sessionId) return;
    if (event.kind === "session.opened") {
      const { progress, ...data } = event.data;
      this.wire = progress.live;
      this.progress = { ...progress, live: progress.live.map(viewLive) };
      this.update({ data, status: "ready", readError: null, missing: false });
      this.progressListeners.forEach(listener => listener());
    } else if (event.kind === "session.progress") {
      const { busyObjectIds, timelineBusy, live } = event;
      if (live) this.wire = applyLive(this.wire, live);
      this.progress = { busyObjectIds, timelineBusy, live: live ? this.wire.map(viewLive) : this.progress.live };
      this.progressListeners.forEach(listener => listener());
    } else {
      const current = this.state.data;
      if (!current) return;
      const objects = new Map(event.objects.map(object => [object.id, object]));
      const workbench = event.workbench ?? { ...current.workbench, title: event.title,
        objects: event.objects.length ? current.workbench.objects.map(object => objects.get(object.id) ?? object) : current.workbench.objects,
        ...event.layout };
      this.update({ data: { ...current, title: event.title, cursor: event.cursor, workbench,
        nodes: event.nodes.length ? [...current.nodes, ...event.nodes] : current.nodes } });
    }
  }
  connect(): () => void {
    if (this.connections++ === 0) {
      const scope = this.scope = new AbortController();
      const unsubscribe = this.bridge.onChanged(event => { if (!scope.signal.aborted) this.receive(event); });
      scope.signal.addEventListener("abort", unsubscribe, { once: true });
      void this.refresh();
    }
    let open = true;
    return () => {
      if (!open) return;
      open = false;
      if (--this.connections > 0) return;
      this.scope?.abort(); this.scope = null;
      void this.bridge.execute({ type: "unwatch", sessionId: this.sessionId });
      this.releaseWhenIdle();
    };
  }
  private releaseWhenIdle(): void {
    if (this.connections || this.pending) return;
    queueMicrotask(() => { if (!this.connections && !this.pending) this.onRelease?.(); });
  }
  /** 首次连接和用户主动重试共用打开入口；初始数据与后续更新在同一通道顺序交付。 */
  refresh = async (): Promise<void> => {
    const scope = this.scope;
    if (!scope) return;
    try {
      const result = await this.bridge.execute({ type: "watch", sessionId: this.sessionId });
      if (!scope.signal.aborted && !result.ok)
        this.update({ status: "error", readError: errorDisplay(result.error), missing: result.error.code === "not_found" });
    } catch {
      if (!scope.signal.aborted) this.update({ status: "error", readError: "The session connection was lost. Reopen the session to retry." });
    }
  };
  execute = async (command: SessionOperation): Promise<SessionResult> => {
    if (command.sessionId !== this.sessionId || !this.connections || this.state.status !== "ready")
      return { ok: false, error: { code: "unavailable", message: "Open the current session before making changes." } };
    const navigating = command.type === "select";
    if (navigating) this.update({ navigating: true });
    this.pending++;
    try { return await this.bridge.execute(command); }
    catch { return { ok: false, error: { code: "unavailable", message: "The session connection was lost." } }; }
    finally {
      if (navigating) this.update({ navigating: false });
      this.pending--; this.releaseWhenIdle();
    }
  };
  cancelCreation = async (requestId: string): Promise<void> => {
    await this.bridge.execute({ type: "resource.create.cancel", sessionId: this.sessionId, requestId });
  };
  branchFrom = (nodeId: string | null): Promise<SessionResult> => this.execute({ type: "select", sessionId: this.sessionId, nodeId });
}
