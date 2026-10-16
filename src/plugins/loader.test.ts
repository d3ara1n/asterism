import { describe, expect, it } from "vitest";
import { z } from "zod";
import { pluginNamespace, defineAction, defineRecord } from "@atelier/sdk/contracts";
import { defineImplementation, defineTool } from "@atelier/sdk/contracts";
import { definePlugin, defineModule, implementTool, implementResource, type PluginDefinition } from "@atelier/sdk/runtime";
import { loadPlugins, type PluginHostServices } from "./loader.ts";

const services = { extensionsDirectory: "/unused", data: null as never, refOf: () => null, sessions: { progressChanged() {} } as never,
  models: { list: () => [] } as never, log: () => {} } satisfies PluginHostServices;
const args = z.strictObject({}).describe("No parameters.");
const tool = (description: string, id = "test.tools/read") => defineTool({ id, name: "read", description, guidelines: [], argsSchema: args });
function plugin(id: string, contract: ReturnType<typeof tool>, extra: ReturnType<typeof tool>[] = []): PluginDefinition {
  const ns = pluginNamespace(id);
  const resource = ns.resource("thing", z.object({}));
  const impl = (name: string, t: ReturnType<typeof tool>) => implementTool(defineImplementation({
    ...ns.data(name, z.null().describe("No result.")), resource, tool: t,
    targetSchema: z.null().describe("Whole resource."), effect: "read", execution: "parallel",
  }), { async call() { return { kind: "succeeded", data: null }; } });
  return definePlugin({ namespace: ns, version: "1.0.0", modules: [defineModule(() => ({
    resources: [implementResource(resource, ns.data("view", z.null()), { project: () => null, inspect: async () => null })],
    tools: [impl("thing.read", contract), ...extra.map((t, i) => impl(`thing.extra${i}`, t))],
  }))] });
}

