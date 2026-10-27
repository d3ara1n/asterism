import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { belongsTo, pluginNamespace, defineCall, defineAction, defineRecord, defineImplementation, defineTool, type ResourceContract, type ToolContract } from "@asterism/sdk/contracts";
import { defineTopLevelTool, definePlugin, defineModule, implementCall, implementTool, implementResource, type PluginDefinition, type PluginContext } from "@asterism/sdk/runtime";
import { loadPlugins, type PluginHostServices } from "./loader.ts";
import { CallClient } from "../shared/call-client.ts";
import type { CallFrame } from "../shared/plugin-calls.ts";

const services = { extensionsDirectory: "/unused", data: null as never, refOf: () => null, sessions: { progressChanged() {} } as never,
  models: { list: () => [] } as never, log: () => {} } satisfies PluginHostServices;
const instances: ReturnType<typeof loadPlugins>[] = [];
afterEach(async () => {
  for (const instance of instances.splice(0).reverse()) await instance.close();
});
function load(plugins: readonly PluginDefinition[], pluginDependencies?: ReadonlyMap<string, readonly string[]>) {
  const instance = loadPlugins(plugins, { ...services, pluginDependencies });
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
  return definePlugin({ namespace: ns, modules: [defineModule(() => ({
    resources: belongsTo(id, resource.kind)
      ? [implementResource(resource, ns.data("view", z.null()), { project: () => null, inspect: async () => null })] : [],
    tools: [impl("thing.read", contract), ...(options.extra ?? []).map((t, i) => impl(`thing.extra${i}`, t))],
  }))] });
}

