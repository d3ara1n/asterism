import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { defineCreation, defineAction, defineRecord, pluginNamespace, thinkingLevels, type Json, type ResourceRef } from "@atelier/sdk/contracts";
import { definePlugin, defineModule, implementCreation, implementResource, implementPreparer, type PluginContext, type PluginDefinition, type ObjectExecutor, type ToolSession, defineTopLevelTool } from "@atelier/sdk/runtime";
import { agentCreations, defineAgentCreation } from "@atelier/builtin-api/runtime";
import { CreateAgent, ReadAgentCreations } from "@atelier/builtin-api/contracts";
import { CreateNote } from "../../packages/builtin/src/notes/contract.ts";
import { ApplicationService } from "../runtime/service.ts";
import type { ModelAdapter } from "../model/contract.ts";

const ns = pluginNamespace("test.resources");
const Item = ns.resource("item", z.strictObject({}));
const State = ns.data("state", z.number());
const View = ns.data("view", z.object({ value: z.number() }));
const Create = defineCreation(Item, { id: ns.name("create"), schema: z.number().transform(value => value + 1) });
const roots: string[] = [], apps: ApplicationService[] = [];
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function open(options: { prepare?: (signal: AbortSignal) => Promise<void>; create?: (object: ObjectExecutor) => void; plugins?: PluginDefinition[]; adapter?: ModelAdapter } = {}) {
  let plugin!: PluginContext;
  const definition = definePlugin({ namespace: ns, version: "1", setup(context) {
    plugin = context;
    return { resources: [implementResource(Item, View, {
      links: { receive: true },
      creation: implementCreation(Create, {
        async prepare(_value, { signal }) { await options.prepare?.(signal); return { action: "accept" }; },
        create(value, object) { object.commit(writer => { writer.set(State, value); }); options.create?.(object); return { title: "Item", data: {} }; },
      }),
      project: (_data, object) => ({ value: object.get(State)! }),
      inspect: async (_data, object) => ({ value: object.get(State)! }),
    })], modules: [defineAgentCreation({ id: ns.name("new"), creation: Create, description: "Create an item.",
      inputSchema: z.strictObject({ initial: z.number(), sources: z.array(z.string()).optional() }),
      toInput: ({ initial }) => initial, toOptions: ({ sources }) => ({ resources: sources }) })] };
  } });
  const root = mkdtempSync(join(tmpdir(), "atelier-session-resources-")); roots.push(root);
  const app = new ApplicationService(root, { plugins: [definition, ...options.plugins ?? []], adapterFactory: options.adapter ? () => options.adapter! : undefined }); apps.push(app);
  const sessionId = app.sessions.tree.create("Resources");
  return { app, sessionId, plugin, session: plugin.session(sessionId) };
}
function latch() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}
async function model(app: ApplicationService) {
  await app.configuration.execute({ type: "provider.save", id: null, credential: { action: "keep" }, value: {
    id: "test", name: "Test", protocol: "openai-responses", baseUrl: "https://example.invalid", auth: "none", enabled: true, compatibility: [],
  } });
  const saved = await app.configuration.execute({ type: "model.save", id: null, value: {
    providerId: "test", name: "Test", modelId: "test", enabled: true, contextWindow: null, cost: null, compatibility: [],
    capabilities: { tools: true, reasoning: false, thinkingLevels: [...thinkingLevels] }, generation: { temperature: null, topP: null, maxOutputTokens: null },
  } });
  return { role: "default", model: saved.savedId! };
}
function adapter(next: () => { name: string; args: Json }[]): ModelAdapter {
  return { version: "test/1", validate() {}, prepare() {
    const calls = next();
    return { async *stream() {
      for (const [index, call] of calls.entries()) {
        yield { type: "part.start" as const, part: { id: `p${index}`, kind: "toolcall" as const, name: call.name, callId: `call${index}` } };
        yield { type: "part.end" as const, partId: `p${index}`, arguments: call.args };
      }
      yield { type: "finish" as const, reason: "tool-calls", usage: null };
    } };
  } };
}
function runner(f: ReturnType<typeof open>, actor: ResourceRef, target: Awaited<ReturnType<typeof model>>) {
  return (allow?: string[]) => f.plugin.models.run({ object: actor, target,
    requestParentId: f.session.snapshot().position.nodeId, system: { blocks: [] }, messages: [], tools: { allow },
    signal: new AbortController().signal, observer: { event() {} },
  });
}

