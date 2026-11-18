import { describe, expect, it, vi } from "vitest";
import type { AppSnapshot, CommandResult } from "../../shared/contracts.ts";
import { ApplicationController } from "./controller.ts";
import { ResourceActivitiesChanged, ResourceNoticeRaised, ResourcePresenceChanged, type EventContract, type EventSubscriber, type EventSubscribeOptions, type Json, type PluginCalls, type ResourceActivity, type ResourceNotice, type ResourceRef, type Source } from "@asterism-app/sdk/contracts";
import { summarizeResourceNotices } from "./resource-status.ts";

const snapshot: AppSnapshot = { workspace: { id: "w", title: "Workspace" }, folders: [], sessions: [], templates: [], archivedSessions: [], plugins: [], rendererPlugins: [], restartRequired: false };
const quietEvents: EventSubscriber = { subscribe: () => ({ ready: Promise.resolve(), closed: new Promise(() => {}), close() {} }) };
const emptyActivities: PluginCalls = { async invoke(contract) { return contract.output.parse([]); } };
describe("Application session list", () => {
  // Startup reading and the home page share one controller; a single read after subscribing can supply the initial screen.
  it("subscribes before reading during startup, and the home page reuses the snapshot while retaining the subscription to subsequent changes", async () => {
    const order: string[] = [];
    const execute = vi.fn(async () => { order.push("read"); return { ok: true as const, snapshot }; });
    const controller = new ApplicationController({ execute, onStatus: () => () => {},
      session: { execute: vi.fn(), onChanged: () => { order.push("subscribe"); return () => { order.push("close"); }; } } }, quietEvents, emptyActivities);
    const stop = controller.connect({ read: false });
    try {
      await controller.refresh();
      expect(order).toEqual(["subscribe", "read"]);
      expect(controller.getSnapshot().snapshot).toEqual(snapshot);
      expect(execute).toHaveBeenCalledTimes(1);
    } finally { stop(); }
    expect(order.at(-1)).toBe("close");
  });
  // Workbench state feedback: after a successful read restores availability, remove the old connection error rather than turning it into a stale global notification.
  it("a quiet read after backend recovery clears the connection error", async () => {
    const execute = vi.fn<() => Promise<CommandResult>>()
      .mockResolvedValueOnce({ ok: false, error: { code: "unavailable", message: "Connection lost.", display: "Connection lost." } })
      .mockResolvedValueOnce({ ok: true, snapshot });
    const controller = new ApplicationController({ execute, onStatus: () => () => {},
      session: { execute: vi.fn(), onChanged: () => () => {} } }, quietEvents, emptyActivities);
    await controller.refresh();
    expect(controller.getSnapshot()).toMatchObject({ status: "unavailable", error: "Connection lost." });
    await controller.refresh({ quiet: true });
    expect(controller.getSnapshot()).toMatchObject({ status: "ready", error: null, snapshot });
  });

  it("rereads when refreshed again during a query and applies the updated session list", async () => {
    const requests: Array<(result: CommandResult) => void> = [];
    const execute = vi.fn(() => new Promise<CommandResult>(resolve => requests.push(resolve)));
    const controller = new ApplicationController({ execute, onStatus: () => () => {}, session: { execute: vi.fn(), onChanged: () => () => {} } }, quietEvents, emptyActivities);
    const first = controller.refresh();
    void controller.refresh();
    requests[0]!({ ok: true, snapshot });
    await Promise.resolve();
    requests[1]!({ ok: true, snapshot: { ...snapshot, sessions: [{ id: "new", title: "New", created_at: "", folder_id: null, completed: false, sleeping: false, keepAwake: false }] } });
    await first;
    expect(execute.mock.calls).toHaveLength(2);
    expect(controller.getSnapshot().snapshot?.sessions.map(session => session.id)).toEqual(["new"]);
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function resource(id: string, sessionId = "a"): ResourceRef { return { id, sessionId, kind: "test.resources/agent" }; }
function activity(id: string, owner: ResourceRef = resource("one"), progress?: number): ResourceActivity {
  return { id, kind: "work", resource: owner, title: id, ...(progress === undefined ? {} : { progress: { value: progress } }) };
}

function resourceHarness(activityReady: Promise<void> = Promise.resolve()) {
  const subscriptions: Array<{ id: string; options: EventSubscribeOptions; close: () => void }> = [];
  const handlers = new Map<string, Set<(data: Json, source: Source) => void>>();
  const events: EventSubscriber = { subscribe(contract, options, handler) {
    const receive = (data: Json, source: Source) => handler({ contract: { id: contract.id }, emittedAt: "", source,
      data: contract.schema.parse(data) }, { signal: options.signal ?? new AbortController().signal });
    const listeners = handlers.get(contract.id) ?? new Set();
    handlers.set(contract.id, listeners); listeners.add(receive);
    const close = () => { listeners.delete(receive); };
    options.signal?.addEventListener("abort", close, { once: true });
    subscriptions.push({ id: contract.id, options, close });
    return { ready: contract.id === ResourceActivitiesChanged.id ? activityReady : Promise.resolve(),
      closed: new Promise(() => {}), close };
  } };
  const emit = <I, D extends Json>(contract: EventContract<I, D>, data: D, source: Source = null) => {
    for (const handler of handlers.get(contract.id) ?? []) handler(data, source);
  };
  const notice = (owner: ResourceRef, kind: ResourceNotice["kind"], title: string = kind) =>
    emit(ResourceNoticeRaised, { kind, title }, { plugin: "test.resources", resource: owner });
  const queries: Array<ReturnType<typeof deferred<ResourceActivity[]>> & { signal: AbortSignal }> = [];
  const invoke = vi.fn((signal: AbortSignal) => {
    const query = { ...deferred<ResourceActivity[]>(), signal };
    queries.push(query);
    return query.promise;
  });
  const results: Promise<unknown>[] = [];
  const calls: PluginCalls = { invoke(contract, _input, options) {
    const result = invoke(options.signal!).then(value => contract.output.parse(value));
    results.push(result);
    return result;
  } };
  let status!: (status: "ready" | "unavailable" | "stopping") => void;
  const execute = vi.fn(async () => ({ ok: true as const, snapshot }));
  const controller = new ApplicationController({ execute, onStatus: handler => { status = handler; return () => {}; },
    session: { execute: vi.fn(), onChanged: () => () => {} } }, events, calls);
  const finish = async (index: number, activities: ResourceActivity[]) => {
    queries[index]!.resolve(activities);
    await results[index];
  };
  return { controller, queries, subscriptions, invoke, results, execute, emit, notice, status: (value: "ready" | "unavailable" | "stopping") => status(value), finish };
}

describe("Resource activities and notices", () => {
  it("keeps live scopes beside all notice kinds, and viewing consumes only notices in that session", async () => {
    const h = resourceHarness(), stop = h.controller.connect({ read: false });
    try {
      await Promise.resolve();
      await h.finish(0, [activity("first"), activity("second"), activity("other", resource("three", "b"))]);
      h.notice(resource("one"), "attention");
      h.notice(resource("one"), "error");
      h.notice(resource("one"), "success");
      h.notice(resource("two"), "attention");
      h.notice(resource("three", "b"), "success");
      expect(h.controller.getSnapshot().resourceActivities.map(item => item.id)).toEqual(["first", "second", "other"]);
      expect(h.controller.getSnapshot().resourceNotices.map(item => [item.resource.id, item.kind]))
        .toEqual([["one", "attention"], ["one", "error"], ["one", "success"], ["two", "attention"], ["three", "success"]]);
      expect(summarizeResourceNotices(h.controller.getSnapshot().resourceNotices)).toBe("error");
      const activities = h.controller.getSnapshot().resourceActivities;
      h.controller.setVisibleSession("a");
      expect(h.controller.getSnapshot().resourceNotices.map(item => item.resource.id)).toEqual(["three"]);
      expect(h.controller.getSnapshot().resourceActivities).toBe(activities);
      h.notice(resource("one"), "error");
      h.notice(resource("two"), "attention");
      h.notice(resource("one"), "success");
      expect(h.controller.getSnapshot().resourceNotices.map(item => item.resource.id)).toEqual(["three"]);
      h.controller.setVisibleSession(null);
      h.notice(resource("one"), "attention");
      expect(summarizeResourceNotices(h.controller.getSnapshot().resourceNotices)).toBe("attention");
      expect(h.invoke).toHaveBeenCalledTimes(1);
    } finally { stop(); }
  });

  it("replaces only the same resource and kind, and disappearance cleans every kind for that resource", () => {
    const h = resourceHarness(), stop = h.controller.connect({ read: false });
    try {
      h.notice(resource("one"), "error", "first");
      h.notice(resource("one"), "attention");
      h.notice(resource("one"), "error", "latest");
      h.notice(resource("one", "b"), "success");
      expect(h.controller.getSnapshot().resourceNotices.map(item => item.title)).toEqual(["latest", "attention", "success"]);
      h.emit(ResourcePresenceChanged, { sessionId: "a", appeared: [], disappeared: ["one"] });
      expect(h.controller.getSnapshot().resourceNotices.map(item => [item.resource.sessionId, item.kind])).toEqual([["b", "success"]]);
      h.controller.setVisibleSession("b");
      expect(summarizeResourceNotices(h.controller.getSnapshot().resourceNotices)).toBeUndefined();
    } finally { stop(); }
  });

  it("waits for subscription acknowledgement and coalesces changes received during a read into one pending read", async () => {
    const ready = deferred<void>(), h = resourceHarness(ready.promise), stop = h.controller.connect({ read: false });
    try {
      h.emit(ResourceActivitiesChanged, {});
      expect(h.queries).toHaveLength(0);
      ready.resolve();
      await ready.promise;
      expect(h.queries).toHaveLength(1);
      h.emit(ResourceActivitiesChanged, {}); h.emit(ResourceActivitiesChanged, {});
      expect(h.queries).toHaveLength(1);
      await h.finish(0, [activity("old")]);
      expect(h.queries).toHaveLength(2);
      await h.finish(1, [activity("current")]);
      expect(h.controller.getSnapshot().resourceActivities.map(item => item.id)).toEqual(["current"]);
      expect(h.queries).toHaveLength(2);
    } finally { stop(); }
  });

  it("fully replaces activity progress and removes ended scopes without erasing notices", async () => {
    const h = resourceHarness(), stop = h.controller.connect({ read: false });
    try {
      await Promise.resolve();
      await h.finish(0, [activity("first", resource("one"), 0.6), activity("second")]);
      expect(h.controller.getSnapshot().resourceActivities[0]).toMatchObject({ progress: { value: 0.6 } });
      h.notice(resource("one"), "success");
      h.emit(ResourceActivitiesChanged, {});
      await h.finish(1, [activity("first")]);
      expect(h.controller.getSnapshot().resourceActivities).toEqual([activity("first")]);
      h.emit(ResourceActivitiesChanged, {});
      await h.finish(2, []);
      expect(h.controller.getSnapshot().resourceActivities).toEqual([]);
      expect(h.controller.getSnapshot().resourceNotices.map(item => item.kind)).toEqual(["success"]);
    } finally { stop(); }
  });

  it("restores live activities by querying after reconnect without replaying consumed notices", async () => {
    const h = resourceHarness(), stop = h.controller.connect({ read: false });
    try {
      await Promise.resolve();
      await h.finish(0, [activity("before")]);
      h.notice(resource("one"), "error");
      h.controller.setVisibleSession("a"); h.controller.setVisibleSession(null);
      h.status("ready"); h.status("unavailable");
      expect(h.controller.getSnapshot().resourceActivities).toEqual([]);
      h.status("ready");
      await Promise.resolve();
      await h.finish(1, [activity("still-running")]);
      expect(h.controller.getSnapshot().resourceActivities.map(item => item.id)).toEqual(["still-running"]);
      expect(h.controller.getSnapshot().resourceNotices).toEqual([]);
      expect(h.subscriptions.filter(item => item.id === ResourceActivitiesChanged.id)).toHaveLength(2);
    } finally { stop(); }
  });

  it("clears stale activities and exposes read failure independently of workspace refresh, then recovers on a new invalidation", async () => {
    const h = resourceHarness(), stop = h.controller.connect({ read: false });
    try {
      await Promise.resolve();
      await h.finish(0, [activity("old")]);
      h.notice(resource("one"), "attention");
      h.emit(ResourceActivitiesChanged, {});
      h.queries[1]!.reject({ code: "custom", display: "Activity read failed" });
      await h.results[1]!.catch(() => {});
      expect(h.controller.getSnapshot()).toMatchObject({ resourceActivities: [], resourceActivityError: "Activity read failed" });
      await h.controller.refresh({ quiet: true });
      expect(h.controller.getSnapshot().resourceActivityError).toBe("Activity read failed");
      expect(h.queries).toHaveLength(2);
      h.emit(ResourceActivitiesChanged, {});
      await h.finish(2, [activity("recovered")]);
      expect(h.controller.getSnapshot()).toMatchObject({ resourceActivities: [activity("recovered")], resourceActivityError: null });
      expect(h.controller.getSnapshot().resourceNotices.map(item => item.kind)).toEqual(["attention"]);
    } finally { stop(); }
  });

  it("exposes subscription failure without issuing an activity query", async () => {
    const ready = deferred<void>(), h = resourceHarness(ready.promise), stop = h.controller.connect({ read: false });
    try {
      ready.reject(new Error("Subscription failed"));
      await ready.promise.catch(() => {});
      await Promise.resolve();
      expect(h.controller.getSnapshot().resourceActivityError).not.toBeNull();
      expect(h.queries).toHaveLength(0);
    } finally { stop(); }
  });

  it("aborts a stopped watch and ignores its late result after a reconnect query", async () => {
    const h = resourceHarness(), stop = h.controller.connect({ read: false });
    try {
      await Promise.resolve();
      h.status("ready"); h.status("unavailable"); h.status("ready");
      await Promise.resolve();
      expect(h.queries[0]!.signal.aborted).toBe(true);
      await h.finish(1, [activity("new-watch")]);
      const current = h.controller.getSnapshot();
      await h.finish(0, [activity("stale-watch")]);
      expect(h.controller.getSnapshot()).toBe(current);
      stop();
      expect(h.queries[1]!.signal.aborted).toBe(true);
    } finally { stop(); }
  });

  it("ignores cancellation failure and never starts a query after a watch stopped before acknowledgement", async () => {
    const h = resourceHarness(), stop = h.controller.connect({ read: false });
    await Promise.resolve();
    stop();
    const current = h.controller.getSnapshot();
    h.queries[0]!.reject(new Error("Aborted"));
    await h.results[0]!.catch(() => {});
    expect(h.controller.getSnapshot()).toBe(current);
    const ready = deferred<void>(), waiting = resourceHarness(ready.promise), stopWaiting = waiting.controller.connect({ read: false });
    stopWaiting();
    ready.resolve();
    await ready.promise;
    expect(waiting.queries).toHaveLength(0);
    expect(waiting.controller.getSnapshot().resourceActivityError).toBeNull();
  });
});
