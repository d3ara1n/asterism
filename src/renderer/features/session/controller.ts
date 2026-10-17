import { CancelAgent } from "@atelier/builtin-api/contracts";
import type { UiText } from "@atelier/sdk/contracts";
import { errorDisplay } from "../../../shared/error-display.ts";
import type { SessionBridge, SessionMutation, SessionResult, SessionSnapshot, SessionProgress } from "../../../shared/session.ts";
import { isLayoutCommand } from "../../../shared/workbench.ts";

/** 资源命令中的取消在同步中也允许，以便随时停止运行。 */
const isCancel = (value: unknown) => typeof value === "object" && value !== null && (value as { id?: unknown }).id === CancelAgent.id;
export type SessionView = Omit<SessionSnapshot, "progress">;
type SessionOperation = Exclude<SessionMutation, { type: "start" }>;
/** 会话界面可发出的变更：命名、布局、链接、移除与资源创建/命令。 */
export type WorkbenchOperation = Exclude<SessionOperation, { type: "select" }>;
export type SessionViewState = {
  snapshot: SessionView | null; status: "loading" | "ready" | "error"; busy: boolean; error: UiText | null; missing: boolean;
  /** 显式游标跳转使旧画布定位失效；普通记录追加不打断定位。 */
  selectionVersion: number;
};
const emptyProgress: SessionProgress = { revision: 0, version: 0, unsettledObjectIds: [], runningObjectIds: [], live: [] };