describe("SDK 会话资源生命周期", () => {
  // 依据资源链接契约：第三方资源可接收链接，两个方向分别授权；字段错配会丢失访问范围或通知接收者。
  it("通用资源链接跨 SDK 与会话命令保持方向、授权和通知接收者一致", async () => {
    let resourceId = "";
    const f = open({ adapter: adapter(() => [{ name: "resource_inspect", args: { resource_id: resourceId } }]) });
    const target = await model(f.app);
    const a = await f.session.create(Create, 0), b = await f.session.create(Create, 1);
    const runA = runner(f, a, target), runB = runner(f, b, target);
    f.session.link(a, b);
    const position = f.session.snapshot().position.nodeId;
    await f.app.sessions.execute({ type: "link.set", sessionId: f.sessionId, receiverId: a.id, resourceId: b.id, linked: true });
    expect(f.session.snapshot().position.nodeId).toBe(position);
    resourceId = b.id;
    expect((await runA()).tools[0]).toMatchObject({ kind: "succeeded", data: { resource_id: b.id } });
    resourceId = a.id;
    expect((await runB()).tools[0]).toMatchObject({ kind: "rejected", error: { code: "access_denied" } });

    await f.app.sessions.execute({ type: "link.set", sessionId: f.sessionId, receiverId: b.id, resourceId: a.id, linked: true });
    expect((await runB()).tools[0]).toMatchObject({ kind: "succeeded", data: { resource_id: a.id } });
    f.session.unlink(a, b);
    expect((await runB()).tools[0]).toMatchObject({ kind: "succeeded", data: { resource_id: a.id } });
    resourceId = b.id;
    expect((await runA()).tools[0]).toMatchObject({ kind: "rejected", error: { code: "access_denied" } });

    const links = f.session.snapshot().records.all({ scope: "timeline" })
      .filter(record => record.contract.id === "resource_attached" || record.contract.id === "resource_detached");
    expect(links).toMatchObject([
      { contract: { id: "resource_attached" }, data: { id: b.id, receiverId: a.id }, context: { recipient: a.id } },
      { contract: { id: "resource_attached" }, data: { id: a.id, receiverId: b.id }, context: { recipient: b.id } },
      { contract: { id: "resource_detached" }, data: { id: b.id, receiverId: a.id }, context: { recipient: a.id } },
    ]);
  });

  // 依据关闭收束契约：取消后仍允许读取会话目录并提交最终记录，设施只在工作真实结束后释放。
  it("关闭期间的托管任务可枚举会话并保存收尾记录", async () => {
    const owner = pluginNamespace("test.cleanup"), Final = defineRecord(owner.name("final"), { schema: z.null() });
    let context!: PluginContext;
    const f = open({ plugins: [definePlugin({ namespace: owner, version: "1", setup(plugin) {
      context = plugin; return { records: [Final] };
    } })] });
    const ready = latch();
    let summaries: readonly { id: string }[] = [], records = 0;
    context.tasks.start("cleanup", async signal => {
      const cancelled = new Promise<void>(resolve => signal.addEventListener("abort", () => resolve(), { once: true }));
      ready.release(); await cancelled;
      summaries = context.sessions.list();
      for (const item of summaries) context.session(item.id).commit(writer => { writer.append(Final, null); });
      records = context.session(f.sessionId).snapshot().records.query(Final, { scope: "timeline" }).length;
    });
    await ready.promise;
    await f.app.close(); apps.splice(apps.indexOf(f.app), 1);
    expect(summaries.map(item => item.id)).toContain(f.sessionId);
    expect(records).toBe(1);
    expect(() => context.sessions.list()).toThrow("closed");
  });

  // 依据具型创建与归属契约：标题来自提供者，即使输入没有标题；同 ID 副本不能绕过声明身份校验。
  it("跨插件创建只解析一次，返回身份与实际标题而不泄露私有数据，并枚举会话摘要", async () => {
    let consumer!: PluginContext;
    const caller = pluginNamespace("test.caller");
    const f = open({ plugins: [definePlugin({ namespace: caller, version: "1", setup(plugin) { consumer = plugin; return {}; } })] });
    const other = f.app.sessions.tree.create("Other");
    const ref = await consumer.session(f.sessionId).create(Create, 4);
    expect(ref).toEqual({ sessionId: f.sessionId, kind: Item.kind, id: expect.any(String), title: "Item" });
    expect(f.plugin.object(f.sessionId, Item, ref.id).get(State)).toBe(5);
    expect(() => consumer.object(f.sessionId, Item, ref.id)).toThrow("another plugin");
    await expect(consumer.session(f.sessionId).create({ ...Create }, 4)).rejects.toThrow("registered creation contract");
    expect(consumer.sessions.list()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: f.sessionId, title: "Resources", createdAt: expect.any(String) }),
      expect.objectContaining({ id: other, title: "Other" }),
    ]));
    expect(f.session.snapshot().resources.all()).toHaveLength(1);
  });

  // 依据宿主事务契约：创建失败或初始链接失败，身份、私有数据和事件必须整体回滚。
  it("初始化与创建后的链接原子提交，失败不遗留对象或私有数据", async () => {
    let fail = false;
    const f = open({ create() { if (fail) throw new Error("Creation failed."); } });
    const before = f.app.sessions.current(f.sessionId);
    fail = true;
    await expect(f.session.create(Create, 2)).rejects.toThrow("Creation failed");
    expect(f.app.sessions.current(f.sessionId).nodes).toEqual(before.nodes);
    fail = false;
    const note = await f.session.create(CreateAgent, { selection: { agent: "worker", model: null, thinking: null } });
    const foreign = { ...note, sessionId: f.app.sessions.tree.create("Foreign") };
    const head = f.session.snapshot().position.nodeId;
    await expect(f.session.create(Create, 2, { linkTo: foreign })).rejects.toThrow("another session");
    expect(f.session.snapshot().position.nodeId).toBe(head);
    await expect(f.session.create(Create, 2, { resources: [foreign] })).rejects.toThrow("another session");
    expect(f.session.snapshot().position.nodeId).toBe(head);
    const child = await f.session.create(Create, 3, { linkTo: note });
    expect(f.app.sessions.current(f.sessionId).workbench.links).toEqual([{ receiverId: note.id, resourceId: child.id }]);
    const otherAgent = await f.session.create(CreateAgent, { selection: { agent: "worker", model: null, thinking: null } }, { linkTo: note });
    expect(f.app.sessions.current(f.sessionId).workbench.links.filter(link => link.receiverId === otherAgent.id)).toEqual([]);
  });

  // 依据宿主原子创建契约：接收者类型不支持链接时，已创建的身份、内容及调用者链接一起回滚。
  it("初始资源链接失败时整体回滚创建", async () => {
    const f = open(), actor = await f.session.create(Create, 0), resource = await f.session.create(Create, 1);
    const before = f.app.sessions.current(f.sessionId);
    await expect(f.session.create(CreateNote, { title: "Rejected note", content: "temporary" },
      { linkTo: actor, resources: [resource] })).rejects.toThrow();
    const after = f.app.sessions.current(f.sessionId);
    expect(after.nodes).toEqual(before.nodes);
    expect(after.workbench).toEqual(before.workbench);
  });

  // 依据请求边界与同步提交：创建准备期间禁止游标回溯，取消后不能提交迟到创建。
  it("异步创建阻止游标移动，取消后等准备真实结束且不留下创建事件", async () => {
    const started = latch(), end = latch();
    const f = open({ async prepare(signal) { started.release(); await end.promise; expect(signal.aborted).toBe(true); } });
    const controller = new AbortController();
    const creating = f.session.create(Create, 1, { signal: controller.signal });
    const rejected = expect(creating).rejects.toThrow();
    await started.promise;
    await expect(f.app.sessions.execute({ type: "select", sessionId: f.sessionId, nodeId: null })).rejects.toThrow("settle");
    controller.abort(); end.release(); await rejected;
    expect(f.session.snapshot().resources.all()).toEqual([]);
  });
});

