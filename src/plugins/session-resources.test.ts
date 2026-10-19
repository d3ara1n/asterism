import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { defineCreation, defineAction, defineRecord, pluginNamespace, thinkingLevels, type Json, type ResourceRef } from "@atelier/sdk/contracts";
import { definePlugin, defineModule, implementCreation, implementResource, implementPreparer, type PluginContext, type PluginDefinition, type ObjectExecutor, type ToolSession, defineTopLevelTool } from "@atelier/sdk/runtime";
import { agentCreations, defineAgentCreation } from "@atelier/builtin-api/runtime";
import { CreateAgent } from "@atelier/builtin-api/contracts";
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
      inputSchema: z.object({ initial: z.number() }), toInput: ({ initial }) => initial })] };
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

  // 依据具型创建与归属契约：调用者持公开声明，初始化属于提供者；同 ID 副本不能绕过声明身份校验。
  it("跨插件创建只解析一次，返回引用而不泄露私有写句柄，并枚举会话摘要", async () => {
    let consumer!: PluginContext;
    const caller = pluginNamespace("test.caller");
    const f = open({ plugins: [definePlugin({ namespace: caller, version: "1", setup(plugin) { consumer = plugin; return {}; } })] });
    const other = f.app.sessions.tree.create("Other");
    const ref = await consumer.session(f.sessionId).create(Create, 4);
    expect(ref).toMatchObject({ sessionId: f.sessionId, kind: Item.kind });
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
    const before = f.app.sessions.snapshot(f.sessionId);
    fail = true;
    await expect(f.session.create(Create, 2)).rejects.toThrow("Creation failed");
    expect(f.app.sessions.snapshot(f.sessionId).nodes).toEqual(before.nodes);
    fail = false;
    const note = await f.session.create(CreateAgent, { selection: { agent: "worker", model: null, thinking: null } });
    const foreign = { ...note, sessionId: f.app.sessions.tree.create("Foreign") };
    const head = f.session.snapshot().position.nodeId;
    await expect(f.session.create(Create, 2, { linkTo: foreign })).rejects.toThrow("another session");
    expect(f.session.snapshot().position.nodeId).toBe(head);
    const child = await f.session.create(Create, 3, { linkTo: note });
    expect(f.app.sessions.snapshot(f.sessionId).workbench.links).toEqual([{ agentId: note.id, resourceId: child.id }]);
    const otherAgent = await f.session.create(CreateAgent, { selection: { agent: "worker", model: null, thinking: null } }, { linkTo: note });
    expect(f.app.sessions.snapshot(f.sessionId).workbench.links.filter(link => link.agentId === otherAgent.id)).toEqual([]);
  });

  // 依据移除与收束契约：发出取消不等于结束；用户和 SDK 必须使用同一忙碌检查。
  it("用户和插件都不能移除取消后尚未收束的对象，收束后解除全部方向链接并保留历史", async () => {
    const f = open();
    const receiver = await f.session.create(Create, 0), resource = await f.session.create(Create, 1), target = await f.session.create(Create, 2);
    f.session.link(receiver, resource); f.session.link(resource, target);
    const ended = latch(), started = latch();
    f.plugin.tasks.start("busy", async signal => { started.release(); await ended.promise; expect(signal.aborted).toBe(true); }, { object: resource });
    await started.promise;
    f.plugin.tasks.cancel("busy");
    expect(() => f.session.remove(resource)).toThrow("settle");
    await expect(f.app.sessions.execute({ type: "object.remove", sessionId: f.sessionId, objectId: resource.id })).rejects.toThrow("settle");
    ended.release();
    await vi.waitFor(() => expect(f.plugin.tasks.has("busy")).toBe(false));
    const prior = f.app.sessions.snapshot(f.sessionId).nodes;
    f.session.remove(resource);
    const after = f.app.sessions.snapshot(f.sessionId);
    expect(after.workbench.objects.map(object => object.id)).toEqual([receiver.id, target.id]);
    expect(after.workbench.links).toEqual([]);
    expect(after.nodes.slice(0, prior.length)).toEqual(prior);
    expect(() => f.session.remove(resource)).toThrow("current session path");
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
  // 依据显式领域入口：无需 inspect，模型输入适配后走同一创建管线，结果自动链接且不继承链接。
  it("直接创建已知入口，参数转换与工具策略生效，并可统一移除", async () => {
    let calls = [{ name: "resource_create", args: { creation_id: ns.name("new"), input: { initial: 8 } } as Json }];
    const f = open({ adapter: adapter(() => calls) }), target = await model(f.app), actor = await f.session.create(Create, 0);
    const run = runner(f, actor, target);
    const denied = await run([]);
    expect(denied.tools[0]?.kind).toBe("rejected");
    const created = await run();
    expect(created.tools[0]).toMatchObject({ kind: "succeeded", data: { type: Item.kind } });
    const result = created.tools[0]!.data as { resource_id: string };
    expect(f.plugin.object(f.sessionId, Item, result.resource_id).get(State)).toBe(9);
    expect(f.app.sessions.snapshot(f.sessionId).workbench.links).toEqual([{ agentId: actor.id, resourceId: result.resource_id }]);
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
  it("创建目录按宿主隔离，后置装配失败撤销登记", () => {
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
  });
});