describe("Plugin assembly", () => {
  // A resource's template policy cannot select another plugin's data or give one saved ID ambiguous schemas.
  it.each(["foreign", "duplicate"] as const)("rejects %s template data declarations", mode => {
    const ns = pluginNamespace("test.templates");
    const own = ns.data("state", z.string());
    const current = mode === "foreign" ? [pluginNamespace("test.other").data("state", z.string())] : [own, own];
    const loaded = load([definePlugin({ namespace: ns, setup: () => ({
      resources: [implementResource(ns.resource("item", z.null()), ns.data("view", z.null()), {
        template: { current }, project: () => null, inspect: async () => null,
      })],
    }) })]);
    expect(loaded.manifest[0]).toMatchObject({ status: "failed" });
    expect(loaded.manifest[0]!.error).toContain(mode === "foreign" ? "must belong" : "Duplicate template data");
  });

  // Schema input/output differ on both sides; reparsing a decoded value would reject it, and omitted defaults belong to the input parser.
  it("typed backend and frontend calls transform raw JSON at their receiving boundaries", async () => {
    const ns = pluginNamespace("test.call-transforms");
    const query = defineCall(ns.name("calculate"), {
      scope: "plugin",
      input: z.object({ value: z.string().transform(Number), increment: z.number().default(2) }),
      output: z.string().transform(Number),
    });
    let context!: PluginContext;
    const loaded = load([definePlugin({ namespace: ns, setup(plugin) {
      context = plugin;
      return { calls: [implementCall(query, async input => {
        expect(input).toEqual({ value: 40, increment: 2 });
        return String(input.value + input.increment);
      })] };
    } })]);
    expect(await context.ipc.calls.invoke(query, { value: "40" }, {})).toBe(42);
    let receive!: (frame: CallFrame) => void;
    const frontend = new CallClient({
      onFrame(listener) { receive = listener; return () => {}; },
      send(control) {
        if (control.type !== "invoke") return;
        void loaded.calls.invoke(control.contract, control.input, {}, null).then(
          data => receive({ type: "result", id: control.id, data }),
          error => receive({ type: "error", id: control.id, code: "failed", message: String(error) }),
        );
      },
    });
    try { expect(await frontend.invoke(query, { value: "40" }, {})).toBe(42); }
    finally { frontend.close(); }
  });
  // Plugin-level calls need no object; call arguments cannot downgrade contract scope.
  it("plugins without modules declare global services and share scope validation between backend and desktop calls", async () => {
    const ns = pluginNamespace("test.global");
    const query = defineCall(ns.name("query"), { scope: "plugin", input: z.string().trim(), output: z.string() });
    const objectQuery = defineCall(ns.name("object"), { scope: "object", input: z.null(), output: z.null() });
    let context!: PluginContext;
    const loaded = load([definePlugin({ namespace: ns, setup(plugin) {
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
  // Shared services must outlive module release; root and module contributions use the same conflict validation.
  it.each([false, true])("plugin root shared services clean up after modules; duplicate registration failure=%s", async conflict => {
    const ns = pluginNamespace("test.composition"), order: string[] = [];
    const query = defineCall(ns.name("query"), { scope: "plugin", input: z.null(), output: z.number() });
    const loaded = load([definePlugin({ namespace: ns, setup(plugin) {
      const service = { value: 1 };
      // Roots register before modules so reverse cleanup releases modules first.
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
  // Plugin-level calls have no session association, but close must wait for actual handler exit before destroying shared services.
  it("close cancels global calls and retains plugin services until handler cleanup finishes", async () => {
    const ns = pluginNamespace("test.wait");
    const wait = defineCall(ns.name("wait"), { scope: "plugin", input: z.null(), output: z.null() });
    let started!: () => void, release!: () => void, cancelled!: () => void;
    const start = new Promise<void>(resolve => { started = resolve; });
    const held = new Promise<void>(resolve => { release = resolve; });
    const abort = new Promise<void>(resolve => { cancelled = resolve; });
    const order: string[] = [];
    const loaded = load([definePlugin({ namespace: ns, setup: plugin => {
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
  it("records can reuse the same declaration; independent copies fail assembly even with identical IDs", () => {
    const ns = pluginNamespace("test.records"), record = defineRecord(ns.name("record"), { schema: z.number() });
    const plugin = (other: typeof record) => definePlugin({ namespace: ns, modules: [
      defineModule(() => ({ records: [record] })), defineModule(() => ({ records: [other] })),
    ] });
    const shared = load([plugin(record)]);
    const conflict = load([plugin(defineRecord(record.id, { schema: record.schema }))]);
    expect(shared.manifest[0]?.status).toBe("loaded");
    expect(conflict.manifest[0]?.status).toBe("failed");
  });
  it("assembly failure disables only the affected plugin", () => {
    const broken = definePlugin({ namespace: pluginNamespace("acme.broken"), modules: [defineModule(() => { throw new Error("boom"); })] });
    const loaded = load([broken, plugin("acme.ok", tool("Read."))]);
    expect(loaded.manifest.map(entry => [entry.id, entry.status])).toEqual([["acme.broken", "failed"], ["acme.ok", "loaded"]]);
    expect(loaded.resources.controller("acme.ok/thing")?.create).toBeUndefined();
    expect(loaded.manifest[0]!.error).toBe("boom");
  });
  it("later module failure cleans initialized modules in reverse order and close does not clean them twice", async () => {
    const calls: string[] = [];
    const broken = definePlugin({ namespace: pluginNamespace("acme.cleanup"), modules: [
      defineModule(plugin => { plugin.lifetime.defer(async () => { plugin.models.list(); calls.push("first"); }); return {}; }),
      defineModule(plugin => { plugin.lifetime.defer(async () => { calls.push("second"); }); return {}; }),
      defineModule(() => { throw new Error("setup failed"); }),
    ] });
    const loaded = load([broken]);
    expect(loaded.manifest[0]!.status).toBe("failed");
    await loaded.close(); await loaded.close();
    expect(calls).toEqual(["second", "first"]);
  });
  it("valid public providers remain until failed consumers finish asynchronous cleanup", async () => {
    const calls: string[] = [];
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const provider = definePlugin({ namespace: pluginNamespace("acme.provider"),
      modules: [defineModule(plugin => { plugin.lifetime.defer(async () => { calls.push("provider"); }); return {}; })] });
    const consumer = definePlugin({ namespace: pluginNamespace("acme.consumer"),
      modules: [
        defineModule(plugin => { plugin.lifetime.defer(async () => { await held; calls.push("consumer"); }); return {}; }),
        defineModule(() => { throw new Error("setup failed"); }),
      ] });
    const loaded = load([consumer, provider], new Map([["acme.consumer", ["acme.provider"]]]));
    const closing = loaded.close();
    try {
      await Promise.resolve();
      expect(calls).toEqual([]);
    } finally { release(); await closing; }
    expect(calls).toEqual(["consumer", "provider"]);
  });
  it("post-assembly contract validation failures collect dependency failures before cleaning consumers ahead of providers", async () => {
    const calls: string[] = [], ns = pluginNamespace("acme.provider");
    const action = defineAction(ns.resource("thing", z.object({})), { id: ns.name("missing"), schema: z.null() });
    const provider = definePlugin({ namespace: ns, modules: [defineModule(plugin => {
      plugin.lifetime.defer(async () => { calls.push("provider"); });
      return { preparers: [{ id: "missing", contract: action, prepare: () => ({ action: "accept" }) }] };
    })] });
    const consumer = definePlugin({ namespace: pluginNamespace("acme.consumer"),
      modules: [defineModule(plugin => { plugin.lifetime.defer(async () => { calls.push("consumer"); }); return {}; })] });
    const loaded = load([consumer, provider], new Map([["acme.consumer", [ns.id]]]));
    expect(loaded.manifest.map(plugin => plugin.status)).toEqual(["failed", "failed"]);
    await loaded.close();
    expect(calls).toEqual(["consumer", "provider"]);
  });
  // setup and post-validation may fail separately in one assembly; two cleanup tasks must not bypass dependency order.
  it("provider post-validation failures still wait for asynchronous cleanup after consumer setup failures", async () => {
    const calls: string[] = [], ns = pluginNamespace("acme.provider");
    let release!: () => void, started!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const cleaning = new Promise<void>(resolve => { started = resolve; });
    const action = defineAction(ns.resource("thing", z.object({})), { id: ns.name("missing"), schema: z.null() });
    const provider = definePlugin({ namespace: ns, modules: [defineModule(plugin => {
      plugin.lifetime.defer(async () => { calls.push("provider"); });
      return { preparers: [{ id: "missing", contract: action, prepare: () => ({ action: "accept" }) }] };
    })] });
    const consumer = definePlugin({ namespace: pluginNamespace("acme.consumer"), modules: [
      defineModule(plugin => { plugin.lifetime.defer(async () => { started(); await held; calls.push("consumer"); }); return {}; }),
      defineModule(() => { throw new Error("Consumer setup failed."); }),
    ] });
    const loaded = load([consumer, provider], new Map([["acme.consumer", [ns.id]]]));
    try {
      await cleaning;
      expect(loaded.manifest.map(plugin => plugin.status)).toEqual(["failed", "failed"]);
      expect(calls).toEqual([]);
    } finally { release(); await loaded.close(); }
    expect(calls).toEqual(["consumer", "provider"]);
  });
  // New contracts replace schemas globally; later old-declaration references cannot reactivate old contracts.
  it("new same-name contracts take effect globally while subsequent old-contract references remain inactive", () => {
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
  // Replace only the specified resource type for a shared contract; public dependency initialization order must not alter user-list override precedence.
  it("later user-list entries replace same-resource implementations of shared contracts while other resource implementations remain", () => {
    const shared = tool("Shared read.");
    const resource = pluginNamespace("acme.a").resource("thing", z.object({}));
    const original = plugin("acme.a", shared, { resource });
    const replacement = plugin("acme.c", shared, { resource });
    const loaded = load([original, plugin("acme.b", shared), replacement], new Map([["acme.a", ["acme.c"]]]));
    expect(loaded.manifest.map(entry => entry.status)).toEqual(["loaded", "loaded", "loaded"]);
    expect(loaded.manifest.flatMap(entry => entry.implementations.map(item => [item.id, item.active, item.overriddenBy ?? null])))
      .toEqual([["acme.a/thing.read", false, "acme.c"], ["acme.b/thing.read", true, null], ["acme.c/thing.read", true, null]]);
    expect(loaded.tools.match({ id: "a", kind: resource.kind, title: "A", data: {} }).map(item => item.reference.id))
      .toEqual(["acme.c/thing.read"]);
    expect(loaded.tools.match({ id: "b", kind: "acme.b/thing", title: "B", data: {} }).map(item => item.reference.id))
      .toEqual(["acme.b/thing.read"]);
  });
  // Duplicate support relationships within one plugin are declaration errors, not ordered overrides from separate plugins.
  it("duplicate implementations fail the plugin and retain previous valid implementations", () => {
    const shared = tool("Shared read.");
    const resource = pluginNamespace("acme.a").resource("thing", z.object({}));
    const loaded = load([plugin("acme.a", shared, { resource }), plugin("acme.bad", shared, { extra: [shared], resource })]);
    expect(loaded.manifest.map(entry => entry.status)).toEqual(["loaded", "failed"]);
    expect(loaded.tools.match({ id: "a", kind: resource.kind, title: "A", data: {} }).map(item => item.reference.id))
      .toEqual(["acme.a/thing.read"]);
  });
  it("same names with different contracts within one plugin fail its assembly", () => {
    const loaded = load([plugin("acme.self", tool("One."), { extra: [tool("Two.", "test.tools/second-read")] })]);
    expect(loaded.manifest[0]).toMatchObject({ status: "failed", error: expect.any(String) });
  });
  it("different plugins redeclaring the same tool ID fail explicitly without merging or replacing declarations", () => {
    const original = tool("Original.");
    const loaded = load([plugin("acme.a", original), plugin("acme.b", tool("Modified."))]);
    expect(loaded.manifest[0]!.status).toBe("loaded");
    expect(loaded.manifest[1]).toMatchObject({ status: "failed", error: expect.any(String) });
  });
  // Name/identity conflicts within one plugin and reserved host names do not participate in overrides; errors disable only the contributing plugin.
  it.each(["name", "id", "host"] as const)("top-level tool %s conflicts fail plugin assembly", conflict => {
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
    const bad = definePlugin({ namespace: ns, modules: [
      defineModule(() => ({ topLevelTools: [declaration] })),
      defineModule(() => ({ topLevelTools: conflict === "host" ? [] : [duplicate] })),
    ] });
    const loaded = load([bad, plugin("acme.ok", tool("Read."))]);
    expect(loaded.manifest.map(entry => entry.status)).toEqual(["failed", "loaded"]);
    expect(loaded.manifest[0]?.error).toContain("Duplicate top-level tool");
  });
});

describe("Absent plugins", () => {
  it("resources without implementations still project raw data and return distinct errors from inspect and calls", async () => {
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
