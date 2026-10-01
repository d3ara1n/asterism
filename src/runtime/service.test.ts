import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { ApplicationService } from "./service.ts";
import { dispatch } from "./dispatch.ts";
import { ObjectStore } from "./storage.ts";

const roots: string[] = [];
const services = new Set<ApplicationService>();
function open(root = mkdtempSync(join(tmpdir(), "weft-app-test-"))) {
  if (!roots.includes(root)) roots.push(root);
  const service = new ApplicationService(root);
  services.add(service);
  return { service, root };
}
afterEach(() => {
  for (const service of services) service.close();
  services.clear();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
const position = { x: -40, y: 120 };

describe("应用持久化与历史边界", () => {
  it("启动只读取列表，显式选择任务才读取正文；无任务时不能读取历史位置", () => {
    const { service, root } = open();
    const task = service.execute({ type: "task.create", title: "Saved conversation" }).task!;
    service.execute({ type: "note.create", task_id: task.id, title: "Note", content: "Saved", position });
    const event = service.history.eventsOn(task.branch_id).find(e => e.type === "resource_created")!;
    if (event.type !== "resource_created") throw new Error("Expected a resource event.");
    // 正文不可读也不应妨碍启动或显示侧栏；只有打开此任务才触及它。
    const contentPath = join(root, "objects", event.payload.content_ref!);
    rmSync(contentPath);
    mkdirSync(contentPath);
    const count = service.history.eventCount();
    const home = service.execute({ type: "workspace.read" });
    expect(home.tasks.map(item => item.id)).toEqual([task.id]);
    expect(home.task).toBeNull();
    expect(() => service.execute({ type: "workspace.read", task_id: task.id })).toThrow();
    expect(() => service.execute({ type: "workspace.read", at_seq: 1 })).toThrow("History requires a task");
    expect(service.history.eventCount()).toBe(count);
  });

  it("空工作区不生成示例；重开后读取任务、笔记内容、绑定与视图", () => {
    const { service, root } = open();
    expect(service.execute({ type: "workspace.read" }).tasks).toEqual([]);
    const task = service.execute({ type: "task.create", title: "My research" }).task!;
    const agent = service.execute({ type: "agent.create", task_id: task.id, title: "Researcher", position }).task!.objects[0]!;
    const note = service.execute({ type: "note.create", task_id: task.id, title: "Question", content: "A user-authored question", position }).task!.objects.find(o => o.kind === "note")!;
    service.execute({ type: "binding.set", task_id: task.id, agent_id: agent.id, resource_id: note.id, attached: true });
    const beforeMove = service.history.eventCount();
    service.execute({ type: "view.set", task_id: task.id, object_id: agent.id, position: { x: 123, y: -456 }, collapsed: true, hidden: true });
    service.execute({ type: "viewport.set", task_id: task.id, viewport: { x: 34, y: 56, zoom: 1.5 } });
    expect(service.history.eventCount()).toBe(beforeMove);
    service.close();
    services.delete(service);
    const reopened = open(root).service.execute({ type: "workspace.read", task_id: task.id }).task!;
    expect(reopened.title).toBe("My research");
    expect(reopened.objects.find(o => o.id === note.id)?.content).toBe("A user-authored question");
    expect(reopened.bindings).toEqual([{ agent_id: agent.id, resource_id: note.id, pending: null }]);
    expect(reopened.views.find(v => v.object_id === agent.id)).toEqual({
      object_id: agent.id, position: { x: 123, y: -456 }, collapsed: true, hidden: true,
    });
    expect(reopened.viewport).toEqual({ x: 34, y: 56, zoom: 1.5 });
  });

  it("查看过去不引入未来对象、不恢复授权、不追加事件", () => {
    const { service } = open();
    const task = service.execute({ type: "task.create", title: "History" }).task!;
    const agentState = service.execute({ type: "agent.create", task_id: task.id, title: "Agent", position }).task!;
    const agent = agentState.objects[0]!;
    const withNote = service.execute({ type: "note.create", task_id: task.id, title: "Note", content: "Recorded", position }).task!;
    const note = withNote.objects.find(o => o.kind === "note")!;
    const bound = service.execute({ type: "binding.set", task_id: task.id, agent_id: agent.id, resource_id: note.id, attached: true }).task!;
    service.execute({ type: "binding.set", task_id: task.id, agent_id: agent.id, resource_id: note.id, attached: false });
    const count = service.history.eventCount();
    const past = service.execute({ type: "workspace.read", task_id: task.id, at_seq: agentState.head_seq }).task!;
    expect(past.objects.map(o => o.id)).toEqual([agent.id]);
    expect(past.bindings).toEqual([]);
    expect(service.execute({ type: "workspace.read", task_id: task.id, at_seq: bound.head_seq }).task!.bindings).toHaveLength(1);
    expect(service.execute({ type: "workspace.read", task_id: task.id }).task!.bindings).toEqual([]);
    expect(service.history.eventCount()).toBe(count);
  });

  it("拒绝跨任务绑定和布局修改", () => {
    const { service } = open();
    const first = service.execute({ type: "task.create", title: "First" }).task!;
    const agent = service.execute({ type: "agent.create", task_id: first.id, title: "Agent", position }).task!.objects[0]!;
    const second = service.execute({ type: "task.create", title: "Second" }).task!;
    const resource = service.execute({ type: "note.create", task_id: second.id, title: "Private", content: "Private", position }).task!.objects[0]!;
    const before = service.history.eventCount();
    expect(() => service.execute({ type: "binding.set", task_id: first.id, agent_id: agent.id, resource_id: resource.id, attached: true })).toThrow("does not belong");
    expect(() => service.execute({ type: "view.set", task_id: second.id, object_id: agent.id, hidden: true })).toThrow("does not belong");
    expect(service.history.eventCount()).toBe(before);
  });

  it("外层元数据写入失败时同时回滚历史事件", () => {
    const { service, root } = open();
    const db = new DatabaseSync(join(root, "db", "weft.sqlite"));
    try {
      db.exec("CREATE TRIGGER reject_task BEFORE INSERT ON tasks BEGIN SELECT RAISE(ABORT, 'disk failure simulation'); END;");
      expect(() => service.execute({ type: "task.create", title: "Must not survive" })).toThrow("disk failure");
      expect(service.history.eventCount()).toBe(0);
      expect(service.execute({ type: "workspace.read" }).tasks).toEqual([]);
    } finally { db.close(); }
  });

  it("运行期间解绑仍由历史内核在轮次边界处理", () => {
    const { service } = open();
    const task = service.execute({ type: "task.create", title: "Binding" }).task!;
    const agent = service.execute({ type: "agent.create", task_id: task.id, title: "Agent", position }).task!.objects[0]!;
    const resource = service.execute({ type: "note.create", task_id: task.id, title: "Note", content: "Read me", position }).task!.objects.find(o => o.kind === "note")!;
    service.execute({ type: "binding.set", task_id: task.id, agent_id: agent.id, resource_id: resource.id, attached: true });
    const turn = service.history.startTurn(task.branch_id, { agent_id: agent.id });
    const during = service.execute({ type: "binding.set", task_id: task.id, agent_id: agent.id, resource_id: resource.id, attached: false }).task!;
    expect(during.bindings).toEqual([{ agent_id: agent.id, resource_id: resource.id, pending: "detach" }]);
    service.history.endTurn(task.branch_id, { turn_id: turn.turn_id });
    expect(service.execute({ type: "workspace.read", task_id: task.id }).task!.bindings).toEqual([]);
  });

  it("响应读取失败时回滚变更，避免报错后重试生成重复对象", () => {
    const { service, root } = open();
    const task = service.execute({ type: "task.create", title: "Read failure" }).task!;
    service.execute({ type: "note.create", task_id: task.id, title: "Note", content: "Saved", position });
    const event = service.history.eventsOn(task.branch_id).find(e => e.type === "resource_created")!;
    if (event.type !== "resource_created") throw new Error("Expected a resource event.");
    const path = join(root, "objects", event.payload.content_ref!);
    rmSync(path);
    mkdirSync(path);
    const count = service.history.eventCount();
    expect(() => service.execute({ type: "agent.create", task_id: task.id, title: "Must roll back", position })).toThrow();
    expect(service.history.eventCount()).toBe(count);
    rmSync(path, { recursive: true });
    writeFileSync(path, "Saved");
    expect(service.execute({ type: "workspace.read", task_id: task.id }).task!.objects.map(o => o.kind)).toEqual(["note"]);
  });

  it("协议拒绝额外字段与错误版本，不产生事件", () => {
    const { service } = open();
    for (const raw of [
      { version: 2, id: randomUUID(), command: { type: "task.create", title: "Bad" } },
      { version: 1, id: randomUUID(), command: { type: "task.create", title: "Bad", path: "/elsewhere" } },
      { version: 1, id: randomUUID(), command: { type: "shell", command: "pwd" } },
    ]) expect(dispatch(service, raw)).toBeNull();
    expect(service.history.eventCount()).toBe(0);
  });

  it("对象正文损坏时不把其他内容冒充为已保存记录", () => {
    const { root } = open();
    const store = new ObjectStore(join(root, "objects"));
    const ref = store.put("Original");
    writeFileSync(join(root, "objects", ref), "Corrupted");
    expect(store.get(ref)).toBeNull();
    expect(() => store.get("../db/weft.sqlite")).toThrow("Invalid object reference");
  });
});
