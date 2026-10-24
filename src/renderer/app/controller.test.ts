import { describe, expect, it, vi } from "vitest";
import type { AppSnapshot, CommandResult } from "../../shared/contracts.ts";
import { ApplicationController } from "./controller.ts";
import { ResourceStatusChanged, ResourcePresenceChanged, type EventHandler, type EventSubscriber, type ResourceStatus } from "@atelier/sdk/contracts";
import { summarizeResourceStatus } from "./resource-status.ts";

const snapshot: AppSnapshot = { workspace: { id: "w", title: "Workspace" }, sessions: [], templates: [], archivedSessions: [], plugins: [], restartRequired: false };
describe("应用会话列表", () => {
  // 工作台状态反馈：成功读取恢复可用后，旧连接错误必须撤下，不能转为过期的全局通知。
  it("后台恢复后的静默读取清除连接错误", async () => {
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

  // 工作台契约：同资源完整替换，查看只消费终态；相同数据不刷新，进度不单独持有。
  it("按资源保留最新状态，running 跨查看保留，终态查看即清除", () => {
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
      // 未查看会话的外部资源也能被移除；其 running 标记随存在性通知释放。
      send("b", "three", "running");
      presence({ contract: { id: ResourcePresenceChanged.id }, emittedAt: "", source: null,
        data: { sessionId: "b", appeared: [], disappeared: ["three"] } }, { signal: new AbortController().signal });
      expect(controller.getSnapshot().resourceStatuses).toEqual([]);
      // 只有连接时的列表读取；每条状态及查看操作都不发查询或命令。
      expect(execute.mock.calls).toHaveLength(1);
    } finally { disconnect(); }
  });
  it("查询途中再次刷新时补读，晚到创建可刷新列表且不携带任何会话位置", async () => {
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
