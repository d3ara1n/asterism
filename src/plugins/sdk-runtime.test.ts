import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { defineCreation, defineAction, resourceCall, defineRecord, defineImplementation, defineTool, pluginNamespace, modelRunRecordSchema, type SessionRecord, type ModelRunEvent } from "@atelier/sdk/contracts";
import { defineModule, definePlugin, implementCreation, implementAction, implementPreparer, implementResource, implementTool, type ObjectReader, type ObjectExecutor, type ObjectWriter, type PluginContext, type PluginDefinition } from "@atelier/sdk/runtime";
import { ApplicationService } from "../runtime/service.ts";
import { DatabaseVersionError } from "../runtime/storage.ts";
import * as runtimeModules from "../modules/runtime.ts";
import type { ToolRegistry } from "../tools/registry.ts";
import { foldWorkbench } from "../session/fold.ts";
import type { ModelAdapter, ModelInput } from "../model/contract.ts";
import { Directory, DirectoryView } from "../modules/filesystem/contract.ts";
import { Note, NoteContent } from "../modules/notes/contract.ts";
import { Agent, SubmitAgentInput } from "../modules/agent/contract.ts";
import { applicationStorage } from "../shared/application.ts";
import { emptyCompletion } from "../shared/session.ts";
import type { SessionDataStore } from "../session/data.ts";