/** 一个会话的当前投影与操作入口；进度单独订阅。 */
export class SessionController {
  private state: SessionViewState = { snapshot: null, status: "loading", busy: false, error: null, missing: false, selectionVersion: 0 };
  private progress: SessionProgress = emptyProgress;
  private pendingProgress: SessionProgress | null = null;
  private listeners = new Set<() => void>();
  private progressListeners = new Set<() => void>();
  private viewWaiters = new Set<() => void>();
  private generation = 0;
  private publishedGeneration = -1;
  private connections = 0;
  private reading = false;
  private dirty = false;
  private requiredRevision = 0;
  private queue: Promise<unknown> = Promise.resolve();
  private unsubscribe: (() => void) | null = null;
  private pending = 0;
  /** onRelease：没有连接与在途命令时调用，所有者据此释放这份前端视图。 */
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
      this.update({ status: "loading", error: null });
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
  /** 推迟到微任务再确认空闲：同步重连（如 StrictMode 重放 effect）不释放视图。 */
  private releaseWhenIdle(): void {
    if (this.connections || this.pending) return;
    queueMicrotask(() => { if (!this.connections && !this.pending) this.onRelease?.(); });
  }
  /** 完整读取用于打开与持久变化；密集通知合并读取。 */
  clearError = (): void => this.update({ error: null });
  refresh = (): Promise<void> => { this.update({ status: "loading", error: null }); return this.read(); };
  private readFailed(message: UiText, missing = false): void {
    // 读取失败保留旧画面，重新同步前不接受基于旧数据的领域变更。
    this.update({ status: "error", error: message, missing });
  }
  private async read(): Promise<void> {
    if (!this.connections) return;
    if (this.reading || this.state.busy) { this.dirty = true; return; }
    const generation = this.generation;
    this.reading = true;
    try {
      do {
        this.dirty = false;
        const result = await this.bridge.execute({ type: "read", sessionId: this.sessionId });
        if (generation !== this.generation) return;
        if (!result.ok) {
          this.readFailed(errorDisplay(result.error), result.error.code === "not_found");
          break;
        }
        if (result.reply.kind !== "view" || result.reply.snapshot.sessionId !== this.sessionId) throw new Error("Invalid session view response.");
        const { progress, ...snapshot } = result.reply.snapshot;
        if (snapshot.revision < this.requiredRevision) { this.dirty = true; continue; }
        this.requiredRevision = snapshot.revision;
        this.publishedGeneration = generation;
        this.update({ snapshot, status: "ready", missing: false, error: this.state.status === "error" ? null : this.state.error });
        this.acceptProgress(progress);
        const pending = this.pendingProgress;
        this.pendingProgress = null;
        if (pending) this.acceptProgress(pending);
      } while (this.dirty);
    } catch {
      if (generation === this.generation) this.readFailed("The session connection was lost. Reload to read saved progress.");
    } finally { if (generation === this.generation) this.reading = false; }
  }
  /** 命令按会话串行；执行时检查同步状态，返回受理结果不会替换任何展示投影。 */
  execute = (command: SessionOperation): Promise<SessionResult> => this.enqueue(command, false);
  /** 等待受理后的读取结束；返回值仍是命令结果，读取错误由视图状态报告。 */
  executeAndRead = (command: SessionOperation): Promise<SessionResult> => this.enqueue(command, true);
  private enqueue(command: SessionOperation, observe: boolean): Promise<SessionResult> {
    // 就绪视图上连续发出的意图可排队；后项等前项投影发布后再检查执行位置。
    // 在同步期间新构造的领域命令仍由门禁拒绝，避免使用旧配置或链接。
    const queuedWithCurrentView = this.state.status === "ready" && !isLayoutCommand(command)
      && command.type !== "select" && !(command.type === "resource.command" && isCancel(command.command));
    let observed: Promise<void> | undefined;
    const operation = this.queue.then(async () => {
      if (queuedWithCurrentView && this.state.status === "loading") await this.waitForView();
      return this.perform(command, observe ? () => {
        // 使受理前开始的读取失效，确认的是此命令之后的真实视图，而非期望状态。
        this.generation++; this.reading = false;
        observed = this.waitForRead(this.generation);
      } : undefined);
    });
    this.queue = operation;
    // 在途命令收束前保留视图，命令与其后的读取仍按本会话串行。
    this.pending++;
    void operation.finally(() => { this.pending--; this.releaseWhenIdle(); });
    // 等待读取不占用命令队列；后续命令可以覆盖状态，最终投影仍结束本次观察。
    return observe ? operation.then(async result => { await observed; return result; }) : operation;
  }
  private waitForRead(generation: number): Promise<void> {
    return new Promise(resolve => {
      const complete = () => {
        if (this.connections > 0 && this.state.status !== "error" && this.publishedGeneration < generation) return;
        this.viewWaiters.delete(complete); resolve();
      };
      this.viewWaiters.add(complete); complete();
    });
  }
  private waitForView(): Promise<void> {
    return new Promise(resolve => {
      const complete = () => {
        if (this.state.status === "loading" && this.connections > 0) return;
        this.viewWaiters.delete(complete);
        resolve();
      };
      this.viewWaiters.add(complete);
      complete();
    });
  }
  private async perform(command: SessionOperation, onAccepted?: () => void): Promise<SessionResult> {
    const reject = (code: "conflict" | "invalid_request", message: string, display?: UiText): SessionResult => {
      const error = { code, message, ...(display !== undefined ? { display } : {}) };
      this.update({ error: errorDisplay(error) }); return { ok: false, error };
    };
    if (command.sessionId !== this.sessionId) return reject("invalid_request", "The command belongs to another session.");
    if (this.state.status !== "ready" && !isLayoutCommand(command) && command.type !== "select" && !(command.type === "resource.command" && isCancel(command.command))) {
      return reject("conflict", "Wait for the session view to synchronize before making changes.", this.state.error ?? undefined);
    }
    // 在途读取可能早于本次变更；命令完成后统一重新读取执行游标。
    this.generation++; this.reading = false;
    // 连线与布局在服务端幂等，不依赖旧投影；不进入加载态，避免卡片随之闪烁。
    const quiet = isLayoutCommand(command) || command.type === "link.set";
    this.update(quiet ? { error: null } : { busy: true, status: "loading", error: null,
      selectionVersion: this.state.selectionVersion + Number(command.type === "select") });
    try {
      const result = await this.bridge.execute(command);
      if (!result.ok) this.update({ error: errorDisplay(result.error) });
      else {
        if (result.reply.kind !== "accepted" || result.reply.sessionId !== this.sessionId) throw new Error("Invalid session receipt.");
        onAccepted?.();
      }
      return result;
    } catch {
      const result: SessionResult = { ok: false, error: { code: "unavailable", message: "The session connection was lost. Reload before retrying." } };
      this.update({ error: errorDisplay(result.error) }); return result;
    } finally {
      if (!quiet) this.update({ busy: false });
      void this.read();
    }
  }
  /** 取消准备中的创建：绕过命令队列，否则会排在被取消的创建之后。 */
  cancelCreation = async (requestId: string): Promise<void> => {
    await this.bridge.execute({ type: "resource.create.cancel", sessionId: this.sessionId, requestId }).catch(() => undefined);
  };
  branchFrom = (nodeId: string | null): Promise<SessionResult> => this.execute({ type: "select", sessionId: this.sessionId, nodeId });
  mutate = async (command: WorkbenchOperation): Promise<boolean> => (await this.execute(command)).ok;
}
