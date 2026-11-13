import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Json } from "@asterism-app/sdk/contracts";
import { BuiltinApplicationService } from "../testing.ts";
import { foldWorkbench } from "../../../../src/session/fold.ts";
import { flat } from "../../../../src/session/test-nodes.ts";
import * as runtimeModules from "../../../../src/plugins/loader.ts";
import { BrowseTodoLists, CreateSharedTodoList, CreateTodoListResource, DeleteSharedTodoList,
  MutateTodo, ReadTodoItem, ReadTodoPage, TodoListResource } from "./contract.ts";
import { todoListSchema, todoPageResultSchema, todoSchema } from "./model.ts";

const roots: string[] = [], apps: BuiltinApplicationService[] = [];
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function setup() {
  let modules!: ReturnType<typeof runtimeModules.loadPlugins>;
  const load = runtimeModules.loadPlugins;
  vi.spyOn(runtimeModules, "loadPlugins").mockImplementation((...args) => { modules = load(...args); return modules; });
  const root = mkdtempSync(join(tmpdir(), "asterism-todo-")); roots.push(root);
  const app = new BuiltinApplicationService(root); apps.push(app);
  const sessionA = app.sessions.tree.create("Planning"), sessionB = app.sessions.tree.create("Execution");
  const connect = async (sessionId: string, listId: string) => {
    await app.sessions.execute({ type: "resource.create", sessionId, kind: TodoListResource.kind,
      creation: { id: CreateTodoListResource.id }, input: { listId }, position: { x: 0, y: 0 } });
    const entry = foldWorkbench(app.sessions.tree.timeline(sessionId).map(flat)).objects.filter(value => value.kind === TodoListResource.kind).at(-1)!;
    return { entry, ref: { sessionId, id: entry.id, kind: entry.kind } };
  };
  const tool = async (entry: Awaited<ReturnType<typeof connect>>, name: string, target: Json = null, args: Json = {}) => {
    const invocation = modules.tools.match(entry.entry).find(value => value.tool.name === name)!.prepare(entry.entry, target, args,
      { ref: { sessionId: sessionB, id: "worker", kind: "asterism.builtin/agent" }, title: "Worker" });
    if (!("execute" in invocation)) return invocation;
    return invocation.execute(new AbortController().signal);
  };
  const mutate = (entry: Awaited<ReturnType<typeof connect>>, input: Json) => app.sessions.execute({
    type: "resource.command", sessionId: entry.ref.sessionId, objectId: entry.ref.id, command: { id: MutateTodo.id, input },
  });
  return { app, sessionA, sessionB, connect, tool, mutate, modules: () => modules };
}

describe("Todo list resource boundaries", () => {
  it("shares current data through fixed cross-session entrances and leaves it intact when an entrance is removed", async () => {
    const f = setup();
    const shared = todoListSchema.parse(await f.app.sessions.calls.invoke(CreateSharedTodoList.id, { title: "Shared" }, {}, null));
    const unrelated = todoListSchema.parse(await f.app.sessions.calls.invoke(CreateSharedTodoList.id, { title: "Other" }, {}, null));
    const a = await f.connect(f.sessionA, shared.id), b = await f.connect(f.sessionB, shared.id);
    const other = await f.connect(f.sessionB, unrelated.id);
    const before = f.app.sessions.tree.timeline(f.sessionA).length;
    await f.mutate(a, { action: "create", title: "Ship release", content: "Write the release notes." });
    const page = todoPageResultSchema.parse(await f.app.sessions.calls.invoke(ReadTodoPage.id, {}, { object: b.ref }, null));
    const task = page.todos[0]!;
    expect(task).toMatchObject({ title: "Ship release", createdBy: { kind: "user" }, status: "pending" });
    expect(await f.tool(other, "list")).toMatchObject({ kind: "succeeded", data: { total: 0 } });
    // External mutations do not append domain records or mark the entrance busy.
    expect(f.app.sessions.tree.timeline(f.sessionA)).toHaveLength(before);
    expect(f.modules().activity(f.sessionA).busy).toEqual([]);
    await f.tool(b, "todo_claim", { id: task.id });
    const current = todoSchema.parse(await f.app.sessions.calls.invoke(ReadTodoItem.id, { id: task.id }, { object: a.ref }, null));
    expect(current.assignee).toEqual({ kind: "agent", ref: { sessionId: f.sessionB, id: "worker", kind: "asterism.builtin/agent" }, title: "Worker" });
    expect(await f.tool(b, "list", { assignee: current.assignee })).toMatchObject({ kind: "succeeded", data: { todos: [{ id: task.id }] } });
    await f.app.sessions.execute({ type: "object.remove", sessionId: f.sessionA, objectId: a.ref.id });
    await f.mutate(b, { action: "complete", id: task.id, note: "Reviewed by the user." });
    const restored = await f.connect(f.sessionA, shared.id);
    const completed = todoSchema.parse(await f.app.sessions.calls.invoke(ReadTodoItem.id, { id: task.id }, { object: restored.ref }, null));
    expect(completed).toMatchObject({ status: "done", assignee: current.assignee,
      completion: { note: "Reviewed by the user.", completedBy: { kind: "user" } } });
  });

  it("keeps deleted-list bindings unavailable while transferred task IDs resolve only through the destination", async () => {
    const f = setup();
    const source = todoListSchema.parse(await f.app.sessions.calls.invoke(CreateSharedTodoList.id, { title: "Source" }, {}, null));
    const destination = todoListSchema.parse(await f.app.sessions.calls.invoke(CreateSharedTodoList.id, { title: "Destination" }, {}, null));
    const sourceEntry = await f.connect(f.sessionA, source.id), targetEntry = await f.connect(f.sessionB, destination.id);
    const created = await f.tool(sourceEntry, "todo_create", null, { title: "Continue elsewhere", content: "Keep the identity." });
    if (created.kind !== "succeeded") throw new Error("Expected task creation.");
    const task = todoSchema.parse((created.data as { todo: Json }).todo);
    await f.app.sessions.calls.invoke(DeleteSharedTodoList.id, { listId: source.id, transferOpenTodosTo: destination.id }, {}, null);
    expect(await f.modules().resources.inspect(sourceEntry.entry)).toMatchObject({ listId: source.id, available: false, list: null });
    expect(await f.tool(sourceEntry, "read", { id: task.id })).toMatchObject({ kind: "rejected", error: { code: "todo_list_not_found" } });
    expect(await f.tool(sourceEntry, "list")).toMatchObject({ kind: "rejected", error: { code: "todo_list_not_found" } });
    const transferred = todoSchema.parse(await f.app.sessions.calls.invoke(ReadTodoItem.id, { id: task.id }, { object: targetEntry.ref }, null));
    expect(transferred).toEqual({ ...task, listId: destination.id });
    expect(await f.app.sessions.calls.invoke(BrowseTodoLists.id, {}, {}, null)).toEqual([expect.objectContaining({ id: destination.id })]);
    await expect(f.connect(f.sessionB, source.id)).rejects.toMatchObject({ reason: "todo_list_not_found" });
  });
});
