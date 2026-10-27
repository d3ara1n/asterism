import { describe, expect, it, vi } from "vitest";
import type { AppSnapshot, CommandResult } from "../../shared/contracts.ts";
import { ApplicationController } from "./controller.ts";
import { ResourceStatusChanged, ResourcePresenceChanged, type EventHandler, type EventSubscriber, type ResourceStatus } from "@asterism-app/sdk/contracts";
import { summarizeResourceStatus } from "./resource-status.ts";

const snapshot: AppSnapshot = { workspace: { id: "w", title: "Workspace" }, sessions: [], templates: [], archivedSessions: [], plugins: [], restartRequired: false };
describe("Application session list", () => {
  // Startup reading and the home page share one controller; a single read after subscribing can supply the initial screen.
  it("subscribes before reading during startup, and the home page reuses the snapshot while retaining the subscription to subsequent changes", async () => {
    const order: string[] = [];
    const execute = vi.fn(async () => { order.push("read"); return { ok: true as const, snapshot }; });
    const controller = new ApplicationController({ execute, onStatus: () => () => {},
      session: { execute: vi.fn(), onChanged: () => { order.push("subscribe"); return () => { order.push("close"); }; } } });
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
      session: { execute: vi.fn(), onChanged: () => () => {} } });
    await controller.refresh();
    expect(controller.getSnapshot()).toMatchObject({ status: "unavailable", error: "Connection lost." });
    await controller.refresh({ quiet: true });
    expect(controller.getSnapshot()).toMatchObject({ status: "ready", error: null, snapshot });
  });

  // Workbench contract: fully replace state for the same resource, and viewing consumes only terminal states; identical data does not refresh, and progress is not held separately.
  it("retains the latest state per resource, preserves running across views, and clears terminal states when viewed", () => {
    let receive!: EventHandler<ResourceStatus>;
    let presence!: EventHandler<{ sessionId: string; appeared: string[]; disappeared: string[] }>;
    const events: EventSubscriber = { subscribe(contract, _options, handler) {
      if (contract.id === ResourceStatusChanged.id)
        receive = (event, context) => handler({ ...event, data: contract.schema.parse(event.data) }, context);
      if (contract.id === ResourcePresenceChanged.id)
        presence = (event, context) => handler({ ...event, data: contract.schema.parse(event.data) }, context);
      return { ready: Promise.resolve(), closed: new Promise(() => {}), close() {} };
    } };
    const execute = vi.fn(async () => ({ ok: true as const, snapshot }));
    const controller = new ApplicationController({ execute, onStatus: () => () => {},
      session: { execute: vi.fn(), onChanged: () => () => {} } }, events);
    const disconnect = controller.connect();
    const send = (sessionId: string, id: string, status: ResourceStatus["status"], progress?: number) => receive({
      contract: { id: ResourceStatusChanged.id }, emittedAt: "",
      source: { plugin: "test.resources", resource: { sessionId, id, kind: "test.resources/agent" } },
      data: status === "running" && progress !== undefined ? { title: id, status, progress: { value: progress } } : { title: id, status },
    }, { signal: new AbortController().signal });
    try {
      send("a", "one", "running"); send("a", "two", "failed"); send("b", "three", "awaiting");
      expect(controller.getSnapshot().resourceStatuses.map(mark => [mark.resource.id, mark.status]))
        .toEqual([["one", "running"], ["two", "failed"], ["three", "awaiting"]]);
      expect(summarizeResourceStatus(controller.getSnapshot().resourceStatuses)).toBe("failed");
      controller.setVisibleSession("a");
      expect(controller.getSnapshot().resourceStatuses.map(mark => mark.resource.id)).toEqual(["one", "three"]);
      send("a", "one", "running", 0.6);
      expect(controller.getSnapshot().resourceStatuses[0]).toMatchObject({ status: "running", progress: { value: 0.6 } });
      const before = controller.getSnapshot();
      send("a", "one", "running", 0.6);
      expect(controller.getSnapshot()).toBe(before);
      send("a", "one", "running", 0.2);
      expect(controller.getSnapshot().resourceStatuses[0]).toMatchObject({ status: "running", progress: { value: 0.2 } });
      send("a", "one", "running");
      expect(controller.getSnapshot().resourceStatuses[0]).not.toHaveProperty("progress");
      for (const status of ["failed", "completed", "awaiting"] as const) {
        send("a", "one", "running", 0.5);
        send("a", "one", status);
        expect(controller.getSnapshot().resourceStatuses.map(mark => mark.resource.id)).toEqual(["three"]);
      }
      controller.setVisibleSession(null);
      expect(controller.getSnapshot().resourceStatuses.map(mark => mark.resource.id)).toEqual(["three"]);
      send("a", "one", "running", 1);
      send("a", "one", "completed");
      expect(controller.getSnapshot().resourceStatuses.map(mark => [mark.resource.id, mark.status]))
        .toEqual([["three", "awaiting"], ["one", "completed"]]);
      expect(controller.getSnapshot().resourceStatuses[1]).not.toHaveProperty("progress");
      controller.setVisibleSession("a");
      expect(controller.getSnapshot().resourceStatuses.map(mark => mark.resource.id)).toEqual(["three"]);
      // External resources in sessions that are not being viewed can also be removed; their running markers are released on presence notifications.
      send("b", "three", "running");
      presence({ contract: { id: ResourcePresenceChanged.id }, emittedAt: "", source: null,
        data: { sessionId: "b", appeared: [], disappeared: ["three"] } }, { signal: new AbortController().signal });
      expect(controller.getSnapshot().resourceStatuses).toEqual([]);
      // Only the list read on connection occurs; individual state updates and viewing operations send no queries or commands.
      expect(execute.mock.calls).toHaveLength(1);
    } finally { disconnect(); }
  });
  it("rereads when refreshed again during a query, and a late creation can refresh the list without carrying any session position", async () => {
    const requests: Array<(result: CommandResult) => void> = [];
    const execute = vi.fn(() => new Promise<CommandResult>(resolve => requests.push(resolve)));
    const controller = new ApplicationController({ execute, onStatus: () => () => {}, session: { execute: vi.fn(), onChanged: () => () => {} } });
    const first = controller.refresh();
    void controller.refresh();
    requests[0]!({ ok: true, snapshot });
    await Promise.resolve();
    requests[1]!({ ok: true, snapshot: { ...snapshot, sessions: [{ id: "new", title: "New", created_at: "" }] } });
    await first;
    expect(execute.mock.calls).toHaveLength(2);
    expect(controller.getSnapshot().snapshot?.sessions.map(session => session.id)).toEqual(["new"]);
    expect(controller.getSnapshot().snapshot).not.toHaveProperty("session");
  });
});
