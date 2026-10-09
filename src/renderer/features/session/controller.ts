import type { SessionBridge, SessionMutation, SessionResult, SessionSnapshot, SessionProgress, ViewPosition } from "../../../shared/session.ts";
import { isLayoutCommand } from "../../../shared/workbench.ts";

/** 资源命令中的取消在历史或同步中也允许，以便随时停止运行。 */
const isCancel = (value: unknown) => typeof value === "object" && value !== null && (value as { type?: unknown }).type === "cancel";
export type SessionView = Omit<SessionSnapshot, "progress">;
type SessionOperation = Exclude<SessionMutation, { type: "start" }>;
/** 工作台可发出的变更：布局、链接、移除与资源创建/命令。 */
export type WorkbenchOperation = Exclude<SessionOperation, { type: "select" }>;
export type SessionViewState = {
  snapshot: SessionView | null; position: ViewPosition; status: "loading" | "ready" | "error"; busy: boolean; error: string | null; missing: boolean;
};
const live: ViewPosition = { kind: "live" };
const emptyProgress: SessionProgress = { revision: 0, version: 0, runningAgentIds: [], unsettledObjectIds: [], live: [] };

/** 一个会话的查看位置、协调投影与操作入口。进度单独订阅，调用方不编排历史查询。 */
export class SessionController {
  private state: SessionViewState = { snapshot: null, position: live, status: "loading", busy: false, error: null, missing: false };
  private progress: SessionProgress = emptyProgress;
  private pendingProgress: SessionProgress | null = null;
  private listeners = new Set<() => void>();
  private progressListeners = new Set<() => void>();
  private viewWaiters = new Set<() => void>();
  private requestedPosition: ViewPosition = live;
  private generation = 0;
  private connections = 0;
  private reading = false;
  private dirty = false;
  private requiredRevision = 0;
  private queue: Promise<unknown> = Promise.resolve();
  private unsubscribe: (() => void) | null = null;
  constructor(private readonly bridge: SessionBridge, readonly sessionId: string) {}
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
  inspect = (nodeId: string | null): void => this.move({ kind: "history", nodeId });
  followCursor = (): void => this.move(live);
  private move(position: ViewPosition): void {
    this.requestedPosition = position;
    this.generation++;
    this.reading = false;
    this.update({ status: "loading", error: null });
    void this.read();
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
    };
  }
  /** 完整读取用于打开、历史定位与持久变化；同一位置的密集通知合并读取。 */
  clearError = (): void => this.update({ error: null });
  refresh = (): Promise<void> => { this.update({ status: "loading", error: null }); return this.read(); };
  private readFailed(message: string, missing = false): void {
    // 失败不提交导航目标；旧画面保持完整，重新读取成功前不接受基于旧数据的领域变更。
    this.requestedPosition = this.state.position;
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
        const position = this.requestedPosition;
        const result = await this.bridge.execute({ type: "read", sessionId: this.sessionId, position });
        if (generation !== this.generation) return;
        if (!result.ok) {
          this.readFailed(result.error.message, result.error.code === "not_found");
          break;
        }
        if (result.reply.kind !== "view" || result.reply.snapshot.sessionId !== this.sessionId) throw new Error("Invalid session view response.");
        const { progress, ...snapshot } = result.reply.snapshot;
        if (snapshot.revision < this.requiredRevision) { this.dirty = true; continue; }
        this.requiredRevision = snapshot.revision;
        this.update({ snapshot, position, status: "ready", missing: false });
        this.acceptProgress(progress);
        const pending = this.pendingProgress;
        this.pendingProgress = null;
        if (pending) this.acceptProgress(pending);
      } while (this.dirty);
    } catch {
      if (generation === this.generation) this.readFailed("The session connection was lost. Reload to read saved progress.");
    } finally { if (generation === this.generation) this.reading = false; }
  }
  /** 命令按会话串行；执行时检查查看模式，返回受理结果不会替换任何展示投影。 */
  execute = (command: SessionOperation): Promise<SessionResult> => {
    // 就绪视图上连续发出的意图可排队；后项等前项投影发布后再检查执行位置。
    // 在同步期间新构造的领域命令仍由门禁拒绝，避免使用旧配置或链接。
    const queuedWithCurrentView = this.state.status === "ready" && !isLayoutCommand(command)
      && command.type !== "select" && !(command.type === "resource.command" && isCancel(command.command));
    const operation = this.queue.then(async () => {
      if (queuedWithCurrentView && this.state.status === "loading" && this.requestedPosition.kind === "live") await this.waitForView();
      return this.perform(command);
    });
    this.queue = operation;
    return operation;
  };
  private waitForView(): Promise<void> {
    return new Promise(resolve => {
      const complete = () => {
        if (this.state.status === "loading" && this.connections > 0 && this.requestedPosition.kind === "live") return;
        this.viewWaiters.delete(complete);
        resolve();
      };
      this.viewWaiters.add(complete);
      complete();
    });
  }
  private async perform(command: SessionOperation): Promise<SessionResult> {
    const reject = (code: "conflict" | "invalid_request", message: string): SessionResult => {
      this.update({ error: message }); return { ok: false, error: { code, message } };
    };
    if (command.sessionId !== this.sessionId) return reject("invalid_request", "The command belongs to another session.");
    if (this.requestedPosition.kind === "history" && !isLayoutCommand(command) && command.type !== "select" && !(command.type === "resource.command" && isCancel(command.command))) {
      return reject("conflict", "History is read-only. Continue from this position before making changes.");
    }
    if (this.state.status !== "ready" && !isLayoutCommand(command) && command.type !== "select" && !(command.type === "resource.command" && isCancel(command.command))) {
      return reject("conflict", this.state.error ?? "Wait for the session view to synchronize before making changes.");
    }
    const position = this.requestedPosition;
    // 在途读取可能早于本次变更；命令完成后统一重新读取当前目标位置。
    this.generation++; this.reading = false;
    // 连线与布局在服务端幂等，不依赖旧投影；不进入加载态，避免卡片随之闪烁。
    const quiet = isLayoutCommand(command) || command.type === "link.set";
    this.update(quiet ? { error: null } : { busy: true, status: "loading", error: null });
    try {
      const result = await this.bridge.execute(command);
      if (!result.ok) this.update({ error: result.error.message });
      else {
        if (result.reply.kind !== "accepted" || result.reply.sessionId !== this.sessionId) throw new Error("Invalid session receipt.");
        if (command.type === "select" && this.requestedPosition === position) this.requestedPosition = live;
      }
      return result;
    } catch {
      const result: SessionResult = { ok: false, error: { code: "unavailable", message: "The session connection was lost. Reload before retrying." } };
      this.update({ error: result.error.message }); return result;
    } finally {
      if (!quiet) this.update({ busy: false });
      void this.read();
    }
  }
  branchFrom = (nodeId: string | null): Promise<SessionResult> => this.execute({ type: "select", sessionId: this.sessionId, nodeId });
  mutate = async (command: WorkbenchOperation): Promise<boolean> => (await this.execute(command)).ok;
}

/** 重试相同输入复用提交身份；收到受理结果后下一次发送使用新身份。 */
export class SubmissionIdentity {
  private pending: { signature: string; id: string } | null = null;
  forInput(value: unknown): string {
    const signature = JSON.stringify(value);
    if (this.pending?.signature !== signature) this.pending = { signature, id: crypto.randomUUID() };
    return this.pending.id;
  }
  accepted(): void { this.pending = null; }
}