const ns = pluginNamespace("test.counter");
const Counter = ns.resource("counter", z.strictObject({}));
const State = ns.data("state", z.number().int());
const View = ns.data("view", z.object({ value: z.number() }));
const Changed = defineRecord(ns.name("changed"), { schema: z.object({ value: z.number() }) });
const Command = z.strictObject({ amount: z.number().int() });
const CreateCounter = defineCreation(Counter, { id: ns.name("create"), schema: z.number().int() });
const ChangeCount = defineAction(Counter, { id: ns.name("change"), schema: Command });
const roots: string[] = [];
const services: ApplicationService[] = [];
afterEach(async () => {
  for (const service of services.splice(0)) await service.close();
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function open(plugins: PluginDefinition[], adapterFactory?: () => ModelAdapter, onSessionChanged?: NonNullable<ConstructorParameters<typeof ApplicationService>[1]>["onSessionChanged"]) {
  const root = mkdtempSync(join(tmpdir(), "sdk-runtime-")); roots.push(root);
  const service = new ApplicationService(root, { plugins, adapterFactory, onSessionChanged }); services.push(service);
  const sessionId = service.sessions.tree.create("Counter");
  return { root, service, sessionId };
}
async function configureModel(service: ApplicationService) {
  await service.configuration.execute({ type: "provider.save", id: null, credential: { action: "keep" },
    value: { id: "test", name: "Test", protocol: "openai-responses", baseUrl: "https://example.invalid", auth: "none", enabled: true } });
  const result = await service.configuration.execute({ type: "model.save", id: null, value: {
    providerId: "test", name: "Test", modelId: "test", enabled: true, contextWindow: null,
    capabilities: { tools: true, reasoning: false, inputMediaTypes: [] }, generation: { temperature: null, topP: null, maxOutputTokens: null },
  } });
  return { role: "default", model: result.savedId! };
}
function counter(options: { onRead?: (object: ObjectReader) => void; failCreate?: boolean; onCreate?: (object: ObjectExecutor) => void; afterCreate?: (object: ObjectExecutor) => void; afterAction?: (object: ObjectExecutor) => void; observe?: (record: SessionRecord, context: PluginContext) => void } = {}) {
  let context!: PluginContext;
  const plugin = definePlugin({ namespace: ns, version: "1.0.0", modules: [defineModule(plugin => {
    context = plugin;
    return {
      resources: [implementResource(Counter, View, {
        records: [Changed],
        creation: implementCreation(CreateCounter, {
          create(value, object) {
            options.onCreate?.(object);
            object.commit(writer => { writer.set(State, value); writer.append(Changed, { value }); });
            options.afterCreate?.(object);
            if (options.failCreate) throw new Error("Creation failed.");
            return { title: "Counter", data: {} };
          },
        }),
        actions: [implementAction(ChangeCount, {
          prepare: input => ({ action: "replace", input: { amount: input.amount + 1 } }),
          async execute(input, object) {
            object.commit(writer => {
              const value = object.get(State)! + input.amount;
              writer.set(State, value); writer.append(Changed, { value });
            });
            options.afterAction?.(object);
          },
        })],
        project: (_data, object) => { options.onRead?.(object); return { value: object.get(State)! }; },
        inspect: async (_data, object) => ({ value: object.get(State)! }),
      })],
      observers: [{ id: "observe", committed(event) { for (const record of event.records) options.observe?.(record, plugin); } }],
    };
  })] });
  return { plugin, context: () => context };
}
async function create(service: ApplicationService, sessionId: string, input = 1) {
  await service.sessions.execute({ type: "resource.create", sessionId, kind: Counter.kind, creation: { id: "test.counter/create" }, input, position: { x: 0, y: 0 } });
  return service.sessions.snapshot(sessionId).workbench.objects.find(object => object.kind === Counter.kind)!.id;
}

describe("工作台 SDK 的宿主实现", () => {
  it("读取门面不暴露对象或嵌套会话的修改能力", async () => {
    let reader!: ObjectReader;
    const c = counter({ onRead: value => { reader = value; } });
    const { service, sessionId } = open([c.plugin]);
    await create(service, sessionId);
    service.sessions.snapshot(sessionId);
    expect(reader.get(State)).toBe(1);
    expect(reader).not.toHaveProperty("commit");
    expect(reader).not.toHaveProperty("streams");
    expect(reader.session).not.toHaveProperty("commit");
    expect(reader.session).not.toHaveProperty("resume");
    expect(reader.session.title).not.toHaveProperty("propose");
  });
  it("动作按宿主契约校验身份、资源归属和输入，拒绝不留下写入", async () => {
    const c = counter();
    const { service, sessionId } = open([c.plugin]);
    const objectId = await create(service, sessionId);
    const before = service.sessions.tree.nodes(sessionId).length;
    for (const command of [
      { ...resourceCall(ChangeCount, { amount: 1 }), id: "test.counter/missing" },
      { id: SubmitAgentInput.id, input: { amount: 1 } },
      { id: ChangeCount.id, input: { amount: "wrong" } },
    ]) {
      await expect(service.sessions.execute({ type: "resource.command", sessionId, objectId, command })).rejects.toMatchObject({ code: "invalid_request" });
    }
    expect(service.sessions.tree.nodes(sessionId)).toHaveLength(before);
    expect(c.context().object({ sessionId, id: objectId, kind: Counter.kind }).get(State)).toBe(1);
  });
  it("创建输入只解析一次，准备接受后 create 使用转换结果", async () => {
    const transform = vi.fn((value: number) => value + 1);
    const contract = defineCreation(Counter, { id: ns.name("transform"), schema: z.number().transform(transform) });
    const created = vi.fn(() => ({ title: "Counter", data: {} }));
    const prepare = vi.fn(() => ({ action: "accept" as const }));
    const plugin = definePlugin({ namespace: ns, version: "1", modules: [defineModule(() => ({
      resources: [implementResource(Counter, View, {
        creation: implementCreation(contract, { prepare, create: created }), project: () => ({ value: 0 }), inspect: async () => null,
      })],
    }))] });
    const { service, sessionId } = open([plugin]);
    await service.sessions.execute({ type: "resource.create", sessionId, kind: Counter.kind,
      creation: { id: contract.id }, input: 0, position: { x: 0, y: 0 } });
    expect(transform.mock.calls.map(([value]) => value)).toEqual([0]);
    expect(prepare).toHaveBeenCalledWith(1, { signal: expect.any(AbortSignal), content: expect.objectContaining({ read: expect.any(Function), stage: expect.any(Function) }) });
    expect(created).toHaveBeenCalledWith(1, expect.anything());
  });
  it("动作准备沿用解析结果，替换作为新输入只经资源所有者 schema 解析一次", async () => {
    const transform = vi.fn((value: string) => Number(value) + 1);
    const action = defineAction(Counter, { id: ns.name("transform"), schema: z.string().regex(/^\d+$/u).transform(transform) });
    const seen: number[] = [], executed = vi.fn();
    const c = counter();
    const plugin = definePlugin({ ...c.plugin, modules: [defineModule(context => {
      const contribution = c.plugin.modules[0]!.setup(context);
      return { ...contribution, resources: contribution.resources!.map(resource => ({
        ...resource, actions: [implementAction(action, {
          prepare(value) { seen.push(value); return { action: "accept" }; },
          async execute(value) { executed(value); },
        })],
      })) };
    })] });
    let replacement = "10";
    const preparers = definePlugin({ namespace: pluginNamespace("test.prepare"), version: "1", modules: [defineModule(() => ({
      preparers: [
        implementPreparer(action, { id: "accept", prepare(value) { seen.push(value); return { action: "accept" }; } }),
        implementPreparer(action, { id: "replace", prepare() { return { action: "replace" as const, input: replacement }; } }),
        implementPreparer(action, { id: "after", prepare(value) { seen.push(value); return { action: "accept" }; } }),
      ],
    }))] });
    const { service, sessionId } = open([plugin, preparers]);
    const objectId = await create(service, sessionId);
    const invoke = () => service.sessions.execute({ type: "resource.command", sessionId, objectId, command: resourceCall(action, "0") });
    await invoke();
    expect(seen).toEqual([1, 11, 11]);
    expect(transform.mock.calls.map(([value]) => value)).toEqual(["0", "10"]);
    expect(executed).toHaveBeenCalledExactlyOnceWith(11);
    replacement = "invalid";
    await expect(invoke()).rejects.toMatchObject({ code: "invalid_request" });
    expect(executed).toHaveBeenCalledTimes(1);
  });
  it("记录可重复引用同一声明，独立副本即使 ID 相同也冲突", async () => {
    const c = counter();
    const plugin = definePlugin({ ...c.plugin, modules: [...c.plugin.modules, defineModule(() => ({ records: [Changed] }))] });
    const { service, sessionId } = open([plugin]);
    expect(service.sessions.plugins.find(entry => entry.id === ns.id)?.status).toBe("loaded");
    const session = c.context().session(sessionId);
    session.commit(writer => { writer.append(Changed, { value: 4 }); });
    expect(session.snapshot().records.first(Changed, { scope: "path" })).toMatchObject({ status: "known", data: { value: 4 } });
    const conflict = definePlugin({ ...c.plugin, modules: [...c.plugin.modules,
      defineModule(() => ({ records: [defineRecord(Changed.id, { schema: Changed.schema })] })),
    ] });
    const other = open([conflict]);
    expect(other.service.sessions.plugins.find(entry => entry.id === ns.id)?.status).toBe("failed");
  });
  it("关闭取消并等待在途准备，准备结束前不释放宿主设施", async () => {
    const c = counter();
    let preparationSignal!: AbortSignal;
    let begin!: () => void, release!: () => void;
    const started = new Promise<void>(resolve => { begin = resolve; });
    const held = new Promise<void>(resolve => { release = resolve; });
    const observer = definePlugin({ namespace: pluginNamespace("test.prepare-close"), version: "1", modules: [defineModule(() => ({
      preparers: [{ id: "hold", contract: ChangeCount, async prepare(_input, { signal }) {
        preparationSignal = signal; begin(); await held; return { action: "accept" };
      } }],
    }))] });
    const { service, sessionId } = open([c.plugin, observer]);
    const objectId = await create(service, sessionId);
    const invocation = service.sessions.execute({ type: "resource.command", sessionId, objectId, command: resourceCall(ChangeCount, { amount: 1 }) });
    const rejected = expect(invocation).rejects.toThrow();
    await started;
    let closed = false;
    const closing = service.close().then(() => { closed = true; });
    services.splice(services.indexOf(service), 1);
    expect(preparationSignal.aborted).toBe(true);
    await Promise.resolve();
    expect(closed).toBe(false);
    release();
    await Promise.all([closing, rejected]);
    expect(closed).toBe(true);
  });
  it("普通动作提交后续接退出自身分支，后续写入仍须检查当前路径", async () => {
    const c = counter({ afterAction: object => {
      object.session.resume();
      object.commit(writer => { writer.set(State, 9); });
    } });
    const { service, sessionId } = open([c.plugin]);
    service.sessions.tree.append(sessionId, { ...emptyCompletion, kind: "thinking", agentId: "agent", text: "Reasoning",
      responseId: "interrupted", requestParentId: null, ordinal: 0, complete: true, model: "test/test",
      adapter: "test", scope: "test", continuation: null });
    const id = await create(service, sessionId, 1);
    await expect(service.sessions.execute({ type: "resource.command", sessionId, objectId: id, command: resourceCall(ChangeCount, { amount: 0 }) }))
      .rejects.toMatchObject({ code: "unavailable" });
    expect(service.sessions.tree.cursor(sessionId)).toBeNull();
    expect(c.context().object({ sessionId, id, kind: Counter.kind }).get(State)).toBe(2);
  });
  it("首页 prepare 不能将首条输入替换成不提交输入的动作", async () => {
    const namespace = pluginNamespace("test.first-input");
    const plugin = definePlugin({ namespace, version: "1", modules: [defineModule(() => ({
      preparers: [{ id: "cancel", contract: SubmitAgentInput,
        prepare: () => ({ action: "replace", input: { type: "cancel" } }) }],
    }))] });
    const { service } = open([plugin]);
    const target = await configureModel(service);
    const before = service.sessions.tree.list();
    await expect(service.sessions.execute({ type: "start", submissionId: crypto.randomUUID(),
      agent: "worker", model: target.model, thinking: null, parts: [{ kind: "text", text: "First" }] })).rejects.toMatchObject({ code: "invalid_request" });
    expect(service.sessions.tree.list()).toEqual(before);
    expect(service.sessions.running).toBe(false);
  });
  it("创建事务中能读到刚保存的对象数据", async () => {
    let value: number | null = null;
    const c = counter({ afterCreate: object => { value = object.get(State); } });
    const { service, sessionId } = open([c.plugin]);
    await create(service, sessionId, 7);
    expect(value).toBe(7);
  });
  it("会话数据与对象数据隔离，纯数据提交通知视图但不追加历史，失败同事务回滚", async () => {
    const observed: SessionRecord[] = [];
    const c = counter({ observe: record => observed.push(record) });
    const notifications: string[] = [];
    const { service, sessionId } = open([c.plugin], undefined, event => notifications.push(event.kind));
    const id = await create(service, sessionId, 3);
    const session = c.context().session(sessionId);
    const object = c.context().object({ sessionId, id, kind: Counter.kind });
    const other = c.context().session(service.sessions.tree.create("Other"));
    const before = service.sessions.tree.nodes(sessionId);
    observed.length = notifications.length = 0;
    session.commit(writer => { writer.set(State, 8); });
    expect(session.get(State)).toBe(8);
    expect(object.get(State)).toBe(3);
    expect(other.get(State)).toBeNull();
    expect(service.sessions.tree.nodes(sessionId)).toEqual(before);
    expect(observed).toEqual([]);
    expect(notifications).toEqual(["session.changed"]);
    notifications.length = 0;
    expect(() => session.commit(writer => {
      writer.set(State, 9);
      object.commit(inner => { inner.set(State, 10); inner.append(Changed, { value: 10 }); });
      throw new Error("Rollback.");
    })).toThrow("Rollback.");
    expect(session.get(State)).toBe(8);
    expect(object.get(State)).toBe(3);
    expect(service.sessions.tree.nodes(sessionId)).toEqual(before);
    expect(observed).toEqual([]);
    expect(notifications).toEqual([]);
    const foreign = pluginNamespace("other.plugin").data("state", z.number());
    expect(() => session.commit(writer => { writer.set(foreign, 1); })).toThrow(/another plugin/);
  });

  it("数据按实际形状读取，兼容声明继续读取，不兼容声明拒绝且不改写原值", async () => {
    const c = counter();
    const nextState = ns.data("state", z.number().int());
    const nextRecord = defineRecord(ns.name("next"), { schema: z.number() });
    const plugin = definePlugin({ ...c.plugin, modules: [...c.plugin.modules, defineModule(() => ({ records: [nextRecord] }))] });
    const { service, sessionId } = open([plugin]);
    const session = c.context().session(sessionId);
    session.commit(writer => { writer.set(nextState, 12); writer.append(nextRecord, 12); });
    expect(session.get(nextState)).toBe(12);
    expect(session.get(State)).toBe(12);
    expect(() => session.get(ns.data("state", z.string()))).toThrow(/schema/);
    expect(session.get(State)).toBe(12);
    expect(session.snapshot().records.first(nextRecord, { scope: "path" })).toMatchObject({
      status: "known", data: 12, record: { contract: { id: nextRecord.id } },
    });
  });

  it("笔记具型状态支持空正文，缺失或损坏时卡片回退且工具不覆盖", async () => {
    let modules!: ReturnType<typeof runtimeModules.createModules>;
    let data!: SessionDataStore;
    const createModules = runtimeModules.createModules;
    vi.spyOn(runtimeModules, "createModules").mockImplementation((...args) => {
      data = args[0].data; modules = createModules(...args); return modules;
    });
    const { service, sessionId } = open([]);
    await service.sessions.execute({ type: "resource.create", sessionId, kind: Note.kind, creation: { id: "atelier.core/note.create" }, input: {}, position: { x: 0, y: 0 } });
    const note = foldWorkbench(service.sessions.tree.path(sessionId)).objects.find(object => object.kind === Note.kind)!;
    expect(note.title).toBe("Untitled note");
    expect(data.get(sessionId, note.id, NoteContent.id)).toEqual({ text: "" });
    expect(modules.resources.project(note).data).toEqual({ text: "" });
    const call = async (name: string, args: Record<string, never> | { content: string }) => {
      const invocation = modules.tools.match(note).find(tool => tool.tool.name === name)!.prepare(note, null, args);
      if (!("execute" in invocation)) throw new Error("Expected a tool invocation.");
      return invocation.execute(new AbortController().signal);
    };
    for (const value of [null, { text: 42 }]) {
      data.set(sessionId, note.id, NoteContent.id, value);
      expect(modules.resources.project(note).data).toEqual({ text: null });
      expect(await modules.resources.inspect(note)).toMatchObject({ title: "Untitled note", available: false, length: null });
      expect(await call("read", {})).toMatchObject({ kind: "rejected", error: { code: "note_unavailable" } });
      expect(await call("write", { content: "replacement" })).toMatchObject({ kind: "rejected", error: { code: "note_unavailable" } });
      expect(data.get(sessionId, note.id, NoteContent.id)).toEqual(value);
    }
  });

  it("当前数据库格式保存笔记契约状态，不支持的版本拒绝打开并保留数据", async () => {
    const { root, service, sessionId } = open([]);
    await service.sessions.execute({ type: "resource.create", sessionId, kind: Note.kind, creation: { id: "atelier.core/note.create" },
      input: { content: "Saved text" }, position: { x: 0, y: 0 } });
    await service.close(); services.splice(services.indexOf(service), 1);
    const file = join(root, applicationStorage.databaseDirectory, applicationStorage.databaseFile);
    const db = new DatabaseSync(file);
    try {
      expect(db.prepare("PRAGMA user_version").get()).toMatchObject({ user_version: 16 });
      expect(db.prepare("SELECT contract_id, data_json FROM session_data").all())
        .toMatchObject([{ contract_id: NoteContent.id, data_json: JSON.stringify({ text: "Saved text" }) }]);
      db.exec("PRAGMA user_version = 1");
    } finally { db.close(); }
    expect(() => new ApplicationService(root)).toThrow(DatabaseVersionError);
    const unchanged = new DatabaseSync(file);
    try {
      expect(unchanged.prepare("PRAGMA user_version").get()).toMatchObject({ user_version: 1 });
      expect(unchanged.prepare("SELECT data_json FROM session_data").all())
        .toMatchObject([{ data_json: JSON.stringify({ text: "Saved text" }) }]);
    } finally { unchanged.close(); }
  });

  it("内置目录经 SDK 创建，默认或自定标题和路径沿用原有事件与卡片格式", async () => {
    const { root, service, sessionId } = open([]);
    const directory = join(root, "directory"); mkdirSync(directory);
    expect(service.sessions.plugins.find(plugin => plugin.id === "atelier.core")?.status).toBe("loaded");
    for (const title of [undefined, "  Materials  "]) {
      await service.sessions.execute({ type: "resource.create", sessionId, kind: Directory.kind, creation: { id: "atelier.core/directory.create" },
        input: { path: directory, ...(title ? { title } : {}) }, position: { x: 0, y: 0 } });
    }
    const snapshot = service.sessions.snapshot(sessionId);
    const directories = snapshot.workbench.objects.filter(object => object.kind === Directory.kind);
    expect(directories.map(object => object.title)).toEqual(["directory", "Materials"]);
    expect(directories.map(object => object.presentation)).toEqual([
      { contract: { id: DirectoryView.id }, data: { path: directory } },
      { contract: { id: DirectoryView.id }, data: { path: directory } },
    ]);
    expect(service.sessions.tree.nodes(sessionId).filter(node => node.kind === "event" && node.type === "resource_created"))
      .toMatchObject([{ data: { type: Directory.kind, title: "directory", path: directory } },
        { data: { type: Directory.kind, title: "Materials", path: directory } }]);
  });

  it("目录创建的 schema 与路径拒绝映为 invalid_request，失败不留下对象或事件", async () => {
    const { root, service, sessionId } = open([]);
    const file = join(root, "file.txt"); writeFileSync(file, "text");
    for (const input of [{ path: 42 }, { path: "relative" }, { path: join(root, "missing") }, { path: file }]) {
      await expect(service.sessions.execute({ type: "resource.create", sessionId, kind: Directory.kind, creation: { id: "atelier.core/directory.create" },
        input, position: { x: 0, y: 0 } })).rejects.toMatchObject({ code: "invalid_request" });
    }
    expect(service.sessions.tree.nodes(sessionId)).toEqual([]);
    expect(service.sessions.snapshot(sessionId).workbench.objects).toEqual([]);
  });

  it("不依赖 Agent 的资源创建与事件、状态同事务，信封关联真实资源种类", async () => {
    const observed: SessionRecord[] = [];
    const c = counter({ observe: record => observed.push(record) });
    const { service, sessionId } = open([c.plugin]);
    expect(service.sessions.plugins.find(plugin => plugin.id === ns.id)?.status).toBe("loaded");
    const id = await create(service, sessionId, 3);
    const snapshot = c.context().session(sessionId).snapshot();
    expect(snapshot.resources.get(Counter, id)?.status).toBe("known");
    expect(snapshot.records.first(Changed, { scope: "path" })).toMatchObject({ status: "known", data: { value: 3 }, record: { resource: { id, kind: Counter.kind } } });
    expect(observed.map(record => record.contract.id)).toEqual([Changed.id, "resource_created"]);
    expect(service.sessions.snapshot(sessionId).workbench.objects.find(object => object.id === id)?.presentation.data).toEqual({ value: 3 });
    expect(c.context()).not.toHaveProperty("state");
    expect(c.context().session(sessionId)).not.toHaveProperty("nodes");
    expect(c.context().models).toHaveProperty("run");
    expect(c.context().object({ sessionId, id, kind: Counter.kind })).not.toHaveProperty("run");
  });

  it("外部 prepare 按目标资源 schema 校验后，进入资源自己的 prepare", async () => {
    const c = counter();
    const other = pluginNamespace("test.prepare");
    const order: number[] = [];
    let invalid = false;
    const prepare = definePlugin({ namespace: other, version: "1", modules: [defineModule(() => ({
      preparers: [{ id: "double", contract: ChangeCount, prepare(input) {
        const amount = Command.parse(input).amount; order.push(amount);
        return { action: "replace", input: { amount: invalid ? "bad" : amount * 2 } };
      } }],
    }))] });
    const { service, sessionId } = open([c.plugin, prepare]);
    const id = await create(service, sessionId);
    await service.sessions.execute({ type: "resource.command", sessionId, objectId: id, command: resourceCall(ChangeCount, { amount: 2 }) });
    expect(order).toEqual([2]);
    expect(c.context().object({ sessionId, id, kind: Counter.kind }).get(State)).toBe(6);
    invalid = true;
    await expect(service.sessions.execute({ type: "resource.command", sessionId, objectId: id, command: resourceCall(ChangeCount, { amount: 2 }) })).rejects.toThrow(/input/);
    expect(c.context().object({ sessionId, id, kind: Counter.kind }).get(State)).toBe(6);
  });

  it("SDK 工具经同一个宿主目录调用，具型参数与产出在适配边界校验", async () => {
    const c = counter();
    const tool = defineTool({ id: "test.tools/counter_read", name: "counter_read", description: "Read the counter.", guidelines: [],
      argsSchema: z.strictObject({}).describe("No arguments.") });
    const implementation = defineImplementation({
      ...ns.data("read-result", z.number().describe("The current counter value.")),
      resource: Counter, tool, targetSchema: z.null().describe("The whole counter."), effect: "read", execution: "parallel",
    });
    let toolObject!: ObjectExecutor;
    const plugin = definePlugin({ ...c.plugin, modules: [...c.plugin.modules, defineModule(() => ({
      tools: [implementTool(implementation, { async call(_data, _target, _args, context) {
        toolObject = context.object;
        context.publish(context.object.get(State)!);
        return { kind: "succeeded", data: context.object.get(State)! };
      } })],
    }))] });
    let tools!: ToolRegistry;
    const original = runtimeModules.createModules;
    vi.spyOn(runtimeModules, "createModules").mockImplementation((...args) => {
      const modules = original(...args); tools = modules.tools; return modules;
    });
    const { service, sessionId } = open([plugin]);
    await create(service, sessionId, 4);
    const resource = foldWorkbench(service.sessions.tree.path(sessionId)).objects[0]!;
    const adapted = tools.match(resource)[0]!;
    expect(adapted.prepare(resource, "null", {})).toMatchObject({ kind: "rejected", error: { code: "invalid_arguments" } });
    const invocation = adapted.prepare(resource, null, {});
    if (!("execute" in invocation)) throw new Error("Expected a tool invocation.");
    const progress: unknown[] = [];
    expect(await invocation.execute(new AbortController().signal, data => progress.push(data))).toEqual({ kind: "succeeded", data: 4 });
    expect(progress).toEqual([4]);
    expect(() => toolObject.commit(writer => { writer.set(State, 5); })).toThrow(/execution scope is closed/);
    expect(() => toolObject.session.commit(writer => { writer.set(State, 5); })).toThrow(/execution scope is closed/);
    expect(() => toolObject.session.resume()).toThrow(/execution scope is closed/);
    expect(() => toolObject.session.title.propose("Late", { expected: "Counter" })).toThrow(/execution scope is closed/);
    expect(() => toolObject.streams.publish("late", new Uint8Array())).toThrow(/execution scope is closed/);
  });

  it("创建失败回滚对象状态和记录；临时对象门面不能越过失败创建", async () => {
    let provisional!: ObjectExecutor;
    const observed: SessionRecord[] = [];
    const c = counter({ failCreate: true, onCreate: object => { provisional = object; }, observe: record => observed.push(record) });
    const { service, sessionId } = open([c.plugin]);
    await expect(create(service, sessionId)).rejects.toThrow("Creation failed.");
    expect(service.sessions.tree.nodes(sessionId)).toEqual([]);
    expect(observed).toEqual([]);
    expect(() => provisional.get(State)).toThrow(/reference/);
    expect(() => provisional.commit(writer => { writer.set(State, 9); })).toThrow(/reference/);
  });

  it("提交拒绝异步与逃逸 writer，声明 schema 不能用同 ID 的伪造契约绕过", async () => {
    const c = counter(); const { service, sessionId } = open([c.plugin]);
    const id = await create(service, sessionId);
    const object = c.context().object({ sessionId, id, kind: Counter.kind });
    const count = service.sessions.tree.nodes(sessionId).length;
    let escaped!: ObjectWriter;
    expect(() => object.commit(((writer: ObjectWriter) => {
      escaped = writer; writer.set(State, 99); writer.append(Changed, { value: 99 }); return Promise.resolve();
    }) as unknown as Parameters<ObjectExecutor["commit"]>[0])).toThrow(/synchronously/);
    expect(() => escaped.set(State, 123)).toThrow(/outside/);
    expect(object.get(State)).toBe(1);
    expect(service.sessions.tree.nodes(sessionId)).toHaveLength(count);
    const forged = defineRecord(Changed.id, { schema: z.object({ value: z.string() }) });
    expect(() => object.commit(writer => { writer.append(forged, { value: "invalid" }); })).toThrow(/declared record contract instance/);
    const undeclared = defineRecord(ns.name("undeclared"), { schema: z.number() });
    expect(() => object.commit(writer => { writer.append(undeclared, 1); })).toThrow(/did not declare/);
  });

  it("对象身份和当前路径由宿主核对，固定快照不随新提交变化", async () => {
    const c = counter(); const { service, sessionId } = open([c.plugin]);
    const id = await create(service, sessionId);
    const snapshot = c.context().session(sessionId).snapshot();
    const object = c.context().object({ sessionId, id, kind: Counter.kind });
    expect(() => c.context().object({ sessionId: "wrong", id, kind: Counter.kind })).toThrow(/reference/);
    expect(() => c.context().object({ sessionId, id: "missing", kind: Counter.kind })).toThrow(/reference/);
    expect(() => c.context().object({ sessionId, id, kind: "foreign.plugin/thing" })).toThrow(/another plugin/);
    object.commit(writer => { writer.append(Changed, { value: 2 }); });
    expect(snapshot.records.all({ scope: "session" })).toHaveLength(2);
    expect(c.context().session(sessionId).snapshot().records.all({ scope: "session" })).toHaveLength(3);
    await service.sessions.execute({ type: "object.remove", sessionId, objectId: id });
    expect(() => object.commit(writer => { writer.set(State, 5); })).toThrow(/current session path/);
  });

  it("纯会话事件插件只声明自己的领域；观察者追加排队且保留原批次快照", () => {
    const eventNs = pluginNamespace("test.events");
    const Input = defineRecord(eventNs.name("input"), { schema: z.string() });
    const Follow = defineRecord(eventNs.name("follow"), { schema: z.string() });
    let context!: PluginContext;
    const seen: [string, number][] = [];
    const plugin = definePlugin({ namespace: eventNs, version: "1", modules: [defineModule(plugin => {
      context = plugin;
      return { records: [Input, Follow], observers: [
        { id: "append", committed(event) {
          if (event.records.some(record => Input.decode(record))) event.session.commit(writer => { writer.append(Follow, "second"); });
        } },
        { id: "read", committed(event) {
          seen.push([event.records[0]!.contract.id, event.snapshot.records.all({ scope: "session" }).length]);
        } },
      ] };
    })] });
    const { service, sessionId } = open([plugin]);
    context.session(sessionId).commit(writer => { writer.append(Input, "first"); });
    expect(seen).toEqual([[Input.id, 1], [Follow.id, 2]]);
    expect(context.session(sessionId).snapshot().records.first(Input, { scope: "path" })).toMatchObject({ status: "known", data: "first", record: { resource: null } });
    expect(service.sessions.tree.nodes(sessionId)).toHaveLength(2);
  });

  it("标题比较更新与来源事件同事务生效，后续异常回滚且观察者只看到一致状态", () => {
    const seen: [string, number][] = [];
    const c = counter({ observe: (record, plugin) => {
      const changed = Changed.decode(record);
      if (changed?.status === "known") seen.push([plugin.session(record.sessionId).title.get(), changed.data.value]);
    } });
    const { service, sessionId } = open([c.plugin]);
    const session = c.context().session(sessionId);
    expect(() => session.commit(writer => {
      expect(session.title.propose("Rolled back", { expected: "Counter" })).toBe(true);
      writer.append(Changed, { value: 1 });
      throw new Error("Reject this commit.");
    })).toThrow("Reject this commit.");
    expect(session.title.get()).toBe("Counter");
    expect(session.snapshot().records.last(Changed, { scope: "session" })).toBeNull();
    expect(seen).toEqual([]);
    session.commit(writer => {
      expect(session.title.propose("Applied", { expected: "Counter" })).toBe(true);
      writer.append(Changed, { value: 2 });
    });
    expect(session.title.get()).toBe("Applied");
    expect(session.snapshot().records.last(Changed, { scope: "session" })).toMatchObject({ data: { value: 2 } });
    expect(seen).toEqual([["Applied", 2]]);
    session.commit(writer => {
      if (session.title.propose("Stale", { expected: "Counter" })) writer.append(Changed, { value: 3 });
    });
    expect(session.title.get()).toBe("Applied");
    expect(session.snapshot().records.query(Changed, { scope: "session" })).toHaveLength(1);
    const other = service.sessions.tree.create("Other");
    expect(() => session.commit(() => {
      c.context().session(other).title.propose("Foreign", { expected: "Other" });
    })).toThrow(/cannot rename another session/);
    expect(c.context().session(other).title.get()).toBe("Other");
  });

  it("公开 run 交付单次执行事件，由插件声明的记录保存；没有隐式历史或下一请求", async () => {
    const c = counter();
    const Execution = defineRecord(ns.name("execution"), { schema: modelRunRecordSchema });
    const plugin = definePlugin({ ...c.plugin, modules: [...c.plugin.modules, defineModule(() => ({ records: [Execution] }))] });
    const inputs: ModelInput[] = [];
    const { service, sessionId } = open([plugin], () => ({ validate() {}, version: "test-adapter", prepare(input) {
      inputs.push(structuredClone(input));
      return { async *stream() {
        yield { type: "part.start", part: { id: "c", kind: "toolcall", callId: "c", name: "resource_list" } };
        yield { type: "part.end", partId: "c", arguments: {} };
        yield { type: "finish", reason: "tool-calls", usage: null };
      } };
    } }));
    const target = await configureModel(service);
    const id = await create(service, sessionId);
    const object = c.context().object({ sessionId, id, kind: Counter.kind });
    const before = object.session.snapshot();
    const result = await c.context().models.run({ object: object.ref, requestParentId: before.position.nodeId,
      target, system: { blocks: [] }, messages: [{ kind: "input", parts: [{ kind: "text", text: "First projection" }] }], signal: new AbortController().signal,
      observer: { event(event) { if (event.type !== "progress") object.commit(writer => { writer.append(Execution, modelRunRecordSchema.parse(event)); }); } },
    });
    expect(result).toMatchObject({ reason: "completed", tools: [{ kind: "succeeded" }], source: { adapter: "test-adapter" } });
    expect(inputs).toHaveLength(1);
    expect(object.session.snapshot().records.query(Execution, { scope: "path" }).map(record => record.status)).toEqual(["known", "known"]);
    expect(service.sessions.tree.nodes(sessionId).every(node => node.kind === "event")).toBe(true);
    const count = service.sessions.tree.nodes(sessionId).length;
    await c.context().models.run({ object: object.ref, requestParentId: object.session.snapshot().position.nodeId,
      target, system: { blocks: [] }, messages: [{ kind: "input", parts: [{ kind: "text", text: "Second projection" }] }], signal: new AbortController().signal,
      observer: { event() {} },
    });
    expect(inputs.map(input => input.messages)).toEqual([[{ kind: "input", parts: [{ kind: "text", text: "First projection" }] }], [{ kind: "input", parts: [{ kind: "text", text: "Second projection" }] }]]);
    expect(service.sessions.tree.nodes(sessionId)).toHaveLength(count);
    const streamRequest = {
      target, system: { blocks: [] }, messages: [{ kind: "input" as const, parts: [{ kind: "text" as const, text: "Generate a title" }] }], signal: new AbortController().signal,
    };
    const stream = [];
    const iterable = c.context().models.stream(streamRequest);
    const first = iterable[Symbol.asyncIterator]().next();
    streamRequest.messages[0]!.parts[0]!.text = "Changed after the request began";
    const head = await first;
    if (!head.done) stream.push(head.value);
    for await (const event of iterable) stream.push(event);
    expect(inputs[2]!.tools).toEqual([]);
    expect(inputs[2]!.messages).toEqual([{ kind: "input", parts: [{ kind: "text" as const, text: "Generate a title" }] }]);
    expect(stream.at(-1)).toMatchObject({ type: "finish", source: { adapter: "test-adapter" } });
    expect(service.sessions.tree.nodes(sessionId)).toHaveLength(count);
    expect(service.sessions.running).toBe(false);
  });

  it.each(["cancel", "close"] as const)("运行中的 SDK 请求受收束规则保护，%s 后部分内容可提交到时间轴", async mode => {
    const c = counter();
    const Execution = defineRecord(ns.name("execution"), { schema: modelRunRecordSchema });
    const plugin = definePlugin({ ...c.plugin, modules: [...c.plugin.modules, defineModule(() => ({ records: [Execution] }))] });
    const { service, sessionId } = open([plugin], () => ({ validate() {}, version: "test", prepare() {
      return { async *stream(signal) {
        yield { type: "part.start", part: { id: "t", kind: "text" } };
        yield { type: "part.delta", partId: "t", delta: "Partial" };
        await new Promise<void>(resolve => { if (signal.aborted) resolve(); else signal.addEventListener("abort", () => resolve(), { once: true }); });
        signal.throwIfAborted();
      } };
    } }));
    const target = await configureModel(service);
    const id = await create(service, sessionId);
    const ref = { sessionId, id, kind: Counter.kind };
    const object = c.context().object(ref);
    const controller = new AbortController();
    const events: ModelRunEvent[] = [];
    let ready!: () => void;
    const started = new Promise<void>(resolve => { ready = resolve; });
    const request = { object: ref, requestParentId: c.context().session(sessionId).snapshot().position.nodeId,
      target, system: { blocks: [] }, messages: [], signal: controller.signal,
      observer: { event(event: ModelRunEvent): undefined {
        events.push(event);
        if (event.type === "progress" && event.blocks.some(block => block.kind === "text" && block.text === "Partial")) ready();
        if (event.type !== "progress") object.commit(writer => { writer.append(Execution, modelRunRecordSchema.parse(event)); });
      } },
    };
    const done = c.context().models.run(request);
    try {
      await started;
      expect(service.sessions.running).toBe(true);
      expect(() => c.context().models.run(request)).toThrow(/already running/);
      await expect(service.sessions.execute({ type: "select", sessionId, nodeId: null })).rejects.toThrow(/settle/);
      await expect(service.sessions.execute({ type: "object.remove", sessionId, objectId: id })).rejects.toThrow(/settle/);
    } finally {
      if (mode === "cancel") controller.abort();
      else {
        await service.close();
        services.splice(services.indexOf(service), 1);
      }
    }
    expect(await done).toMatchObject({ reason: "cancelled" });
    expect(events.find(event => event.type === "block")).toMatchObject({ block: { kind: "text", text: "Partial", complete: false } });
    if (mode === "cancel") expect(service.sessions.running).toBe(false);
    else expect(() => object.session.snapshot()).toThrow(/not available/);
  });
});