describe("Agent 创建与移除入口", () => {
  // 依据入口拥有领域输入：资源列表只在选择的入口显式声明，通用创建参数和笔记输入保持各自的结构。
  it("代理入口声明资源列表，笔记入口按自身 schema 创建", async () => {
    let calls: { name: string; args: Json }[] = [];
    const f = open({ adapter: adapter(() => calls) }), target = await model(f.app), actor = await f.session.create(Create, 0);
    expect(agentCreations.inspect(f.plugin, "atelier.builtin/agent.create").input).toHaveProperty("properties.resources");
    expect(agentCreations.inspect(f.plugin, "atelier.builtin/agent.create").input).toHaveProperty("properties.expose_self.type", "boolean");
    expect(agentCreations.inspect(f.plugin, "atelier.builtin/note.create").input).toMatchObject({
      type: "object", additionalProperties: false, properties: { title: { type: "string" }, content: { type: "string" } },
    });
    expect(agentCreations.inspect(f.plugin, "atelier.builtin/note.create").input).not.toHaveProperty("properties.resources");
    const input = { title: "A note", content: "Note text" }, creation_id = "atelier.builtin/note.create";
    const run = runner(f, actor, target), before = f.session.snapshot().position.nodeId;
    calls = [{ name: "resource_create", args: { creation_id, input, resources: [] } }];
    expect((await run()).tools[0]?.kind).toBe("rejected");
    calls = [{ name: "resource_create", args: { creation_id, input: { ...input, resources: [] } } }];
    expect((await run()).tools[0]).toMatchObject({ kind: "rejected", data: { type: CreateNote.resource.kind } });
    expect(f.session.snapshot().position.nodeId).toBe(before);
    calls = [{ name: "resource_create", args: { creation_id, input } }];
    const result = await run();
    expect(result.tools[0]).toMatchObject({ kind: "succeeded", data: { type: CreateNote.resource.kind, title: "A note" } });
    const noteId = (result.tools[0]!.data as { resource_id: string }).resource_id;
    expect(f.app.sessions.current(f.sessionId).workbench.links).toEqual([{ receiverId: actor.id, resourceId: noteId }]);
  });

  // 依据代理发现契约：列表仅返回启用配置的选择信息，新增配置字段和私有提示均不进入模型结果。
  it("agent_list 公开选择字段并隔离系统提示词和执行配置", async () => {
    const f = open({ adapter: adapter(() => [{ name: "agent_list", args: {} }]) });
    const target = await model(f.app), actor = await f.session.create(Create, 0);
    await f.app.configuration.execute({ type: "agent.save", id: "worker", value: {
      description: "Public purpose", examples: ["Public example"],
      systemPrompt: "PRIVATE_AGENT_INSTRUCTIONS", maxTurns: 123,
    } });
    await f.app.configuration.execute({ type: "agent.save", id: "reviewer", value: { enabled: false } });
    const result = await runner(f, actor, target)();
    expect(result.tools[0]?.kind).toBe("succeeded");
    const entries = result.tools[0]!.data as { id: string }[];
    expect(entries.find(entry => entry.id === "worker")).toEqual({
      id: "worker", name: "worker", description: "Public purpose",
      examples: ["Public example"],
    });
    expect(entries.some(entry => entry.id === "reviewer")).toBe(false);
    expect(JSON.stringify(result.tools[0]!.model)).not.toContain("PRIVATE_AGENT_INSTRUCTIONS");
  });

  // 依据显式初始链接与自身授权契约：省略或 false 不暴露自身，true 仅额外链接绑定的发起者，源链接保留。
  it.each([undefined, false, true])("创建代理时附带选定资源与自身授权 %s，下一请求可发现新代理", async exposeSelf => {
    let calls: { name: string; args: Json }[] = [];
    const f = open({ adapter: adapter(() => calls) }), target = await model(f.app);
    const actor = await f.session.create(Create, 0), shared = await f.session.create(Create, 1), other = await f.session.create(Create, 2);
    f.session.link(actor, shared); f.session.link(actor, other);
    calls = [{ name: "resource_create", args: {
      creation_id: "atelier.builtin/agent.create",
      input: { selection: { agent: "worker", model: null, thinking: null }, resources: [shared.id, shared.id],
        ...(exposeSelf === undefined ? {} : { expose_self: exposeSelf }) },
    } }];
    const run = runner(f, actor, target), result = await run();
    expect(result.tools[0]?.kind).toBe("succeeded");
    const child = (result.tools[0]!.data as { resource_id: string }).resource_id;
    expect(f.app.sessions.current(f.sessionId).workbench.links).toEqual([
      { receiverId: actor.id, resourceId: shared.id }, { receiverId: actor.id, resourceId: other.id },
      { receiverId: actor.id, resourceId: child }, { receiverId: child, resourceId: shared.id },
      ...(exposeSelf ? [{ receiverId: child, resourceId: actor.id }] : []),
    ]);
    calls = [{ name: "resource_list", args: {} }];
    expect((await run()).tools[0]?.data).toMatchObject({ resources: expect.arrayContaining([expect.objectContaining({ resource_id: child })]) });
  });

  // 依据自身授权与初始资源的独立范围：expose_self 只提供绑定身份，不能把任意未授权 ID 加入 resources。
  it("暴露自身不扩大初始资源列表的授权范围", async () => {
    let resourceId = "";
    const f = open({ adapter: adapter(() => [{ name: "resource_create", args: {
      creation_id: "atelier.builtin/agent.create",
      input: { selection: { agent: "worker", model: null, thinking: null }, expose_self: true, resources: [resourceId] },
    } }]) });
    const target = await model(f.app), actor = await f.session.create(Create, 0), other = await f.session.create(Create, 1);
    const before = f.app.sessions.current(f.sessionId);
    const run = runner(f, actor, target);
    for (const id of [actor.id, other.id]) {
      resourceId = id;
      expect((await run()).tools[0]).toMatchObject({ kind: "rejected", error: { code: "access_denied" } });
    }
    const after = f.app.sessions.current(f.sessionId);
    expect(after.nodes).toEqual(before.nodes);
    expect(after.workbench).toEqual(before.workbench);
  });

  // 依据 SDK 自身授权与原子创建契约：第三方入口可选择 exposeSelf，目标不接收链接时创建及反向链接一起回滚。
  it("自身授权的目标不支持接收链接时整体回滚", async () => {
    const extra = pluginNamespace("test.expose");
    const f = open({
      plugins: [definePlugin({ namespace: extra, version: "1", modules: [
        defineAgentCreation({ id: extra.name("note"), creation: CreateNote, description: "Create an exposed note.",
          inputSchema: CreateNote.schema, toInput: input => input,
          toOptions: () => ({ exposeSelf: true }) }),
      ] })],
      adapter: adapter(() => [{ name: "resource_create", args: {
        creation_id: extra.name("note"), input: { title: "Rejected note", content: "temporary" },
      } }]),
    });
    const target = await model(f.app), actor = await f.session.create(Create, 0);
    const before = f.app.sessions.current(f.sessionId);
    expect((await runner(f, actor, target)()).tools[0]?.kind).toBe("rejected");
    const after = f.app.sessions.current(f.sessionId);
    expect(after.nodes).toEqual(before.nodes);
    expect(after.workbench).toEqual(before.workbench);
  });

  // 依据请求固定授权：已知未授权 ID 和模型请求过程中新增的链接都不能成为本批次初始授权。
  it("初始资源受请求开始时的链接范围约束", async () => {
    let resourceId = "", mutate: (() => void) | undefined;
    const f = open({ adapter: adapter(() => {
      mutate?.();
      return [{ name: "resource_create", args: { creation_id: "atelier.builtin/agent.create",
        input: { selection: { agent: "worker", model: null, thinking: null }, resources: [resourceId] } } }];
    }) });
    const target = await model(f.app), actor = await f.session.create(Create, 0), resource = await f.session.create(Create, 1);
    resourceId = resource.id;
    const run = runner(f, actor, target), before = f.session.snapshot().position.nodeId;
    expect((await run()).tools[0]).toMatchObject({ kind: "rejected", error: { code: "access_denied" } });
    expect(f.session.snapshot().position.nodeId).toBe(before);
    mutate = () => f.session.link(actor, resource);
    expect((await run()).tools[0]).toMatchObject({ kind: "rejected", error: { code: "access_denied" } });
    expect(f.session.snapshot().resources.all()).toHaveLength(2);
    mutate = undefined;
    expect((await run()).tools[0]?.kind).toBe("succeeded");
  });

  // 依据创建提交时重验端点：异步准备期间资源可能已移除，固定请求授权仍需真实资源身份才能落地链接。
  it("准备期间移除初始资源后拒绝迟到创建", async () => {
    let resources: string[] = [], pending = false;
    const started = latch(), end = latch();
    const f = open({
      async prepare() { if (pending) { started.release(); await end.promise; } },
      adapter: adapter(() => [{ name: "resource_create", args: { creation_id: ns.name("new"), input: { initial: 1, sources: resources } } }]),
    });
    const target = await model(f.app), actor = await f.session.create(Create, 0), resource = await f.session.create(Create, 1);
    f.session.link(actor, resource); resources = [resource.id]; pending = true;
    const work = runner(f, actor, target)();
    await started.promise;
    let head: string | null;
    try { f.session.remove(resource); head = f.session.snapshot().position.nodeId; }
    finally { end.release(); }
    expect((await work).tools[0]?.kind).toBe("rejected");
    expect(f.session.snapshot().position.nodeId).toBe(head);
    expect(f.session.snapshot().resources.all().map(item => item.ref.id)).toEqual([actor.id]);
  });

  // 依据显式领域入口：无需 inspect，模型输入适配后走同一创建管线，结果自动链接且不继承链接。
  it("直接创建已知入口，参数转换与工具策略生效，并可统一移除", async () => {
    let calls = [{ name: "resource_create", args: { creation_id: ns.name("new"), input: { initial: 8 } } as Json }];
    const f = open({ adapter: adapter(() => calls) }), target = await model(f.app), actor = await f.session.create(Create, 0);
    const run = runner(f, actor, target);
    const denied = await run([]);
    expect(denied.tools[0]?.kind).toBe("rejected");
    const created = await run();
    expect(created.tools[0]).toMatchObject({ kind: "succeeded", data: { type: Item.kind, title: "Item" } });
    const result = created.tools[0]!.data as { resource_id: string };
    expect(f.plugin.object(f.sessionId, Item, result.resource_id).get(State)).toBe(9);
    expect(f.app.sessions.current(f.sessionId).workbench.links).toEqual([{ receiverId: actor.id, resourceId: result.resource_id }]);
    calls = [{ name: "resource_remove", args: { resource_id: result.resource_id } }];
    expect((await run()).tools[0]?.kind).toBe("succeeded");
    expect(f.session.snapshot().resources.all().map(item => item.ref.id)).toEqual([actor.id]);
    calls = [{ name: "resource_create", args: { creation_id: Create.id, input: 1 } }];
    expect((await run()).tools[0]).toMatchObject({ kind: "rejected", error: { code: "not_found" } });
  });

  // 依据请求环境固定：知道 ID 或在请求过程中新增链接都不能扩大本批次移除范围。
  it("请求期间新链接下一次才可移除，移除不要求目标由当前 Agent 创建", async () => {
    let mutate: (() => void) | undefined, targetId = "";
    const f = open({ adapter: adapter(() => { mutate?.(); return [{ name: "resource_remove", args: { resource_id: targetId } }]; }) });
    const target = await model(f.app), actor = await f.session.create(Create, 0), resource = await f.session.create(Create, 1);
    targetId = resource.id;
    const run = runner(f, actor, target);
    mutate = () => f.session.link(actor, resource);
    expect((await run()).tools[0]).toMatchObject({ kind: "rejected", error: { code: "access_denied" } });
    mutate = undefined;
    expect((await run()).tools[0]?.kind).toBe("succeeded");
  });

  // 依据执行作用域：工具保存的操作柄不得在调用完成后继续创建或移除。
  it("工具会话句柄在执行结束后失效", async () => {
    let saved!: ToolSession;
    const tool = defineTopLevelTool({ id: ns.name("save"), name: "save_session", description: "Save context.", guidelines: [],
      argsSchema: z.null().describe("No input."), resultSchema: z.null().describe("No output."), effect: "read", execution: "parallel",
      async execute(_args, context) { saved = context.session; return { kind: "succeeded", data: null }; },
    });
    const f = open({ plugins: [definePlugin({ namespace: pluginNamespace("test.context"), version: "1", modules: [defineModule(() => ({ topLevelTools: [{ ...tool, id: "test.context/save" }] }))] })],
      adapter: adapter(() => [{ name: "save_session", args: null }]) });
    const target = await model(f.app), actor = await f.session.create(Create, 0);
    await runner(f, actor, target)();
    expect(() => saved.create(Create, 1)).toThrow("scope is closed");
    expect(() => saved.remove(actor.id)).toThrow("scope is closed");
  });

  // 依据插件生命周期与公共服务作用域：失败贡献即时移除，不串入另一个宿主实例。
  it("创建目录按宿主隔离，公开查询包含第三方类型且排除失败登记", async () => {
    const extra = pluginNamespace("test.extra"), missing = defineAction(extra.resource("missing", z.object({})), { id: extra.name("missing"), schema: z.null() });
    const failed = definePlugin({ namespace: extra, version: "1", modules: [
      defineAgentCreation({ id: extra.name("new"), description: "Invalid contribution.", creation: Create }),
      defineModule(() => ({ preparers: [implementPreparer(missing, { id: "missing", prepare: () => ({ action: "accept" }) })] })),
    ] });
    const first = open({ plugins: [failed] }), second = open();
    expect(first.app.sessions.plugins.find(plugin => plugin.id === extra.id)?.status).toBe("failed");
    expect(agentCreations.list(first.plugin).some(item => item.id === extra.name("new"))).toBe(false);
    expect(agentCreations.list(first.plugin)).toEqual(agentCreations.list(second.plugin));
    expect(() => agentCreations.inspect(first.plugin, ns.name("new"))).not.toThrow();
    expect(agentCreations.inspect(first.plugin, ns.name("new")).input).toMatchObject({ type: "object", properties: { initial: { type: "number" } } });
    // 公开展示查询使用真实目录；入口 ID 与创建契约 ID 不同，仍可取得资源类型。
    const directory = await first.app.sessions.calls.invoke(ReadAgentCreations.id, {}, {}, null);
    expect(directory).toEqual(agentCreations.list(first.plugin).map(({ id, resourceKind }) => ({ id, resourceKind })));
    expect(directory).toContainEqual({ id: ns.name("new"), resourceKind: Item.kind });
    expect(await first.plugin.ipc.calls.invoke(ReadAgentCreations, {}, {})).toEqual(directory);
  });
});
