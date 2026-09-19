import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { turnBindings } from "./fold.ts";
import { HistoryKernel, MemoryReality } from "./kernel.ts";

const kernels: HistoryKernel[] = [];

function kernel(): HistoryKernel {
  const instance = HistoryKernel.memory();
  kernels.push(instance);
  return instance;
}

afterEach(() => {
  while (kernels.length > 0) {
    kernels.pop()?.close();
  }
});

describe("任务历史骨架", () => {
  it("持久化并重建指定历史位置", () => {
    const dir = mkdtempSync(join(tmpdir(), "weft-history-"));
    const path = join(dir, "events.sqlite");
    const first = HistoryKernel.open(path);
    const { branch_id, task_id } = first.createTask();
    const { agent_id } = first.createAgent(branch_id);
    const { resource_id, position: createdResource } = first.createResource(branch_id, {
      type: "virtual",
    });
    first.requestBinding(branch_id, {
      agent_id,
      resource_id,
      action: "attach",
      permissions: ["read", "write"],
    });
    const head = first.head(branch_id);
    first.close();

    const reopened = HistoryKernel.open(path);
    kernels.push(reopened);
    const atCreate = reopened.reconstruct(createdResource);
    expect(atCreate.task_ids).toEqual([task_id]);
    expect(atCreate.agent_ids).toEqual([agent_id]);
    expect(atCreate.resource_ids).toEqual([resource_id]);
    expect(atCreate.bindings_by_agent[agent_id]?.resources).toEqual([]);

    const atHead = reopened.reconstruct(head);
    expect(atHead.position).toEqual(head);
    expect(atHead.bindings_by_agent[agent_id]?.resources).toEqual([
      { resource_id, permissions: ["read", "write"] },
    ]);
    expect(atHead.pending).toEqual([]);
  });

  it("pending 不进入该轮有效绑定", () => {
    const history = kernel();
    const { branch_id } = history.createTask();
    const { agent_id } = history.createAgent(branch_id);
    const { resource_id } = history.createResource(branch_id, { type: "directory" });
    history.requestBinding(branch_id, {
      agent_id,
      resource_id,
      action: "attach",
      permissions: ["read"],
    });
    const { turn_id, position: turnStarted } = history.startTurn(branch_id, { agent_id });
    const requested = history.requestBinding(branch_id, {
      agent_id,
      resource_id,
      action: "detach",
    });
    expect(requested.pending).toBe(true);

    const duringTurn = history.reconstruct(requested.position);
    expect(duringTurn.in_flight_turns.map((turn) => turn.turn_id)).toEqual([turn_id]);
    expect(duringTurn.pending).toEqual([
      expect.objectContaining({
        agent_id,
        resource_id,
        action: "detach",
      }),
    ]);
    expect(duringTurn.bindings_by_agent[agent_id]?.resources).toEqual([
      { resource_id, permissions: ["read"] },
    ]);
    expect(turnBindings(duringTurn, turn_id)).toEqual([
      { resource_id, permissions: ["read"] },
    ]);

    const atStart = history.reconstruct(turnStarted);
    expect(atStart.pending).toEqual([]);
    expect(turnBindings(atStart, turn_id)).toEqual([
      { resource_id, permissions: ["read"] },
    ]);

    history.endTurn(branch_id, { turn_id });
    const after = history.reconstruct(history.head(branch_id));
    expect(after.in_flight_turns).toEqual([]);
    expect(after.pending).toEqual([]);
    expect(after.bindings_by_agent[agent_id]?.resources).toEqual([]);
  });

  it("打开卡片不创建重复业务对象", () => {
    const history = kernel();
    const { branch_id } = history.createTask();
    const { resource_id } = history.createResource(branch_id, { type: "file" });
    const eventsBefore = history.eventCount(branch_id);
    const firstView = history.openView(resource_id);
    const secondView = history.openView(resource_id);

    expect(firstView.object_id).toBe(resource_id);
    expect(secondView.object_id).toBe(resource_id);
    expect(firstView.view_id).not.toBe(secondView.view_id);
    expect(history.viewsOf(resource_id)).toHaveLength(2);
    expect(history.eventCount(branch_id)).toBe(eventsBefore);

    const projection = history.reconstruct(history.head(branch_id));
    expect(projection.resource_ids.filter((id) => id === resource_id)).toEqual([
      resource_id,
    ]);
  });

  it("回看不改变现实资源", () => {
    const reality = new MemoryReality();
    const history = HistoryKernel.memory(reality);
    kernels.push(history);
    const { branch_id } = history.createTask();
    const { resource_id } = history.createResource(branch_id, { type: "file" });
    const beforeWrite = history.head(branch_id);
    history.writeResource(resource_id, "current");
    expect(history.reality.read(resource_id)).toBe("current");

    const eventsBefore = history.eventCount(branch_id);
    history.reconstruct(beforeWrite);
    expect(history.reality.read(resource_id)).toBe("current");
    expect(history.eventCount(branch_id)).toBe(eventsBefore);
    expect(history.reconstruct(history.head(branch_id)).in_flight_turns).toEqual([]);
  });
});
