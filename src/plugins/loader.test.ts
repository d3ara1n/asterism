import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { belongsTo, pluginNamespace, defineCall, defineAction, defineRecord, defineImplementation, defineTool, type ResourceContract, type ToolContract } from "@asterism/sdk/contracts";
import { defineTopLevelTool, definePlugin, defineModule, implementCall, implementTool, implementResource, type PluginDefinition, type PluginContext } from "@asterism/sdk/runtime";
import { loadPlugins, type PluginHostServices } from "./loader.ts";

const services = { extensionsDirectory: "/unused", data: null as never, refOf: () => null, sessions: { progressChanged() {} } as never,
  models: { list: () => [] } as never, log: () => {} } satisfies PluginHostServices;
const instances: ReturnType<typeof loadPlugins>[] = [];
afterEach(async () => {
  for (const instance of instances.splice(0).reverse()) await instance.close();
});
function load(plugins: readonly PluginDefinition[]) {
  const instance = loadPlugins(plugins, services);
  instances.push(instance);
  return instance;
}
const args = z.strictObject({}).describe("No parameters.");
const tool = (description: string, id = "test.tools/read") => defineTool({ id, name: "read", description, guidelines: [], argsSchema: args });
function plugin(id: string, contract: ToolContract, options: { extra?: ToolContract[]; resource?: ResourceContract } = {}): PluginDefinition {
  const ns = pluginNamespace(id);
  const resource = options.resource ?? ns.resource("thing", z.object({}));
  const impl = (name: string, t: ToolContract) => implementTool(defineImplementation({
    ...ns.data(name, z.null().describe("No result.")), resource, tool: t,
    targetSchema: z.null().describe("Whole resource."), effect: "read", execution: "parallel",
  }), { async call() { return { kind: "succeeded", data: null }; } });
  return definePlugin({ namespace: ns, version: "1.0.0", modules: [defineModule(() => ({
    resources: belongsTo(id, resource.kind)
      ? [implementResource(resource, ns.data("view", z.null()), { project: () => null, inspect: async () => null })] : [],
    tools: [impl("thing.read", contract), ...(options.extra ?? []).map((t, i) => impl(`thing.extra${i}`, t))],
  }))] });
}

