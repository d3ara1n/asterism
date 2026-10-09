import type { SessionBridge, SessionCommand, SessionResult, SessionSnapshot } from "../../../shared/session.ts";

/** inspected 为正在查看的历史节点；只是视图位置，不改变会话游标。 */
export type SessionViewState = { snapshot: SessionSnapshot | null; loading: boolean; busy: boolean; error: string | null; missing: boolean; inspected?: string };
/** 每个会话一个控制器：订阅先于查询，合并密集通知；只接受不倒退的版本，卸载不取消执行。 */
export class SessionController {
  private state: SessionViewState = { snapshot: null, loading: true, busy: false, error: null, missing: false };
  private listeners = new Set<() => void>();
  private generation = 0;
  private connections = 0;
  private reading = false;
  private dirty = false;
  private unsubscribe: (() => void) | null = null;
  constructor(private readonly bridge: SessionBridge, readonly sessionId: string) {}
  getSnapshot = (): SessionViewState => this.state;
  inspect = (nodeId: string | undefined): void => this.update({ inspected: nodeId });
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(patch: Partial<SessionViewState>) { this.state = { ...this.state, ...patch }; this.listeners.forEach(listener => listener()); }
  private accept(snapshot: SessionSnapshot) {
    const current = this.state.snapshot;
    if (snapshot.sessionId !== this.sessionId || snapshot.seq < (current?.seq ?? 0) || snapshot.selectionRevision < (current?.selectionRevision ?? 0)) return;
    this.update({ snapshot, loading: false, missing: false });
  }
  /** 卡片与历史浮岛可同时连接；最后一个断开才停止订阅。 */
  connect(): () => void {
    if (this.connections++ === 0) {
      this.generation++;
      this.unsubscribe = this.bridge.onChanged(event => {
        const current = this.state.snapshot;
        if (event.sessionId === this.sessionId && (event.seq > (current?.seq ?? 0) || event.selectionRevision > (current?.selectionRevision ?? 0))) void this.refresh();
      });
      void this.refresh();
    }
    let open = true;
    return () => {
      if (!open) return;
      open = false;
      if (--this.connections > 0) return;
      this.unsubscribe?.(); this.unsubscribe = null;
      this.generation++; this.reading = false;
    };
  }
  refresh = async (): Promise<void> => {
    if (!this.connections) return;
    if (this.reading) { this.dirty = true; return; }
    const generation = this.generation;
    this.reading = true;
    try {
      do {
        this.dirty = false;
        const result = await this.bridge.execute({ type: "read", sessionId: this.sessionId });
        if (generation !== this.generation) return;
        if (result.ok) { this.accept(result.snapshot); this.update({ error: null }); }
        else { this.update({ loading: false, error: result.error.message, missing: result.error.code === "not_found" }); break; }
      } while (this.dirty);
    } catch {
      if (generation === this.generation) this.update({ loading: false, error: "The session connection was lost. Reload to read saved progress." });
    } finally { if (generation === this.generation) this.reading = false; }
  };
  execute = async (command: SessionCommand): Promise<SessionResult> => {
    if (this.state.busy) return { ok: false, error: { code: "conflict", message: "A session command is already pending." } };
    this.update({ busy: true, error: null });
    try {
      const result = await this.bridge.execute(command);
      if (result.ok) this.accept(result.snapshot);
      else this.update({ error: result.error.message });
      return result;
    } catch {
      const result: SessionResult = { ok: false, error: { code: "unavailable", message: "The session connection was lost. Reload before retrying." } };
      this.update({ error: result.error.message }); return result;
    } finally { this.update({ busy: false }); }
  };
}

/** 丢失响应后重发相同输入仍使用同一提交身份；只有接受成功后才释放。 */
export class SubmissionIdentity {
  private pending: { signature: string; id: string } | null = null;
  forInput(value: unknown): string {
    const signature = JSON.stringify(value);
    if (this.pending?.signature !== signature) this.pending = { signature, id: crypto.randomUUID() };
    return this.pending.id;
  }
  accepted(): void { this.pending = null; }
}
