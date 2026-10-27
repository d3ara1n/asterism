import { ResourceStatusChanged, ResourcePresenceChanged, SessionTitleChanged, type EventSubscriber, type UiText } from "@asterism-app/sdk/contracts";

import type { AppSnapshot, DesktopBridge, RuntimeStatus } from "../../shared/contracts";
import type { RuntimeBridge } from "../../shared/connection";
import { errorDisplay } from "../../shared/error-display";
import { commonMessages } from "@asterism-app/ui/messages/common";
import type { ResourceStatusMark } from "./resource-status";

export type ApplicationState = {
  snapshot: AppSnapshot | null;
  busy: boolean;
  error: UiText | null;
  status: RuntimeStatus;
  resourceStatuses: readonly ResourceStatusMark[];
};
/** The application manages lists, resource states, and connection state; refreshing a list must not change the session view or navigation. */
export class ApplicationController {
  private state: ApplicationState = { snapshot: null, busy: false, error: null, status: "starting", resourceStatuses: [] };
  private visibleSessionId: string | null = null;
  private listeners = new Set<() => void>();
  private reading = false;
  private dirty = false;
  private pending: ReturnType<typeof setTimeout> | null = null;
  /** Titles received after the subscription takes effect; subsequent list snapshots use these to prevent old snapshots from overwriting new titles. */
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
  /** Subscribe to titles before reading the list; after disconnection, resubscribe and reread without relying on replay. */
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
      // The public contract requires a resource source; identity is validated at the host publishing entry.
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
  /** After uniformly replacing any of the four states, consume terminal states already viewed; identical display data does not trigger a refresh. */
  private setResourceStatuses(marks: readonly ResourceStatusMark[]): void {
    const resourceStatuses = marks.filter(mark => mark.status === "running" || mark.resource.sessionId !== this.visibleSessionId);
    if (JSON.stringify(resourceStatuses) !== JSON.stringify(this.state.resourceStatuses))
      this.update({ resourceStatuses });
  }
  /** Viewing consumes only terminal states; running and its progress remain, and opening a popup does not count as entering the session. */
  setVisibleSession(sessionId: string | null): void {
    this.visibleSessionId = sessionId;
    this.setResourceStatuses(this.state.resourceStatuses);
  }
  connect({ read = true }: { read?: boolean } = {}): () => void {
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
    // Public title events update titles immediately; session commit notifications only coalesce rereads for list structure changes (additions and deletions).
    const stopSessions = this.bridge.session.onChanged(event => {
      if (event.kind !== "session.changed" || this.pending) return;
      this.pending = setTimeout(() => { this.pending = null; void this.refresh({ quiet: true }); }, this.settleMs);
    });
    if (read) void this.refresh();
    return () => {
      unsubscribe(); stopSessions(); stopTitles(); stopResourceStatuses();
      if (this.pending) { clearTimeout(this.pending); this.pending = null; }
    };
  }
  clearError = (): void => this.update({ error: null });
  /** quiet is for background synchronization: it neither marks busy nor clears errors, preventing sidebar flicker and disabling as sessions run. */
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
