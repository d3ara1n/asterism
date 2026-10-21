import type { UiText } from "@atelier/sdk/contracts";
import { errorDisplay } from "../../../shared/error-display.ts";
import type { SessionBridge, SessionMutation, SessionResult, SessionSnapshot, SessionProgress } from "../../../shared/session.ts";

export type SessionView = Omit<SessionSnapshot, "progress">;
type SessionOperation = Exclude<SessionMutation, { type: "start" }>;
export type WorkbenchOperation = Exclude<SessionOperation, { type: "select" }>;
export type SessionViewState = {
  snapshot: SessionView | null; status: "loading" | "ready" | "error"; readError: UiText | null; missing: boolean;
  /** 只有执行游标切换暂时关闭旧路径上的操作；普通命令由发起视图管理等待。 */
  navigating: boolean;
  selectionVersion: number;
};
const emptyProgress: SessionProgress = { revision: 0, version: 0, busyObjectIds: [], timelineBusy: false, live: [] };

/** 会话只拥有可查询投影、进度及游标切换；局部操作状态由调用者拥有。 */
export class SessionController {
  private state: SessionViewState = { snapshot: null, status: "loading", navigating: false, readError: null, missing: false, selectionVersion: 0 };
  private progress: SessionProgress = emptyProgress;
  private pendingProgress: SessionProgress | null = null;
  private listeners = new Set<() => void>();
  private progressListeners = new Set<() => void>();
  private viewWaiters = new Set<() => void>();
  private generation = 0;
  private completedReadGeneration = -1;
  private connections = 0;
  private reading = false;
  private dirty = false;
  private requiredRevision = 0;
  private unsubscribe: (() => void) | null = null;
  private pending = 0;
  constructor(private readonly bridge: SessionBridge, readonly sessionId: string, private readonly onRelease?: () => void) {}
  getSnapshot = (): SessionViewState => this.state;
  getProgress = (): SessionProgress => this.progress;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  subscribeProgress = (listener: () => void) => { this.progressListeners.add(listener); return () => { this.progressListeners.delete(listener); }; };
  private update(patch: Partial<SessionViewState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach(listener => listener());
    this.viewWaiters.forEach(waiter => waiter());
  }
  private acceptProgress(progress: SessionProgress): void {
    if (progress.version < this.progress.version) return;
    if (!this.state.snapshot || progress.revision > this.state.snapshot.revision) {
      if (!this.pendingProgress || progress.version >= this.pendingProgress.version) this.pendingProgress = progress;
      this.requiredRevision = Math.max(this.requiredRevision, progress.revision);
      void this.read();
      return;
    }
    this.progress = progress;
    this.progressListeners.forEach(listener => listener());
  }
  connect(): () => void {
    if (this.connections++ === 0) {
      this.generation++;
      if (!this.state.snapshot) this.update({ status: "loading", readError: null });
      this.unsubscribe = this.bridge.onChanged(event => {
        if (event.sessionId !== this.sessionId) return;
        if (event.kind === "session.progress") this.acceptProgress(event.progress);
        else { this.requiredRevision = Math.max(this.requiredRevision, event.revision); void this.read(); }
      });
      void this.read();
    }
    let open = true;
    return () => {
      if (!open) return;
      open = false;
      if (--this.connections > 0) return;
      this.unsubscribe?.(); this.unsubscribe = null;
      this.generation++; this.reading = false;
      this.viewWaiters.forEach(waiter => waiter());
      this.releaseWhenIdle();
    };
  }
  private releaseWhenIdle(): void {
    if (this.connections || this.pending) return;
    queueMicrotask(() => { if (!this.connections && !this.pending) this.onRelease?.(); });
  }
  /** 有内容时后台更新保留就绪画面；查询失败单独反馈。 */
  refresh = (): Promise<void> => this.read();
  private async read(): Promise<void> {
    if (!this.connections) return;
    if (this.reading) { this.dirty = true; return; }
    const generation = this.generation;
    this.reading = true;
    try {
      do {
        this.dirty = false;
        const result = await this.bridge.execute({ type: "read", sessionId: this.sessionId });
        if (generation !== this.generation) return;
        if (!result.ok) {
          this.completedReadGeneration = generation;
          this.update({ status: "error", readError: errorDisplay(result.error), missing: result.error.code === "not_found" });
          break;
        }
        if (result.reply.kind !== "view" || result.reply.snapshot.sessionId !== this.sessionId) throw new Error("Invalid session view response.");
        const { progress, ...snapshot } = result.reply.snapshot;
        if (snapshot.revision < this.requiredRevision) { this.dirty = true; continue; }
        this.requiredRevision = snapshot.revision;
        this.completedReadGeneration = generation;
        this.update({ snapshot, status: "ready", missing: false, readError: null });
        this.acceptProgress(progress);
        const pending = this.pendingProgress;
        this.pendingProgress = null;
        if (pending) this.acceptProgress(pending);
      } while (this.dirty);
    } catch {
      if (generation === this.generation) {
        this.completedReadGeneration = generation;
        this.update({ status: "error", readError: "The session connection was lost. Reload to read saved progress." });
      }
    } finally { if (generation === this.generation) this.reading = false; }
  }
  execute = (command: SessionOperation): Promise<SessionResult> => this.enqueue(command, false);
  /** 局部调用可等待回执后的投影；等待期间不改变工作台可用性。 */
  executeAndRead = (command: SessionOperation): Promise<SessionResult> => this.enqueue(command, true);
  private enqueue(command: SessionOperation, observe: boolean): Promise<SessionResult> {
    if (this.state.navigating) return Promise.resolve(this.rejected("The session position is changing. Read the current view before retrying."));
    let observed: Promise<void> | undefined;
    this.pending++;
    // 后台按对象串行写入；前端的独立对象调用不互相排队。
    const operation = this.perform(command, observe ? pending => { observed = pending; } : undefined);
    const result = observe ? operation.then(async result => { await observed; return result; }) : operation;
    return result.finally(() => { this.pending--; this.releaseWhenIdle(); });
  }
  private rejected(message: string): SessionResult {
    return { ok: false, error: { code: "conflict", message } };
  }
  private waitForRead(generation: number): Promise<void> {
    return new Promise(resolve => {
      const complete = () => {
        if (this.connections > 0 && this.completedReadGeneration < generation) return;
        this.viewWaiters.delete(complete); resolve();
      };
      this.viewWaiters.add(complete); complete();
    });
  }
  private async perform(command: SessionOperation, observe?: (pending: Promise<void>) => void): Promise<SessionResult> {
    if (command.sessionId !== this.sessionId) return this.rejected("The command belongs to another session.");
    if (!this.connections || this.state.status !== "ready") return this.rejected("Read the current session view before making changes.");
    const navigating = command.type === "select";
    if (navigating) this.update({ navigating: true, selectionVersion: this.state.selectionVersion + 1 });
    let result: SessionResult;
    try {
      result = await this.bridge.execute(command);
      if (result.ok && (result.reply.kind !== "accepted" || result.reply.sessionId !== this.sessionId))
        throw new Error("Invalid session receipt.");
    }
    catch { result = { ok: false, error: { code: "unavailable", message: "The session connection was lost. Reload before retrying." } }; }
    // 回执后的读取与后台占用无关；旧查询不能覆盖这次更新，游标切换等待目标投影。
    this.generation++; this.reading = false;
    const read = this.waitForRead(this.generation);
    observe?.(read);
    void this.read();
    if (navigating) {
      await read;
      this.update({ navigating: false });
    }
    return result;
  }
  cancelCreation = async (requestId: string): Promise<void> => {
    await this.bridge.execute({ type: "resource.create.cancel", sessionId: this.sessionId, requestId }).catch(() => undefined);
  };
  branchFrom = (nodeId: string | null): Promise<SessionResult> => this.execute({ type: "select", sessionId: this.sessionId, nodeId });
}
