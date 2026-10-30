import type { UiText } from "@asterism-app/sdk/contracts";
import { errorDisplay } from "../../../shared/error-display.ts";
import { applyLive } from "../../../shared/live-patch.ts";
import { viewLive } from "../../../shared/partial-arguments.ts";
import { applySessionNodes } from "../../../shared/session-timeline.ts";
import type { SessionBridge, SessionMutation, SessionResult, SessionData, SessionProgress, SessionChanged, LiveBlock } from "../../../shared/session.ts";

export type SessionView = Omit<SessionData, "progress">;
type SessionOperation = Exclude<SessionMutation, { type: "start" }>;
export type WorkbenchOperation = Exclude<SessionOperation, { type: "select" }>;
export type SessionViewState = {
  data: SessionView | null; status: "loading" | "ready" | "error"; readError: UiText | null; missing: boolean;
  navigating: boolean;
};
/** Low-frequency running state: resource busy state and timeline creation in progress; retain identity when content is unchanged. */
export type SessionActivity = Omit<SessionProgress, "live">;
const emptyActivity: SessionActivity = { busyObjectIds: [], timelineBusy: false };
const emptyLive: readonly LiveBlock[] = [];

/** Group live blocks by object; reuse the previous array for objects whose block identities are all unchanged, so UIs subscribing only to their object do not rerender on other objects' deltas. */
export function groupLive(previous: ReadonlyMap<string, readonly LiveBlock[]>, blocks: readonly LiveBlock[]): Map<string, readonly LiveBlock[]> {
  const grouped = new Map<string, LiveBlock[]>();
  for (const block of blocks) {
    let list = grouped.get(block.objectId);
    if (!list) grouped.set(block.objectId, list = []);
    list.push(block);
  }
  const result = new Map<string, readonly LiveBlock[]>();
  for (const [objectId, list] of grouped) {
    const old = previous.get(objectId);
    result.set(objectId, old && old.length === list.length && old.every((block, index) => block === list[index]) ? old : list);
  }
  return result;
}
function sameActivity(a: SessionActivity, b: SessionActivity): boolean {
  return a.timelineBusy === b.timelineBusy && a.busyObjectIds.length === b.busyObjectIds.length
    && a.busyObjectIds.every(id => b.busyObjectIds.includes(id));
}

/** Obtain current data on opening, then apply backend changes in order; return directly when actions complete. */
export class SessionController {
  private state: SessionViewState = { data: null, status: "loading", navigating: false, readError: null, missing: false };
  private activity: SessionActivity = emptyActivity;
  /** Wire-format streaming blocks: the baseline for applying deltas; display blocks grouped by object derive preview arguments from these. */
  private wire: LiveBlock[] = [];
  private live = new Map<string, readonly LiveBlock[]>();
  private listeners = new Set<() => void>();
  private progressListeners = new Set<() => void>();
  private connections = 0;
  private pending = 0;
  private scope: AbortController | null = null;
  constructor(private readonly bridge: SessionBridge, readonly sessionId: string, private readonly onRelease?: () => void) {}
  getSnapshot = (): SessionViewState => this.state;
  getActivity = (): SessionActivity => this.activity;
  /** The object's own live blocks; deltas for other objects do not change the returned value's identity. */
  liveOf = (objectId: string): readonly LiveBlock[] => this.live.get(objectId) ?? emptyLive;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  subscribeProgress = (listener: () => void) => { this.progressListeners.add(listener); return () => { this.progressListeners.delete(listener); }; };
  private update(patch: Partial<SessionViewState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach(listener => listener());
  }
  private setActivity({ busyObjectIds, timelineBusy }: SessionActivity): void {
    const next = { busyObjectIds, timelineBusy };
    if (!sameActivity(this.activity, next)) this.activity = next;
  }
  private receive(event: SessionChanged): void {
    if (event.sessionId !== this.sessionId) return;
    if (event.kind === "session.opened") {
      const { progress, ...data } = event.data;
      this.wire = progress.live;
      this.live = groupLive(new Map(), this.wire.map(viewLive));
      this.setActivity(progress);
      this.update({ data, status: "ready", readError: null, missing: false });
      this.progressListeners.forEach(listener => listener());
    } else if (event.kind === "session.progress") {
      if (event.live) {
        this.wire = applyLive(this.wire, event.live);
        this.live = groupLive(this.live, this.wire.map(viewLive));
      }
      this.setActivity(event);
      this.progressListeners.forEach(listener => listener());
    } else {
      const current = this.state.data;
      if (!current) return;
      const objects = new Map(event.objects.map(object => [object.id, object]));
      const workbench = event.workbench ?? { ...current.workbench, title: event.title,
        objects: event.objects.length ? current.workbench.objects.map(object => objects.get(object.id) ?? object) : current.workbench.objects,
        ...event.layout };
      this.update({ data: { ...current, title: event.title, cursor: event.cursor, workbench,
        nodes: applySessionNodes(current.nodes, event.nodes, event.completed) } });
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
  /** Initial connection and explicit user retries share the open entry; initial data and subsequent updates arrive in order over the same channel. */
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
