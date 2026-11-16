import { ResourceNoticeRaised, ResourceActivitiesChanged, ReadResourceActivities, ResourcePresenceChanged, SessionTitleChanged, type EventSubscriber, type PluginCalls, type ResourceActivity, type UiText } from "@asterism-app/sdk/contracts";

import type { AppSnapshot, Command, DesktopBridge, RuntimeStatus } from "../../shared/contracts";
import type { RuntimeBridge } from "../../shared/connection";
import { errorDisplay, failureDisplay } from "../../shared/error-display";
import { commonMessages } from "@asterism-app/ui/messages/common";
import type { ResourceNoticeMark } from "./resource-status";
import { resourceStatusMessages } from "../messages/resource-status";

export type ApplicationState = {
  snapshot: AppSnapshot | null;
  busy: boolean;
  error: UiText | null;
  status: RuntimeStatus;
  resourceActivities: readonly ResourceActivity[];
  resourceNotices: readonly ResourceNoticeMark[];
  resourceActivityError: UiText | null;
};
/** The application manages lists, resource states, and connection state; refreshing a list must not change the session view or navigation. */
export class ApplicationController {
  private state: ApplicationState = { snapshot: null, busy: false, error: null, status: "starting", resourceActivities: [], resourceNotices: [], resourceActivityError: null };
  private visibleSessionId: string | null = null;
  private listeners = new Set<() => void>();
  private reading = false;
  private dirty = false;
  private pending: ReturnType<typeof setTimeout> | null = null;
  /** Titles received after the subscription takes effect; subsequent list snapshots use these to prevent old snapshots from overwriting new titles. */
  private titles = new Map<string, string>();
  constructor(private readonly bridge: Pick<RuntimeBridge, "execute" | "session"> & Pick<DesktopBridge, "onStatus">,
    private readonly events: EventSubscriber, private readonly calls: PluginCalls, private readonly settleMs = 300) {}
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
    const subscription = this.events.subscribe(SessionTitleChanged, { delivery: "latest" }, event => {
      this.titles.set(event.data.sessionId, event.data.title);
      this.update({});
    });
    return () => subscription.close();
  }
  /** Occurrences are local notices; activity invalidations always read the host's current live scopes. */
  private watchResources(): () => void {
    const controller = new AbortController();
    const { signal } = controller;
    let ready = false, reading = false, pending = false;
    const failed = (error: unknown) => {
      if (!signal.aborted) this.update({ resourceActivities: [],
        resourceActivityError: failureDisplay(error, resourceStatusMessages.activitiesFailed) });
    };
    const read = async () => {
      pending = true;
      if (!ready || reading || signal.aborted) return;
      reading = true;
      try {
        do {
          pending = false;
          try {
            const resourceActivities = await this.calls.invoke(ReadResourceActivities, {}, { signal });
            if (!signal.aborted) this.update({ resourceActivities, resourceActivityError: null });
          } catch (error) { failed(error); }
        } while (pending && !signal.aborted);
      } finally { reading = false; }
    };
    this.events.subscribe(ResourcePresenceChanged, { signal }, ({ data }) => {
      const removed = new Set(data.disappeared);
      this.setResourceNotices(this.state.resourceNotices.filter(notice => notice.resource.sessionId !== data.sessionId || !removed.has(notice.resource.id)));
    });
    this.events.subscribe(ResourceNoticeRaised, { signal }, event => {
      // The public contract requires a resource source; the host validates identity when publishing.
      const resource = event.source!.resource!;
      const notice: ResourceNoticeMark = { ...event.data, resource };
      const marks = [...this.state.resourceNotices];
      const index = marks.findIndex(item => item.resource.sessionId === resource.sessionId && item.resource.id === resource.id && item.kind === notice.kind);
      if (index < 0) marks.push(notice);
      else marks[index] = notice;
      this.setResourceNotices(marks);
    });
    const activities = this.events.subscribe(ResourceActivitiesChanged, { delivery: "latest", signal }, () => { void read(); });
    // An acknowledged subscription precedes the initial query, including after reconnection. Events do not replay.
    void activities.ready.then(() => { ready = true; return read(); }).catch(failed);
    return () => {
      if (signal.aborted) return;
      controller.abort();
      this.update({ resourceActivities: [] });
    };
  }
  private setResourceNotices(marks: readonly ResourceNoticeMark[]): void {
    const resourceNotices = marks.filter(mark => mark.resource.sessionId !== this.visibleSessionId);
    if (JSON.stringify(resourceNotices) !== JSON.stringify(this.state.resourceNotices))
      this.update({ resourceNotices });
  }
  /** Entering a session consumes its notices, including subsequent notices while visible; activities are independent. */
  setVisibleSession(sessionId: string | null): void {
    this.visibleSessionId = sessionId;
    this.setResourceNotices(this.state.resourceNotices);
  }
  connect({ read = true }: { read?: boolean } = {}): () => void {
    let stopTitles = this.watchTitles();
    let stopResources = this.watchResources();
    const unsubscribe = this.bridge.onStatus(status => {
      if (status === "ready" && this.state.status !== "ready" && this.state.status !== "starting") {
        stopTitles(); stopTitles = this.watchTitles();
        stopResources(); stopResources = this.watchResources();
        void this.refresh({ quiet: true });
      }
      if (status === "unavailable" || status === "stopping") stopResources();
      this.update({ status, ...(status === "unavailable" ? { error: commonMessages.runtimeStopped } : {}) });
    });
    // Public title events update titles immediately; session commits and lifecycle changes coalesce catalog rereads.
    const stopSessions = this.bridge.session.onChanged(event => {
      if ((event.kind !== "session.changed" && event.kind !== "session.lifecycle") || this.pending) return;
      this.pending = setTimeout(() => { this.pending = null; void this.refresh({ quiet: true }); }, this.settleMs);
    });
    if (read) void this.refresh();
    return () => {
      unsubscribe(); stopSessions(); stopTitles(); stopResources();
      if (this.pending) { clearTimeout(this.pending); this.pending = null; }
    };
  }
  clearError = (): void => this.update({ error: null, resourceActivityError: null });
  /** Run an application command and adopt its returned snapshot; the failure display is returned to the command entry. */
  execute = async (command: Command): Promise<UiText | null> => {
    try {
      const result = await this.bridge.execute(command);
      if (!result.ok) return errorDisplay(result.error);
      this.update({ snapshot: result.snapshot });
      return null;
    } catch { return commonMessages.connectionLost; }
  };
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
