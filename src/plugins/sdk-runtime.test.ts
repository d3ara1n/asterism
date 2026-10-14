import { thinkingLevels } from "@atelier/sdk/contracts";
import { mkdtempSync, rmSync } from "node:fs";
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
import { Agent, SubmitAgentInput } from "../modules/agent/contract.ts";
import { applicationStorage } from "../shared/application.ts";
import { flat } from "../session/test-nodes.ts";

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
    capabilities: { tools: true, reasoning: false, thinkingLevels: [...thinkingLevels] }, generation: { temperature: null, topP: null, maxOutputTokens: null },
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
    expect(reader.session.title).not.toHaveProperty("set");
  });
  it("动作按宿主契约校验身份、资源归属和输入，拒绝不留下写入", async () => {
    const c = counter();
    const { service, sessionId } = open([c.plugin]);
    const objectId = await create(service, sessionId);
    const before = service.sessions.tree.nodes(sessionId).map(flat).length;
    for (const command of [
      { ...resourceCall(ChangeCount, { amount: 1 }), id: "test.counter/missing" },
      { id: SubmitAgentInput.id, input: { amount: 1 } },
      { id: ChangeCount.id, input: { amount: "wrong" } },
    ]) {
      await expect(service.sessions.execute({ type: "resource.command", sessionId, objectId, command })).rejects.toMatchObject({ code: "invalid_request" });
    }
    expect(service.sessions.tree.nodes(sessionId).map(flat)).toHaveLength(before);
    expect(c.context().object(sessionId, Counter, objectId).get(State)).toBe(1);
  });
  it("创建输入只解析一次，准备接受后 create 使用转换结果", async () => {
    const transform = vi.fn((value: number) => value + 1);
    const contract = defineCreation(Counter, { id: ns.name("transform"), schema: z.number().transform(transform) });
    const created = vi.fn((_value: number) => ({ title: "Counter", data: {} }));
    const prepare = vi.fn((_value: number) => ({ action: "accept" as const }));
    const plugin = definePlugin({ namespace: ns, version: "1", modules: [defineModule(() => ({
      resources: [implementResource(Counter, View, {
        creation: implementCreation(contract, { prepare, create: created }), project: () => ({ value: 0 }), inspect: async () => null,
      })],
    }))] });
    const { service, sessionId } = open([plugin]);
    await service.sessions.execute({ type: "resource.create", sessionId, kind: Counter.kind,
      creation: { id: contract.id }, input: 0, position: { x: 0, y: 0 } });
    expect(transform).toHaveBeenCalledOnce();
    expect(prepare.mock.calls[0]?.[0]).toBe(1);
    expect(created.mock.calls[0]?.[0]).toBe(1);
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
    let replacement = "10", rejected = false;
    const preparers = definePlugin({ namespace: pluginNamespace("test.prepare"), version: "1", modules: [defineModule(() => ({
      preparers: [
        implementPreparer(action, { id: "accept", prepare(value) { seen.push(value); return { action: "accept" }; } }),
        implementPreparer(action, { id: "replace", prepare() { return { action: "replace" as const, input: replacement }; } }),
        implementPreparer(action, { id: "after", prepare(value) { seen.push(value); return rejected ? { action: "reject", code: "blocked", message: "Blocked by preparer." } : { action: "accept" }; } }),
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
    replacement = "10"; rejected = true;
    await expect(invoke()).rejects.toThrow("Blocked by preparer.");
    expect(executed).toHaveBeenCalledTimes(1);
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
  it("当前数据按会话和对象隔离，其他插件契约不能写入本作用域", async () => {
    const c = counter(), { service, sessionId } = open([c.plugin]);
    const id = await create(service, sessionId, 3), session = c.context().session(sessionId);
    session.commit(writer => { writer.set(State, 8); });
    expect(session.get(State)).toBe(8);
    expect(c.context().object(sessionId, Counter, id).get(State)).toBe(3);
    expect(c.context().session(service.sessions.tree.create("Other")).get(State)).toBeNull();
    const foreign = pluginNamespace("other.plugin").data("state", z.number());
    expect(() => session.commit(writer => { writer.set(foreign, 1); })).toThrow();
    expect(session.get(State)).toBe(8);
  });

  it("纯数据提交通知视图，不追加记录或调用记录观察者", async () => {
    const observed: SessionRecord[] = [], notifications: string[] = [];
    const c = counter({ observe: record => observed.push(record) });
    const { service, sessionId } = open([c.plugin], undefined, event => notifications.push(event.kind));
    await create(service, sessionId);
    const session = c.context().session(sessionId), before = session.snapshot().records.all({ scope: "session" });
    observed.length = notifications.length = 0;
    session.commit(writer => { writer.set(State, 8); });
    expect(session.get(State)).toBe(8);
    expect(session.snapshot().records.all({ scope: "session" })).toEqual(before);
    expect(observed).toEqual([]);
    expect(notifications).toContain("session.changed");
  });

  it("嵌套提交失败一起回滚数据和记录，不向视图或观察者交付未提交状态", async () => {
    const observed: SessionRecord[] = [], notifications: string[] = [];
    const c = counter({ observe: record => observed.push(record) });
    const { service, sessionId } = open([c.plugin], undefined, event => notifications.push(event.kind));
    const id = await create(service, sessionId, 3), session = c.context().session(sessionId), object = c.context().object(sessionId, Counter, id);
    const before = session.snapshot().records.all({ scope: "session" });
    session.commit(writer => { writer.set(State, 8); }); observed.length = notifications.length = 0;
    expect(() => session.commit(writer => {
      writer.set(State, 9);
      object.commit(inner => { inner.set(State, 10); inner.append(Changed, { value: 10 }); });
      throw new Error("Rollback.");
    })).toThrow("Rollback.");
    expect(session.get(State)).toBe(8); expect(object.get(State)).toBe(3);
    expect(session.snapshot().records.all({ scope: "session" })).toEqual(before);
    expect(observed).toEqual([]); expect(notifications).toEqual([]);
  });

  it("数据按实际形状读取，兼容声明继续读取，不兼容声明拒绝且不改写原值", async () => {
    const c = counter();
    const nextState = ns.data("state", z.number().int());
    const { service, sessionId } = open([c.plugin]);
    const session = c.context().session(sessionId);
    session.commit(writer => { writer.set(nextState, 12); });
    expect(session.get(nextState)).toBe(12);
    expect(session.get(State)).toBe(12);
    expect(() => session.get(ns.data("state", z.string()))).toThrow();
    expect(session.get(State)).toBe(12);
  });

  it("不支持的数据库版本拒绝打开，既有插件数据与记录不变", async () => {
    const c = counter(), { root, service, sessionId } = open([c.plugin]);
    const id = await create(service, sessionId, 42);
    await service.close(); services.splice(services.indexOf(service), 1);
    const file = join(root, applicationStorage.databaseDirectory, applicationStorage.databaseFile);
    const db = new DatabaseSync(file);
    const version = Number(db.prepare("PRAGMA user_version").get()!.user_version);
    try { db.exec("PRAGMA user_version = 999"); } finally { db.close(); }
    expect(() => new ApplicationService(root)).toThrow(DatabaseVersionError);
    const unchanged = new DatabaseSync(file);
    try {
      expect(unchanged.prepare("PRAGMA user_version").get()).toMatchObject({ user_version: 999 });
      unchanged.exec("PRAGMA user_version = " + version);
    } finally { unchanged.close(); }
    const reopened = new ApplicationService(root, { plugins: [c.plugin] }); services.push(reopened);
    expect(c.context().object(sessionId, Counter, id).get(State)).toBe(42);
    expect(c.context().session(sessionId).snapshot().records.first(Changed, { scope: "timeline" })).toMatchObject({ data: { value: 42 } });
  });

  it("不依赖 Agent 的资源创建与事件、状态同事务，信封关联真实资源种类", async () => {
    const observed: SessionRecord[] = [];
    let createdValue: number | null = null;
    const c = counter({ observe: record => observed.push(record), afterCreate: object => { createdValue = object.get(State); } });
    const { service, sessionId } = open([c.plugin]);
    const id = await create(service, sessionId, 3);
    expect(createdValue).toBe(3);
    const snapshot = c.context().session(sessionId).snapshot();
    expect(snapshot.resources.get(Counter, id)?.status).toBe("known");
    expect(snapshot.records.first(Changed, { scope: "timeline" })).toMatchObject({ status: "known", data: { value: 3 }, record: { source: { plugin: "test.counter", resource: { id, kind: Counter.kind } } } });
    expect(observed.map(record => record.contract.id)).toEqual([Changed.id, "resource_created"]);
    expect(service.sessions.snapshot(sessionId).workbench.objects.find(object => object.id === id)?.presentation.data).toEqual({ value: 3 });
    const session = c.context().session(sessionId);
    session.commit(writer => { writer.append(Changed, { value: 4 }); });
    expect(session.snapshot().records.last(Changed, { scope: "session" })).toMatchObject({
      record: { source: { plugin: ns.id, resource: null } }, data: { value: 4 },
    });
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
    const resource = foldWorkbench(service.sessions.tree.timeline(sessionId).map(flat)).objects[0]!;
    const adapted = tools.match(resource)[0]!;
    const invocation = adapted.prepare(resource, null, {});
    if (!("execute" in invocation)) throw new Error("Expected a tool invocation.");
    const progress: unknown[] = [];
    expect(await invocation.execute(new AbortController().signal, data => progress.push(data))).toEqual({ kind: "succeeded", data: 4 });
    expect(progress).toEqual([4]);
    expect(() => toolObject.commit(writer => { writer.set(State, 5); })).toThrow();
    expect(() => toolObject.session.commit(writer => { writer.set(State, 5); })).toThrow();
    expect(() => toolObject.session.title.set("Late")).toThrow();
    expect(() => toolObject.streams.publish("late", new Uint8Array())).toThrow();
  });

  it("创建失败回滚对象状态和记录；临时对象门面不能越过失败创建", async () => {
    let provisional!: ObjectExecutor;
    const observed: SessionRecord[] = [];
    const c = counter({ failCreate: true, onCreate: object => { provisional = object; }, observe: record => observed.push(record) });
    const { service, sessionId } = open([c.plugin]);
    await expect(create(service, sessionId)).rejects.toThrow("Creation failed.");
    expect(service.sessions.tree.nodes(sessionId).map(flat)).toEqual([]);
    expect(observed).toEqual([]);
    expect(() => provisional.get(State)).toThrow();
    expect(() => provisional.commit(writer => { writer.set(State, 9); })).toThrow();
  });

  it("异步 commit 回滚，逃逸 writer 在提交结束后失效", async () => {
    const c = counter(), { service, sessionId } = open([c.plugin]);
    const id = await create(service, sessionId), object = c.context().object(sessionId, Counter, id);
    const before = object.session.snapshot().records.all({ scope: "session" });
    let escaped!: ObjectWriter;
    expect(() => object.commit(((writer: ObjectWriter) => {
      escaped = writer; writer.set(State, 99); writer.append(Changed, { value: 99 }); return Promise.resolve();
    }) as unknown as Parameters<ObjectExecutor["commit"]>[0])).toThrow();
    expect(() => escaped.set(State, 123)).toThrow();
    expect(object.get(State)).toBe(1);
    expect(object.session.snapshot().records.all({ scope: "session" })).toEqual(before);
  });

  it("记录写入只接受已声明实例，同 ID 伪造 schema 和未声明记录均被拒绝", async () => {
    const c = counter(), { service, sessionId } = open([c.plugin]);
    const id = await create(service, sessionId), object = c.context().object(sessionId, Counter, id);
    const before = object.session.snapshot().records.all({ scope: "session" });
    const forged = defineRecord(Changed.id, { schema: z.object({ value: z.string() }) });
    expect(() => object.commit(writer => { writer.append(forged, { value: "invalid" }); })).toThrow();
    const undeclared = defineRecord(ns.name("undeclared"), { schema: z.number() });
    expect(() => object.commit(writer => { writer.append(undeclared, 1); })).toThrow();
    expect(object.session.snapshot().records.all({ scope: "session" })).toEqual(before);
  });

  it("对象句柄由宿主核对会话、资源归属和当前路径", async () => {
    const c = counter(); const { service, sessionId } = open([c.plugin]);
    const id = await create(service, sessionId);
    const object = c.context().object(sessionId, Counter, id);
    expect(() => c.context().object("wrong", Counter, id)).toThrow();
    expect(() => c.context().object(sessionId, Counter, "missing")).toThrow();
    expect(() => c.context().object(sessionId, { ...Counter, kind: "foreign.plugin/thing" }, id)).toThrow();
    await service.sessions.execute({ type: "object.remove", sessionId, objectId: id });
    expect(() => object.commit(writer => { writer.set(State, 5); })).toThrow();
  });

  it("纯会话事件插件只声明自己的领域；观察者追加排队且保留原批次快照", () => {
    const eventNs = pluginNamespace("test.events");
    const Input = defineRecord(eventNs.name("input"), { schema: z.string() });
    const Follow = defineRecord(eventNs.name("follow"), { schema: z.string() });
    let context!: PluginContext;
    const seen: [string, number][] = [];
    const positions: number[] = [];
    const plugin = definePlugin({ namespace: eventNs, version: "1", modules: [defineModule(plugin => {
      context = plugin;
      return { records: [Input, Follow], observers: [
        { id: "append", committed(event) {
          if (event.records.some(record => Input.decode(record))) event.session.commit(writer => { writer.append(Follow, "second"); });
        } },
        { id: "read", committed(event) {
          seen.push([event.records[0]!.contract.id, event.snapshot.records.all({ scope: "session" }).length]);
        }, cursorChanged(event) {
          positions.push(event.snapshot.records.all({ scope: "timeline" }).length);
        } },
      ] };
    })] });
    const { service, sessionId } = open([plugin]);
    context.session(sessionId).commit(writer => { writer.append(Input, "first"); });
    expect(seen).toEqual([[Input.id, 1], [Follow.id, 2]]);
    expect(positions).toEqual([1, 2]);
    expect(service.sessions.tree.nodes(sessionId).map(flat)).toHaveLength(2);
  });

  // 预期来自游标观察契约：追加与显式游标选择统一通知最终时间线，纯数据／标题写入和只读查询不通知。
  it("游标观察与记录提交独立，批量与嵌套提交只通知最终位置，回滚不通知", async () => {
    const eventNs = pluginNamespace("test.cursor");
    const Entry = defineRecord(eventNs.name("entry"), { schema: z.string() });
    const Current = eventNs.data("current", z.number());
    let context!: PluginContext;
    const commits: string[][] = [], paths: string[][] = [], published: string[] = [];
    const plugin = definePlugin({ namespace: eventNs, version: "1", modules: [defineModule(plugin => {
      context = plugin;
      return { records: [Entry], observers: [{
        id: "cursor",
        committed(event) { commits.push(event.records.map(record => record.id)); },
        cursorChanged(event) {
          expect(event).not.toHaveProperty("records");
          const path = event.snapshot.records.all({ scope: "timeline" }).map(record => record.id);
          paths.push(path);
          event.session.title.set(`Position ${path.length}`);
        },
      }] };
    })] });
    let current!: ApplicationService;
    const { service, sessionId } = open([plugin], undefined, event => {
      if (event.kind === "session.changed") published.push(current.sessions.tree.title(event.sessionId));
    });
    current = service;
    const session = context.session(sessionId);
    const ids: string[] = [];
    session.commit(writer => {
      ids.push(writer.append(Entry, "first"));
      session.commit(nested => { ids.push(nested.append(Entry, "second")); });
      ids.push(writer.append(Entry, "third"));
    });
    expect(commits).toEqual([ids]);
    expect(paths).toEqual([ids]);
    expect(published).toEqual(["Position 3"]);
    const first = ids[0]!;
    service.sessions.snapshot(sessionId);
    session.commit(writer => { writer.set(Current, 1); });
    session.title.set("Current title");
    expect(paths).toHaveLength(1);
    expect(commits).toHaveLength(1);
    expect(() => session.commit(writer => {
      writer.append(Entry, "rolled back");
      throw new Error("Rollback");
    })).toThrow("Rollback");
    expect(paths).toHaveLength(1);
    expect(commits).toHaveLength(1);
    await service.sessions.execute({ type: "select", sessionId, nodeId: first });
    expect(paths).toEqual([ids, [first]]);
    expect(commits).toHaveLength(1);
    expect(published.at(-1)).toBe("Position 1");
    await service.sessions.execute({ type: "select", sessionId, nodeId: first });
    expect(paths).toHaveLength(2);
    let branch!: string;
    session.commit(writer => { branch = writer.append(Entry, "branch"); });
    expect(paths.at(-1)).toEqual([first, branch]);
    await service.sessions.execute({ type: "select", sessionId, nodeId: null });
    expect(paths.at(-1)).toEqual([]);
    expect(commits).toEqual([ids, [branch]]);
  });

  it("提交内写入的标题与事件同事务生效，后续异常回滚且观察者只看到一致状态", () => {
    const seen: [string, number][] = [];
    const c = counter({ observe: (record, plugin) => {
      const changed = Changed.decode(record);
      if (changed?.status === "known") seen.push([plugin.session(record.sessionId).title.get(), changed.data.value]);
    } });
    const { service, sessionId } = open([c.plugin]);
    const session = c.context().session(sessionId);
    expect(() => session.commit(writer => {
      session.title.set("Rolled back");
      writer.append(Changed, { value: 1 });
      throw new Error("Reject this commit.");
    })).toThrow("Reject this commit.");
    expect(session.title.get()).toBe("Counter");
    expect(session.snapshot().records.last(Changed, { scope: "session" })).toBeNull();
    expect(seen).toEqual([]);
    session.commit(writer => {
      session.title.set("Applied");
      writer.append(Changed, { value: 2 });
    });
    expect(session.title.get()).toBe("Applied");
    expect(session.snapshot().records.last(Changed, { scope: "session" })).toMatchObject({ data: { value: 2 } });
    expect(seen).toEqual([["Applied", 2]]);
    const other = service.sessions.tree.create("Other");
    expect(() => session.commit(() => {
      c.context().session(other).title.set("Foreign");
    })).toThrow();
    expect(c.context().session(other).title.get()).toBe("Other");
  });

  it("公开 run 交付事件，调用方决定是否按自身记录契约保存历史", async () => {
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
    const object = c.context().object(sessionId, Counter, id);
    const before = object.session.snapshot();
    const result = await c.context().models.run({ object: object.ref, requestParentId: before.position.nodeId,
      target, system: { blocks: [] }, messages: [{ kind: "input", parts: [{ kind: "text", text: "First projection" }] }], signal: new AbortController().signal,
      observer: { event(event) { if (event.type !== "progress") object.commit(writer => { writer.append(Execution, modelRunRecordSchema.parse(event)); }); } },
    });
    expect(result).toMatchObject({ reason: "completed", tools: [{ kind: "succeeded" }], source: { adapter: "test-adapter" } });
    expect(object.session.snapshot().records.query(Execution, { scope: "timeline" }).map(record => record.status)).toEqual(["known"]);
    const count = service.sessions.tree.nodes(sessionId).map(flat).length;
    await c.context().models.run({ object: object.ref, requestParentId: object.session.snapshot().position.nodeId,
      target, system: { blocks: [] }, messages: [{ kind: "input", parts: [{ kind: "text", text: "Second projection" }] }], signal: new AbortController().signal,
      observer: { event() {} },
    });
    expect(inputs.map(input => input.messages)).toEqual([[{ kind: "input", parts: [{ kind: "text", text: "First projection" }] }], [{ kind: "input", parts: [{ kind: "text", text: "Second projection" }] }]]);
    expect(service.sessions.tree.nodes(sessionId).map(flat)).toHaveLength(count);
  });

  it("公开 stream 固定显式输入，不保存历史或隐式加入宿主工具", async () => {
    const c = counter(), inputs: ModelInput[] = [];
    const { service, sessionId } = open([c.plugin], () => ({ validate() {}, version: "test-adapter", prepare(input) {
      inputs.push(input);
      return { async *stream() { yield { type: "finish" as const, reason: "stop", usage: null }; } };
    } }));
    const target = await configureModel(service), count = service.sessions.tree.nodes(sessionId).length;
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
    expect(inputs[0]!.tools).toEqual([]);
    expect(inputs[0]!.messages).toEqual([{ kind: "input", parts: [{ kind: "text" as const, text: "Generate a title" }] }]);
    expect(stream.at(-1)).toMatchObject({ type: "finish", source: { adapter: "test-adapter" } });
    expect(service.sessions.tree.nodes(sessionId).map(flat)).toHaveLength(count);
    expect(service.sessions.running).toBe(false);
  });

  it.each(["cancel", "close"] as const)("运行中的 SDK 请求受收束规则保护，%s 后部分内容可提交到时间线", async mode => {
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
    const object = c.context().object(sessionId, Counter, id);
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
      expect(() => c.context().models.run(request)).toThrow();
      expect(service.sessions.snapshot(sessionId).progress.unsettledObjectIds).toContain(id);
    } finally {
      if (mode === "cancel") controller.abort();
      else {
        await service.close();
        services.splice(services.indexOf(service), 1);
      }
    }
    expect(await done).toMatchObject({ reason: "cancelled" });
    const saved = events.filter(event => event.type !== "progress");
    expect(saved.some(event => event.type === "block")).toBe(true);
    if (mode === "cancel") expect(service.sessions.running).toBe(false);
    else expect(() => object.session.snapshot()).toThrow();
  });
});
