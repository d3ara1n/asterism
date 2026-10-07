import type { ConversationBridge, ConversationCommand, ConversationResult, ConversationSnapshot } from "../../../shared/conversation.ts";

export type ConversationState = { snapshot: ConversationSnapshot | null; loading: boolean; busy: boolean; error: string | null; missing: boolean };
/** 订阅在查询前建立，合并密集通知；只接受不倒退的已提交版本，卸载不取消模型执行。 */
export class ConversationController {
  private state: ConversationState = { snapshot: null, loading: true, busy: false, error: null, missing: false };
  private listeners = new Set<() => void>();
  private generation = 0;
  private connected = false;
  private reading = false;
  private dirty = false;
  constructor(private readonly bridge: ConversationBridge, readonly taskId: string, readonly agentId: string) {}
  getSnapshot = (): ConversationState => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(patch: Partial<ConversationState>) { this.state = { ...this.state, ...patch }; this.listeners.forEach(listener => listener()); }
  private accept(snapshot: ConversationSnapshot) {
    if (snapshot.taskId !== this.taskId || snapshot.agentId !== this.agentId || snapshot.seq < (this.state.snapshot?.seq ?? 0)) return;
    this.update({ snapshot, loading: false, missing: false });
  }
  connect(): () => void {
    this.connected = true;
    const generation = ++this.generation;
    const unsubscribe = this.bridge.onChanged(event => {
      if (event.taskId === this.taskId && event.agentId === this.agentId && event.seq > (this.state.snapshot?.seq ?? 0)) void this.refresh();
    });
    void this.refresh();
    return () => {
      unsubscribe();
      if (generation !== this.generation) return;
      this.connected = false; this.generation++; this.reading = false;
    };
  }
  refresh = async (): Promise<void> => {
    if (!this.connected) return;
    if (this.reading) { this.dirty = true; return; }
    const generation = this.generation;
    this.reading = true;
    try {
      do {
        this.dirty = false;
        const result = await this.bridge.execute({ type: "read", taskId: this.taskId, agentId: this.agentId });
        if (generation !== this.generation) return;
        if (result.ok) { this.accept(result.snapshot); this.update({ error: null }); }
        else { this.update({ loading: false, error: result.error.message, missing: result.error.code === "not_found" }); break; }
      } while (this.dirty);
    } catch {
      if (generation === this.generation) this.update({ loading: false, error: "The conversation connection was lost. Reload to read saved progress." });
    } finally { if (generation === this.generation) this.reading = false; }
  };
  execute = async (command: ConversationCommand): Promise<ConversationResult> => {
    if (this.state.busy) return { ok: false, error: { code: "conflict", message: "A conversation command is already pending." } };
    this.update({ busy: true, error: null });
    try {
      const result = await this.bridge.execute(command);
      if (result.ok) this.accept(result.snapshot);
      else this.update({ error: result.error.message });
      return result;
    } catch {
      const result: ConversationResult = { ok: false, error: { code: "unavailable", message: "The conversation connection was lost. Reload before retrying." } };
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