describe("插件装配", () => {
  // plugin-sdk.md：插件级调用无需对象，契约作用域不能被调用参数降级。
  it("无模块的插件声明全局服务，后台和桌面调用共用作用域校验", async () => {
    const ns = pluginNamespace("test.global");
    const query = defineCall(ns.name("query"), { scope: "plugin", input: z.string().trim(), output: z.string() });
    const objectQuery = defineCall(ns.name("object"), { scope: "object", input: z.null(), output: z.null() });
    let context!: PluginContext;
    const loaded = load([definePlugin({ namespace: ns, version: "1", setup(plugin) {
      context = plugin;
      return { calls: [
        implementCall(query, async (input, call) => {
          expect(call).not.toHaveProperty("object");
          return `${call.source?.plugin ?? "desktop"}:${input}`;
        }),
        implementCall(objectQuery, async () => null),
      ] };
    } })]);
    expect(loaded.manifest[0]?.status).toBe("loaded");
    expect(await loaded.calls.invoke(query.id, " text ", {}, null)).toBe("desktop:text");
    expect(await context.ipc.calls.invoke(query, " text ", {})).toBe("test.global:text");
    await expect(loaded.calls.invoke(objectQuery.id, null, {}, null)).rejects.toMatchObject({ code: "invalid_argument" });
    const object = { id: "missing", sessionId: "missing", kind: "test.global/object" };
    await expect(loaded.calls.invoke(query.id, "text", { object }, null)).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(loaded.calls.invoke(objectQuery.id, null, { object }, null)).rejects.toMatchObject({ code: "unavailable" });
    await expect(loaded.calls.invoke(query.id, 42, {}, null)).rejects.toMatchObject({ code: "invalid_argument" });
  });
  // 共享服务必须等模块释放；根与模块的贡献仍经过同一冲突校验。
  it.each([false, true])("插件根共享服务在模块之后清理，重复登记失败=%s", async conflict => {
    const ns = pluginNamespace("test.composition"), order: string[] = [];
    const query = defineCall(ns.name("query"), { scope: "plugin", input: z.null(), output: z.number() });
    const loaded = load([definePlugin({ namespace: ns, version: "1", setup(plugin) {
      const service = { value: 1 };
      // 根先于模块登记，逆序清理使模块先释放。
      plugin.lifetime.defer(async () => { service.value = 0; order.push("plugin"); });
      return {
        calls: [implementCall(query, async () => service.value)],
        modules: [defineModule(module => {
          module.lifetime.defer(async () => { expect(service.value).toBe(1); order.push("module"); });
          return { calls: conflict ? [implementCall(query, async () => 2)] : [] };
        })],
      };
    } })]);
    expect(loaded.manifest[0]?.status).toBe(conflict ? "failed" : "loaded");
    await loaded.close(); await loaded.close();
    expect(order).toEqual(["module", "plugin"]);
  });
  // 插件级调用不关联任何会话，但关闭依然必须等处理器真实退出再销毁共享服务。
  it("关闭取消全局调用，处理器清理完成前保留插件服务", async () => {
    const ns = pluginNamespace("test.wait");
    const wait = defineCall(ns.name("wait"), { scope: "plugin", input: z.null(), output: z.null() });
    let started!: () => void, release!: () => void, cancelled!: () => void;
    const start = new Promise<void>(resolve => { started = resolve; });
    const held = new Promise<void>(resolve => { release = resolve; });
    const abort = new Promise<void>(resolve => { cancelled = resolve; });
    const order: string[] = [];
    const loaded = load([definePlugin({ namespace: ns, version: "1", setup: plugin => {
      plugin.lifetime.defer(async () => { order.push("plugin"); });
      return { calls: [implementCall(wait, async (_, { signal }) => {
        signal.addEventListener("abort", cancelled, { once: true }); started();
        await held; order.push("handler"); return null;
      })] };
    } })]);
    const result = expect(loaded.calls.invoke(wait.id, null, {}, null)).rejects.toThrow();
    await start;
    const closing = loaded.close();
    try { await abort; expect(order).toEqual([]); }
    finally { release(); await result; await closing; }
    expect(order).toEqual(["handler", "plugin"]);
  });
  it("记录可复用同一声明，独立副本即使 ID 相同也使装配失败", () => {
    const ns = pluginNamespace("test.records"), record = defineRecord(ns.name("record"), { schema: z.number() });
    const plugin = (other: typeof record) => definePlugin({ namespace: ns, version: "1", modules: [
      defineModule(() => ({ records: [record] })), defineModule(() => ({ records: [other] })),
    ] });
    const shared = load([plugin(record)]);
    const conflict = load([plugin(defineRecord(record.id, { schema: record.schema }))]);
    expect(shared.manifest[0]?.status).toBe("loaded");
    expect(conflict.manifest[0]?.status).toBe("failed");
  });
  it("单个插件装配失败只禁用它本身", () => {
    const broken = definePlugin({ namespace: pluginNamespace("acme.broken"), version: "1.0.0", modules: [defineModule(() => { throw new Error("boom"); })] });
    const loaded = load([broken, plugin("acme.ok", tool("Read."))]);
    expect(loaded.manifest.map(entry => [entry.id, entry.status])).toEqual([["acme.broken", "failed"], ["acme.ok", "loaded"]]);
    expect(loaded.resources.controller("acme.ok/thing")?.create).toBeUndefined();
    expect(loaded.manifest[0]!.error).toBe("boom");
  });
  it("后续模块失败时逆序清理已初始化模块，关闭不会重复清理", async () => {
    const calls: string[] = [];
    const broken = definePlugin({ namespace: pluginNamespace("acme.cleanup"), version: "1", modules: [
      defineModule(plugin => { plugin.lifetime.defer(async () => { plugin.models.list(); calls.push("first"); }); return {}; }),
      defineModule(plugin => { plugin.lifetime.defer(async () => { calls.push("second"); }); return {}; }),
      defineModule(() => { throw new Error("setup failed"); }),
    ] });
    const loaded = load([broken]);
    expect(loaded.manifest[0]!.status).toBe("failed");
    await loaded.close(); await loaded.close();
    expect(calls).toEqual(["second", "first"]);
  });
  it("失败消费者的异步清理结束前不释放仍有效的公共提供方", async () => {
    const calls: string[] = [];
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const provider = definePlugin({ namespace: pluginNamespace("acme.provider"), version: "1",
      modules: [defineModule(plugin => { plugin.lifetime.defer(async () => { calls.push("provider"); }); return {}; })] });
    const consumer = definePlugin({ namespace: pluginNamespace("acme.consumer"), version: "1", dependencies: ["acme.provider"],
      modules: [
        defineModule(plugin => { plugin.lifetime.defer(async () => { await held; calls.push("consumer"); }); return {}; }),
        defineModule(() => { throw new Error("setup failed"); }),
      ] });
    const loaded = load([consumer, provider]);
    const closing = loaded.close();
    try {
      await Promise.resolve();
      expect(calls).toEqual([]);
    } finally { release(); await closing; }
    expect(calls).toEqual(["consumer", "provider"]);
  });
  it("后置契约校验失败先收集依赖失败，再按消费者到提供方清理", async () => {
    const calls: string[] = [], ns = pluginNamespace("acme.provider");
    const action = defineAction(ns.resource("thing", z.object({})), { id: ns.name("missing"), schema: z.null() });
    const provider = definePlugin({ namespace: ns, version: "1", modules: [defineModule(plugin => {
      plugin.lifetime.defer(async () => { calls.push("provider"); });
      return { preparers: [{ id: "missing", contract: action, prepare: () => ({ action: "accept" }) }] };
    })] });
    const consumer = definePlugin({ namespace: pluginNamespace("acme.consumer"), version: "1", dependencies: [ns.id],
      modules: [defineModule(plugin => { plugin.lifetime.defer(async () => { calls.push("consumer"); }); return {}; })] });
    const loaded = load([consumer, provider]);
    expect(loaded.manifest.map(plugin => plugin.status)).toEqual(["failed", "failed"]);
    await loaded.close();
    expect(calls).toEqual(["consumer", "provider"]);
  });
  // 同一次装配中 setup 与后置校验分别失败，不能由两条清理任务越过依赖顺序。
  it("提供方后置校验失败仍等待消费者 setup 失败后的异步清理", async () => {
    const calls: string[] = [], ns = pluginNamespace("acme.provider");
    let release!: () => void, started!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const cleaning = new Promise<void>(resolve => { started = resolve; });
    const action = defineAction(ns.resource("thing", z.object({})), { id: ns.name("missing"), schema: z.null() });
    const provider = definePlugin({ namespace: ns, version: "1", modules: [defineModule(plugin => {
      plugin.lifetime.defer(async () => { calls.push("provider"); });
      return { preparers: [{ id: "missing", contract: action, prepare: () => ({ action: "accept" }) }] };
    })] });
    const consumer = definePlugin({ namespace: pluginNamespace("acme.consumer"), version: "1", dependencies: [ns.id], modules: [
      defineModule(plugin => { plugin.lifetime.defer(async () => { started(); await held; calls.push("consumer"); }); return {}; }),
      defineModule(() => { throw new Error("Consumer setup failed."); }),
    ] });
    const loaded = load([consumer, provider]);
    try {
      await cleaning;
      expect(loaded.manifest.map(plugin => plugin.status)).toEqual(["failed", "failed"]);
      expect(calls).toEqual([]);
    } finally { release(); await loaded.close(); }
    expect(calls).toEqual(["consumer", "provider"]);
  });
  // runtime.md：新契约全局替换 schema；后续引用旧声明不能把旧契约重新激活。
  it("同名新契约全局生效，旧契约的后续引用保持下线", () => {
    const shared = tool("Shared read.");
    const replacement = defineTool({ ...tool("Other read.", "test.tools/other-read"),
      argsSchema: z.strictObject({ query: z.string() }).describe("New read parameters.") });
    const loaded = load([plugin("acme.a", shared), plugin("acme.b", shared), plugin("acme.c", replacement), plugin("acme.d", shared)]);
    const order = load([plugin("acme.c", replacement), plugin("acme.a", shared), plugin("acme.b", shared)]);
    expect(loaded.manifest.every(entry => entry.status === "loaded")).toBe(true);
    const status = loaded.manifest.flatMap(entry => entry.implementations.map(item => [item.id, item.active, item.overriddenBy ?? null]));
    expect(status).toEqual([["acme.a/thing.read", false, "acme.c"], ["acme.b/thing.read", false, "acme.c"],
      ["acme.c/thing.read", true, null], ["acme.d/thing.read", false, "acme.c"]]);
    expect(loaded.tools.match({ id: "old", kind: "acme.a/thing", title: "Old", data: {} })).toEqual([]);
    const [active] = loaded.tools.match({ id: "new", kind: "acme.c/thing", title: "New", data: {} });
    expect(active?.tool.argsSchema.safeParse({}).success).toBe(false);
    expect(active?.tool.argsSchema.parse({ query: "text" })).toEqual({ query: "text" });
    expect(order.manifest.flatMap(entry => entry.implementations.map(item => item.active))).toEqual([false, true, true]);
  });
  // 同契约只替换指定资源类型；公共依赖初始化次序不能改变用户列表的覆盖优先级。
  it("共享契约的同资源实现由用户列表后者替换，其他资源实现保留", () => {
    const shared = tool("Shared read.");
    const resource = pluginNamespace("acme.a").resource("thing", z.object({}));
    const original = plugin("acme.a", shared, { resource });
    const replacement = plugin("acme.c", shared, { resource });
    const loaded = load([{ ...original, dependencies: ["acme.c"] }, plugin("acme.b", shared), replacement]);
    expect(loaded.manifest.map(entry => entry.status)).toEqual(["loaded", "loaded", "loaded"]);
    expect(loaded.manifest.flatMap(entry => entry.implementations.map(item => [item.id, item.active, item.overriddenBy ?? null])))
      .toEqual([["acme.a/thing.read", false, "acme.c"], ["acme.b/thing.read", true, null], ["acme.c/thing.read", true, null]]);
    expect(loaded.tools.match({ id: "a", kind: resource.kind, title: "A", data: {} }).map(item => item.reference.id))
      .toEqual(["acme.c/thing.read"]);
    expect(loaded.tools.match({ id: "b", kind: "acme.b/thing", title: "B", data: {} }).map(item => item.reference.id))
      .toEqual(["acme.b/thing.read"]);
  });
  // 同插件内的重复支持关系是声明错误，不能冒充两个插件的有序覆盖。
  it("同插件重复实现使该插件失败，并保留此前的有效实现", () => {
    const shared = tool("Shared read.");
    const resource = pluginNamespace("acme.a").resource("thing", z.object({}));
    const loaded = load([plugin("acme.a", shared, { resource }), plugin("acme.bad", shared, { extra: [shared], resource })]);
    expect(loaded.manifest.map(entry => entry.status)).toEqual(["loaded", "failed"]);
    expect(loaded.tools.match({ id: "a", kind: resource.kind, title: "A", data: {} }).map(item => item.reference.id))
      .toEqual(["acme.a/thing.read"]);
  });
  it("同一插件内同名异契约使该插件装配失败", () => {
    const loaded = load([plugin("acme.self", tool("One."), { extra: [tool("Two.", "test.tools/second-read")] })]);
    expect(loaded.manifest[0]).toMatchObject({ status: "failed", error: expect.any(String) });
  });
  it("不同插件重新声明相同工具 ID 时明确失败，不合并或替换声明", () => {
    const original = tool("Original.");
    const loaded = load([plugin("acme.a", original), plugin("acme.b", tool("Modified."))]);
    expect(loaded.manifest[0]!.status).toBe("loaded");
    expect(loaded.manifest[1]).toMatchObject({ status: "failed", error: expect.any(String) });
  });
  // runtime.md：同插件内的名称／身份冲突及宿主保留名不参与覆盖，错误仅禁用贡献插件。
  it.each(["name", "id", "host"] as const)("顶层工具 %s 冲突使插件装配失败", conflict => {
    const ns = pluginNamespace("acme.bad");
    const declaration = defineTopLevelTool({
      id: ns.name("first"), name: conflict === "host" ? "resource_call" : "ask_user",
      description: "Ask a question.", guidelines: [],
      argsSchema: z.null().describe("No arguments."), resultSchema: z.null().describe("No result."),
      effect: "read", execution: "parallel", async execute() { return { kind: "succeeded", data: null }; },
    });
    const duplicate = defineTopLevelTool({ ...declaration,
      id: conflict === "id" ? declaration.id : ns.name("second"),
      name: conflict === "id" ? "another_question" : declaration.name,
    });
    const bad = definePlugin({ namespace: ns, version: "1", modules: [
      defineModule(() => ({ topLevelTools: [declaration] })),
      defineModule(() => ({ topLevelTools: conflict === "host" ? [] : [duplicate] })),
    ] });
    const loaded = load([bad, plugin("acme.ok", tool("Read."))]);
    expect(loaded.manifest.map(entry => entry.status)).toEqual(["failed", "loaded"]);
    expect(loaded.manifest[0]?.error).toContain("Duplicate top-level tool");
  });
});

describe("插件缺席", () => {
  it("缺失实现的资源仍可投影原始数据，inspect 与调用返回可区分错误", async () => {
    const { ResourceRegistry } = await import("../resources/registry.ts");
    const { ToolRegistry } = await import("../tools/registry.ts");
    const { AgentCapabilities } = await import("../execution/capabilities.ts");
    const resources = new ResourceRegistry([]);
    const object = { id: "x", kind: "acme.gone/thing", title: "Gone", data: { value: 1 } };
    expect(resources.project(object)).toEqual({ contract: { id: "asterism.builtin/missing-resource" },
      data: { plugin: "acme.gone", kind: "acme.gone/thing", data: { value: 1 } } });
    expect(await resources.inspect(object)).toMatchObject({ available: false, error: { code: "implementation_missing" } });
    const capabilities = new AgentCapabilities(resources, new ToolRegistry([]), [object], () => true);
    expect(capabilities.resolve("x", "read", null, {})).toMatchObject({ kind: "rejected", error: { code: "implementation_missing" } });
  });
});
