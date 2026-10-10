import { describe, expect, it } from "vitest";
import { z } from "zod";
import { pluginNamespace } from "../shared/plugin.ts";
import { defineImplementation, defineTool } from "../shared/module-contract.ts";
import { implement } from "../tools/contract.ts";
import { definePlugin, defineModule, type PluginDefinition } from "./contract.ts";
import { loadPlugins, type PluginHostServices } from "./loader.ts";

const services = { extensionsDirectory: "/unused", state: null as never, kindOf: () => null, sessions: null as never,
  internal: null as never, log: () => {} } satisfies PluginHostServices;
const args = z.strictObject({}).describe("No parameters.");
const tool = (description: string) => defineTool({ name: "read", description, guidelines: [], argsSchema: args });
function plugin(id: string, contract: ReturnType<typeof tool>, extra: ReturnType<typeof tool>[] = []): PluginDefinition {
  const ns = pluginNamespace(id);
  const resource = ns.resource("thing", z.object({}));
  const impl = (name: string, t: ReturnType<typeof tool>) => implement(defineImplementation({
    ...ns.data(name, 1, z.null().describe("No result.")), resource, tool: t,
    targetSchema: z.null().describe("Whole resource."), effect: "read", execution: "parallel",
  }), { async call() { return { kind: "succeeded", data: null }; } });
  return definePlugin({ namespace: ns, version: "1.0.0", modules: [defineModule(() => ({
    resources: [{ kind: resource.kind, project: () => ({ contract: { id: "x", version: 1 }, data: null }), inspect: async () => null, context: async () => [] }],
    tools: [impl("thing.read", contract), ...extra.map((t, i) => impl(`thing.extra${i}`, t))],
  }))] });
}

describe("插件装配", () => {
  it("单个插件装配失败只禁用它本身", () => {
    const broken = definePlugin({ namespace: pluginNamespace("acme.broken"), version: "1.0.0", modules: [() => { throw new Error("boom"); }] });
    const loaded = loadPlugins([broken, plugin("acme.ok", tool("Read."))], services);
    expect(loaded.manifest.map(entry => [entry.id, entry.status])).toEqual([["acme.broken", "failed"], ["acme.ok", "loaded"]]);
    expect(loaded.resources.controller("acme.ok/thing")).toBeUndefined();
    expect(loaded.manifest[0]!.error).toBe("boom");
  });
  it("后装配的同名契约生效，绑定旧契约的实现下线，共享契约对象的实现保留", () => {
    const shared = tool("Shared read.");
    const loaded = loadPlugins([plugin("acme.a", shared), plugin("acme.b", shared), plugin("acme.c", tool("Other read."))], services);
    const status = loaded.manifest.flatMap(entry => entry.implementations.map(item => [item.id, item.active, item.overriddenBy ?? null]));
    expect(status).toEqual([["acme.a/thing.read", false, "acme.c"], ["acme.b/thing.read", false, "acme.c"], ["acme.c/thing.read", true, null]]);
    const order = loadPlugins([plugin("acme.c", tool("Other read.")), plugin("acme.a", shared), plugin("acme.b", shared)], services);
    expect(order.manifest.flatMap(entry => entry.implementations.map(item => item.active))).toEqual([false, true, true]);
  });
  it("同一插件内同名异契约使该插件装配失败", () => {
    const loaded = loadPlugins([plugin("acme.self", tool("One."), [tool("Two.")])], services);
    expect(loaded.manifest[0]).toMatchObject({ status: "failed", error: expect.stringContaining("conflicting contracts") });
  });
});

describe("插件缺席", () => {
  it("缺失实现的资源仍可投影原始数据，inspect 与调用返回可区分错误", async () => {
    const { ResourceRegistry } = await import("../resources/registry.ts");
    const { ToolRegistry } = await import("../tools/registry.ts");
    const { AgentCapabilities } = await import("../execution/capabilities.ts");
    const resources = new ResourceRegistry([]);
    const object = { id: "x", kind: "acme.gone/thing", title: "Gone", data: { value: 1 } };
    expect(resources.project(object)).toEqual({ contract: { id: "atelier.core/missing-resource", version: 1 },
      data: { plugin: "acme.gone", kind: "acme.gone/thing", data: { value: 1 } } });
    expect(await resources.inspect(object)).toMatchObject({ available: false, error: { code: "implementation_missing" } });
    const capabilities = new AgentCapabilities(resources, new ToolRegistry([]), [object], () => true);
    expect(capabilities.resolve("x", "read", null, {})).toMatchObject({ kind: "rejected", error: { code: "implementation_missing" } });
  });
});