describe("插件装配", () => {
  it("记录可复用同一声明，独立副本即使 ID 相同也使装配失败", async () => {
    const ns = pluginNamespace("test.records"), record = defineRecord(ns.name("record"), { schema: z.number() });
    const plugin = (other: typeof record) => definePlugin({ namespace: ns, version: "1", modules: [
      defineModule(() => ({ records: [record] })), defineModule(() => ({ records: [other] })),
    ] });
    const shared = loadPlugins([plugin(record)], services);
    const conflict = loadPlugins([plugin(defineRecord(record.id, { schema: record.schema }))], services);
    try {
      expect(shared.manifest[0]?.status).toBe("loaded");
      expect(conflict.manifest[0]?.status).toBe("failed");
    } finally { await shared.close(); await conflict.close(); }
  });
  it("单个插件装配失败只禁用它本身", () => {
    const broken = definePlugin({ namespace: pluginNamespace("acme.broken"), version: "1.0.0", modules: [defineModule(() => { throw new Error("boom"); })] });
    const loaded = loadPlugins([broken, plugin("acme.ok", tool("Read."))], services);
    expect(loaded.manifest.map(entry => [entry.id, entry.status])).toEqual([["acme.broken", "failed"], ["acme.ok", "loaded"]]);
    expect(loaded.resources.controller("acme.ok/thing")?.create).toBeUndefined();
    expect(loaded.manifest[0]!.error).toBe("boom");
  });
  it("后续模块失败时逆序清理已初始化模块，关闭不会重复清理", async () => {
    const calls: string[] = [];
    const broken = definePlugin({ namespace: pluginNamespace("acme.cleanup"), version: "1", modules: [
      defineModule(plugin => ({ closing: async () => { plugin.models.list(); calls.push("first"); } })),
      defineModule(() => ({ closing: async () => { calls.push("second"); } })),
      defineModule(() => { throw new Error("setup failed"); }),
    ] });
    const loaded = loadPlugins([broken], services);
    expect(loaded.manifest[0]!.status).toBe("failed");
    await loaded.close(); await loaded.close();
    expect(calls).toEqual(["second", "first"]);
  });
  it("失败消费者的异步清理结束前不释放仍有效的公共提供方", async () => {
    const calls: string[] = [];
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const provider = definePlugin({ namespace: pluginNamespace("acme.provider"), version: "1",
      modules: [defineModule(() => ({ closing: async () => { calls.push("provider"); } }))] });
    const consumer = definePlugin({ namespace: pluginNamespace("acme.consumer"), version: "1", dependencies: ["acme.provider"],
      modules: [
        defineModule(() => ({ closing: async () => { await held; calls.push("consumer"); } })),
        defineModule(() => { throw new Error("setup failed"); }),
      ] });
    const loaded = loadPlugins([consumer, provider], services);
    const closing = loaded.close();
    await Promise.resolve();
    expect(calls).toEqual([]);
    release(); await closing;
    expect(calls).toEqual(["consumer", "provider"]);
  });
  it("后置契约校验失败先收集依赖失败，再按消费者到提供方清理", async () => {
    const calls: string[] = [], ns = pluginNamespace("acme.provider");
    const action = defineAction(ns.resource("thing", z.object({})), { id: ns.name("missing"), schema: z.null() });
    const provider = definePlugin({ namespace: ns, version: "1", modules: [defineModule(() => ({
      preparers: [{ id: "missing", contract: action, prepare: () => ({ action: "accept" }) }],
      closing: async () => { calls.push("provider"); },
    }))] });
    const consumer = definePlugin({ namespace: pluginNamespace("acme.consumer"), version: "1", dependencies: [ns.id],
      modules: [defineModule(() => ({ closing: async () => { calls.push("consumer"); } }))] });
    const loaded = loadPlugins([consumer, provider], services);
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
    const provider = definePlugin({ namespace: ns, version: "1", modules: [defineModule(() => ({
      preparers: [{ id: "missing", contract: action, prepare: () => ({ action: "accept" }) }],
      closing: async () => { calls.push("provider"); },
    }))] });
    const consumer = definePlugin({ namespace: pluginNamespace("acme.consumer"), version: "1", dependencies: [ns.id], modules: [
      defineModule(() => ({ closing: async () => { started(); await held; calls.push("consumer"); } })),
      defineModule(() => { throw new Error("Consumer setup failed."); }),
    ] });
    const loaded = loadPlugins([consumer, provider], services);
    try {
      await cleaning;
      expect(loaded.manifest.map(plugin => plugin.status)).toEqual(["failed", "failed"]);
      expect(calls).toEqual([]);
    } finally { release(); await loaded.close(); }
    expect(calls).toEqual(["consumer", "provider"]);
  });
  it("后装配的同名契约生效，绑定旧契约的实现下线，共享契约身份的实现保留", () => {
    const shared = tool("Shared read.");
    const loaded = loadPlugins([plugin("acme.a", shared), plugin("acme.b", shared), plugin("acme.c", tool("Other read.", "test.tools/other-read"))], services);
    const status = loaded.manifest.flatMap(entry => entry.implementations.map(item => [item.id, item.active, item.overriddenBy ?? null]));
    expect(status).toEqual([["acme.a/thing.read", false, "acme.c"], ["acme.b/thing.read", false, "acme.c"], ["acme.c/thing.read", true, null]]);
    const order = loadPlugins([plugin("acme.c", tool("Other read.", "test.tools/other-read")), plugin("acme.a", shared), plugin("acme.b", shared)], services);
    expect(order.manifest.flatMap(entry => entry.implementations.map(item => item.active))).toEqual([false, true, true]);
  });
  it("同一插件内同名异契约使该插件装配失败", () => {
    const loaded = loadPlugins([plugin("acme.self", tool("One."), [tool("Two.", "test.tools/second-read")])], services);
    expect(loaded.manifest[0]).toMatchObject({ status: "failed", error: expect.any(String) });
  });
  it("不同插件重新声明相同工具 ID 时明确失败，不合并或替换声明", () => {
    const original = tool("Original.");
    const loaded = loadPlugins([plugin("acme.a", original), plugin("acme.b", tool("Modified."))], services);
    expect(loaded.manifest[0]!.status).toBe("loaded");
    expect(loaded.manifest[1]).toMatchObject({ status: "failed", error: expect.any(String) });
  });
});

describe("插件缺席", () => {
  it("缺失实现的资源仍可投影原始数据，inspect 与调用返回可区分错误", async () => {
    const { ResourceRegistry } = await import("../resources/registry.ts");
    const { ToolRegistry } = await import("../tools/registry.ts");
    const { AgentCapabilities } = await import("../execution/capabilities.ts");
    const resources = new ResourceRegistry([]);
    const object = { id: "x", kind: "acme.gone/thing", title: "Gone", data: { value: 1 } };
    expect(resources.project(object)).toEqual({ contract: { id: "atelier.builtin/missing-resource" },
      data: { plugin: "acme.gone", kind: "acme.gone/thing", data: { value: 1 } } });
    expect(await resources.inspect(object)).toMatchObject({ available: false, error: { code: "implementation_missing" } });
    const capabilities = new AgentCapabilities(resources, new ToolRegistry([]), [object], () => true);
    expect(capabilities.resolve("x", "read", null, {})).toMatchObject({ kind: "rejected", error: { code: "implementation_missing" } });
  });
});
