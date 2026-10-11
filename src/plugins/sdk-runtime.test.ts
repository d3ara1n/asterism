import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { defineRecord, defineImplementation, defineTool, pluginNamespace, modelRunRecordSchema, type SessionRecord, type ModelRunEvent } from "@atelier/sdk/contracts";
import { defineModule, definePlugin, implementResource, implementTool, type ObjectContext, type ObjectWriter, type PluginContext, type PluginDefinition } from "@atelier/sdk/runtime";
import { ApplicationService } from "../runtime/service.ts";
import * as runtimeModules from "../modules/runtime.ts";
import type { ToolRegistry } from "../tools/registry.ts";
import { foldWorkbench } from "../session/fold.ts";
import type { ModelAdapter, ModelInput } from "../model/contract.ts";
import { Directory, DirectoryView } from "../modules/filesystem/contract.ts";

const ns = pluginNamespace("test.counter");
const Counter = ns.resource("counter", z.strictObject({}));
const State = ns.data("state", 1, z.number().int());
const View = ns.data("view", 1, z.object({ value: z.number() }));
const Changed = defineRecord(ns.name("changed"), { version: 1, schema: z.object({ value: z.number() }) });
const Command = z.object({ amount: z.number().int() });
const roots: string[] = [];
const services: ApplicationService[] = [];
afterEach(async () => {
  for (const service of services.splice(0)) await service.close();
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function open(plugins: PluginDefinition[], adapterFactory?: () => ModelAdapter) {
  const root = mkdtempSync(join(tmpdir(), "sdk-runtime-")); roots.push(root);
  const service = new ApplicationService(root, { plugins, adapterFactory }); services.push(service);
  const sessionId = service.sessions.tree.create("Counter");
  return { root, service, sessionId };
}
async function configureModel(service: ApplicationService) {
  await service.configuration.execute({ type: "provider.save", id: null, credential: { action: "keep" },
    value: { id: "test", name: "Test", protocol: "openai-responses", baseUrl: "https://example.invalid", auth: "none", enabled: true } });
  const result = await service.configuration.execute({ type: "model.save", id: null, value: {
    providerId: "test", name: "Test", modelId: "test", enabled: true, contextWindow: null,
    capabilities: { tools: true, reasoning: false, images: false }, generation: { temperature: null, topP: null, maxOutputTokens: null },
  } });
  return { role: "default", model: result.savedId! };
}
function counter(options: { failCreate?: boolean; onCreate?: (object: ObjectContext) => void; observe?: (record: SessionRecord, context: PluginContext) => void } = {}) {
  let context!: PluginContext;
  const plugin = definePlugin({ namespace: ns, version: "1.0.0", modules: [defineModule(plugin => {
    context = plugin;
    return {
      resources: [implementResource(Counter, View, {
        records: [Changed],
        creation: {
          schema: z.number().int(),
          create(value, object) {
            options.onCreate?.(object);
            object.commit(writer => { writer.set(State, value); writer.append(Changed, { value }); });
            if (options.failCreate) throw new Error("Creation failed.");
            return { title: "Counter", data: {} };
          },
        },
        actions: {
          schema: Command,
          prepare: input => ({ action: "replace", input: { amount: input.amount + 1 } }),
          async execute(input, object) {
            object.commit(writer => {
              const value = object.get(State)! + input.amount;
              writer.set(State, value); writer.append(Changed, { value });
            });
          },
        },
        project: (_data, object) => ({ value: object.get(State)! }),
        inspect: async (_data, object) => ({ value: object.get(State)! }),
      })],
      observers: [{ id: "observe", committed(event) { for (const record of event.records) options.observe?.(record, plugin); } }],
    };
  })] });
  return { plugin, context: () => context };
}
async function create(service: ApplicationService, sessionId: string, input = 1) {
  await service.sessions.execute({ type: "resource.create", sessionId, kind: Counter.kind, input, position: { x: 0, y: 0 } });
  return service.sessions.snapshot(sessionId).workbench.objects.find(object => object.kind === Counter.kind)!.id;
}

describe("工作台 SDK 的宿主实现", () => {
  it("内置目录经 SDK 创建，默认或自定标题和路径沿用原有事件与卡片格式", async () => {
    const { root, service, sessionId } = open([]);
    const directory = join(root, "directory"); mkdirSync(directory);
    expect(service.sessions.plugins.find(plugin => plugin.id === "atelier.core")?.status).toBe("loaded");
    for (const title of [undefined, "  Materials  "]) {
      await service.sessions.execute({ type: "resource.create", sessionId, kind: Directory.kind,
        input: { path: directory, ...(title ? { title } : {}) }, position: { x: 0, y: 0 } });
    }
    const snapshot = service.sessions.snapshot(sessionId);
    const directories = snapshot.workbench.objects.filter(object => object.kind === Directory.kind);
    expect(directories.map(object => object.title)).toEqual(["directory", "Materials"]);
    expect(directories.map(object => object.presentation)).toEqual([
      { contract: { id: DirectoryView.id, version: DirectoryView.version }, data: { path: directory } },
      { contract: { id: DirectoryView.id, version: DirectoryView.version }, data: { path: directory } },
    ]);
    expect(service.sessions.tree.nodes(sessionId).filter(node => node.kind === "event" && node.type === "resource_created"))
      .toMatchObject([{ data: { type: Directory.kind, title: "directory", path: directory } },
        { data: { type: Directory.kind, title: "Materials", path: directory } }]);
  });

  it("目录创建的 schema 与路径拒绝映为 invalid_request，失败不留下对象或事件", async () => {
    const { root, service, sessionId } = open([]);
    const file = join(root, "file.txt"); writeFileSync(file, "text");
    for (const input of [{ path: 42 }, { path: "relative" }, { path: join(root, "missing") }, { path: file }]) {
      await expect(service.sessions.execute({ type: "resource.create", sessionId, kind: Directory.kind,
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
      preparers: [{ id: "double", resource: Counter, schema: z.object({ amount: z.union([z.number(), z.string()]) }), prepare(input) {
        const amount = Command.parse(input).amount; order.push(amount);
        return { action: "replace", input: { amount: invalid ? "bad" : amount * 2 } };
      } }],
    }))] });
    const { service, sessionId } = open([c.plugin, prepare]);
    const id = await create(service, sessionId);
    await service.sessions.execute({ type: "resource.command", sessionId, objectId: id, command: { amount: 2 } });
    expect(order).toEqual([2]);
    expect(c.context().object({ sessionId, id, kind: Counter.kind }).get(State)).toBe(6);
    invalid = true;
    await expect(service.sessions.execute({ type: "resource.command", sessionId, objectId: id, command: { amount: 2 } })).rejects.toThrow(/prepare/);
    expect(c.context().object({ sessionId, id, kind: Counter.kind }).get(State)).toBe(6);
  });

  it("SDK 工具经同一个宿主目录调用，具型参数与产出在适配边界校验", async () => {
    const c = counter();
    const tool = defineTool({ name: "counter_read", description: "Read the counter.", guidelines: [],
      argsSchema: z.strictObject({}).describe("No arguments.") });
    const implementation = defineImplementation({
      ...ns.data("read-result", 1, z.number().describe("The current counter value.")),
      resource: Counter, tool, targetSchema: z.null().describe("The whole counter."), effect: "read", execution: "parallel",
    });
    const plugin = definePlugin({ ...c.plugin, modules: [...c.plugin.modules, defineModule(() => ({
      tools: [implementTool(implementation, { async call(_data, _target, _args, context) {
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
  });

  it("创建失败回滚对象状态和记录；临时对象门面不能越过失败创建", async () => {
    let provisional!: ObjectContext;
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
    }) as unknown as Parameters<ObjectContext["commit"]>[0])).toThrow(/synchronously/);
    expect(() => escaped.set(State, 123)).toThrow(/outside/);
    expect(object.get(State)).toBe(1);
    expect(service.sessions.tree.nodes(sessionId)).toHaveLength(count);
    const forged = defineRecord(Changed.id, { version: 1, schema: z.object({ value: z.string() }) });
    expect(() => object.commit(writer => { writer.append(forged, { value: "invalid" }); })).toThrow(/declared schema/);
    const undeclared = defineRecord(ns.name("undeclared"), { version: 1, schema: z.number() });
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
    const Input = defineRecord(eventNs.name("input"), { version: 1, schema: z.string() });
    const Follow = defineRecord(eventNs.name("follow"), { version: 1, schema: z.string() });
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

  it("公开 run 交付单次执行事件，由插件声明的记录保存；没有隐式历史或下一请求", async () => {
    const c = counter();
    const Execution = defineRecord(ns.name("execution"), { version: 1, schema: modelRunRecordSchema });
    const plugin = definePlugin({ ...c.plugin, modules: [...c.plugin.modules, defineModule(() => ({ records: [Execution] }))] });
    const inputs: ModelInput[] = [];
    const { service, sessionId } = open([plugin], () => ({ version: "test-adapter", prepare(input) {
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
      target, system: { blocks: [] }, messages: [{ kind: "input", text: "First projection" }], signal: new AbortController().signal,
      observer: { event(event) { if (event.type !== "progress") object.commit(writer => { writer.append(Execution, modelRunRecordSchema.parse(event)); }); } },
    });
    expect(result).toMatchObject({ reason: "completed", tools: [{ kind: "succeeded" }], source: { adapter: "test-adapter" } });
    expect(inputs).toHaveLength(1);
    expect(object.session.snapshot().records.query(Execution, { scope: "path" }).map(record => record.status)).toEqual(["known", "known"]);
    expect(service.sessions.tree.nodes(sessionId).every(node => node.kind === "event")).toBe(true);
    const count = service.sessions.tree.nodes(sessionId).length;
    await c.context().models.run({ object: object.ref, requestParentId: object.session.snapshot().position.nodeId,
      target, system: { blocks: [] }, messages: [{ kind: "input", text: "Second projection" }], signal: new AbortController().signal,
      observer: { event() {} },
    });
    expect(inputs.map(input => input.messages)).toEqual([[{ kind: "input", text: "First projection" }], [{ kind: "input", text: "Second projection" }]]);
    expect(service.sessions.tree.nodes(sessionId)).toHaveLength(count);
    const streamRequest = {
      target, system: { blocks: [] }, messages: [{ kind: "input" as const, text: "Generate a title" }], signal: new AbortController().signal,
    };
    const stream = [];
    const iterable = c.context().models.stream(streamRequest);
    const first = iterable[Symbol.asyncIterator]().next();
    streamRequest.messages[0]!.text = "Changed after the request began";
    const head = await first;
    if (!head.done) stream.push(head.value);
    for await (const event of iterable) stream.push(event);
    expect(inputs[2]!.tools).toEqual([]);
    expect(inputs[2]!.messages).toEqual([{ kind: "input", text: "Generate a title" }]);
    expect(stream.at(-1)).toMatchObject({ type: "finish", source: { adapter: "test-adapter" } });
    expect(service.sessions.tree.nodes(sessionId)).toHaveLength(count);
    expect(service.sessions.running).toBe(false);
  });

  it.each(["cancel", "close"] as const)("运行中的 SDK 请求受收束规则保护，%s 后部分内容可提交到时间轴", async mode => {
    const c = counter();
    const Execution = defineRecord(ns.name("execution"), { version: 1, schema: modelRunRecordSchema });
    const plugin = definePlugin({ ...c.plugin, modules: [...c.plugin.modules, defineModule(() => ({ records: [Execution] }))] });
    const { service, sessionId } = open([plugin], () => ({ version: "test", prepare() {
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
