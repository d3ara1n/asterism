import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { defineCreation, pluginNamespace, ResourceStatusChanged, type EventEnvelope, type EventSubscription } from "@atelier/sdk/contracts";
import { defineModule, definePlugin, implementCreation, implementResource, type ObjectExecutor, type PluginContext, type PluginDefinition } from "@atelier/sdk/runtime";
import { ApplicationService } from "../runtime/service.ts";
import { loadPlugins, type PluginHostServices } from "./loader.ts";

const ns = pluginNamespace("test.publisher"), foreign = pluginNamespace("test.consumer");
const Update = ns.event("update", { schema: z.object({ value: z.number(), associated: z.string().optional() }), source: "any", semantics: { kind: "occurrence" } });
const Resource = ns.resource("download", z.object({}));
const Create = defineCreation(Resource, { id: ns.name("create"), schema: z.object({ fail: z.boolean() }) });
const roots: string[] = [], services: ApplicationService[] = [];
afterEach(async () => { await Promise.all(services.splice(0).map(service => service.close())); roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })); vi.restoreAllMocks(); });
function open(plugins: PluginDefinition[]) {
  const root = mkdtempSync(join(tmpdir(), "atelier-event-sdk-")); roots.push(root);
  const service = new ApplicationService(root, { plugins }); services.push(service); return service;
}
function publisher(capture: (plugin: PluginContext) => void, resource: (object: ObjectExecutor) => void = () => {}) {
  return definePlugin({ namespace: ns, version: "1", modules: [defineModule(plugin => {
    capture(plugin);
    return { events: [Update], resources: [implementResource(Resource, ns.data("view", z.null()), {
      creation: implementCreation(Create, { create(input, object) {
        resource(object); object.events.publish(Update, { value: 1 });
        if (input.fail) throw new Error("Creation rolled back.");
        return { title: "Download", data: {} };
      } }), project: () => null, inspect: async () => null,
    })] };
  })] });
}

// 契约依据：SDK 来源印记由操作柄绑定；插件装配、真实事务和关闭复用宿主机制。
describe("事件 SDK 与宿主边界", () => {
  // 公共状态使用资源级完整快照；latest 保留最新载荷，进度只属于 running，来源由宿主校验。
  it("外部资源发布公共状态按 latest 合并，保留真实来源且不写历史", async () => {
    let context!: PluginContext, object!: ObjectExecutor;
    const received: EventEnvelope[] = [];
    const service = open([publisher(value => { context = value; }, value => { object = value; })]);
    context.ipc.events.subscribe(ResourceStatusChanged, { delivery: "latest" }, event => { received.push(event); });
    const sessionId = service.sessions.tree.create("Unopened");
    await service.sessions.execute({ type: "resource.create", sessionId, kind: Resource.kind, creation: { id: Create.id }, input: { fail: false }, position: { x: 0, y: 0 } });
    const before = service.sessions.tree.nodes(sessionId);
    object.events.publish(ResourceStatusChanged, { title: "Download", status: "running" });
    object.events.publish(ResourceStatusChanged, { title: "Download", status: "running", progress: { value: 0.6 } });
    expect(() => context.ipc.events.publish(ResourceStatusChanged, { title: "Download", status: "failed" })).toThrow("source");
    await vi.waitFor(() => expect(received).toHaveLength(1));
    expect(received[0]).toMatchObject({ source: { plugin: ns.id, resource: object.ref },
      data: { title: "Download", status: "running", progress: { value: 0.6 } } });
    object.events.publish(ResourceStatusChanged, { title: "Download", status: "completed" });
    await vi.waitFor(() => expect(received).toHaveLength(2));
    expect(received[1]!.data).toEqual({ title: "Download", status: "completed" });
    expect(ResourceStatusChanged.schema.safeParse({ title: "Download", status: "completed", progress: { value: 1 } }).success).toBe(false);
    expect(() => object.events.publish(ResourceStatusChanged, { title: "Download", status: "running", progress: { value: 2 } })).toThrow("Invalid event payload");
    expect(service.sessions.tree.nodes(sessionId)).toEqual(before);
  });
  it("公共契约发布保留实际插件来源，资源来源独立于载荷关联对象且失效后拒绝发布", async () => {
    let context!: PluginContext, other!: PluginContext, object!: ObjectExecutor;
    const received: EventEnvelope[] = [];
    const consumer = definePlugin({ namespace: foreign, version: "1", dependencies: [ns.id], modules: [defineModule(plugin => {
      other = plugin; plugin.ipc.events.subscribe(Update, {}, event => { received.push(event); }); return {};
    })] });
    const service = open([publisher(value => { context = value; }, value => { object = value; }), consumer]);
    const sessionId = service.sessions.tree.create("Unopened");
    await service.sessions.execute({ type: "resource.create", sessionId, kind: Resource.kind, creation: { id: Create.id }, input: { fail: false }, position: { x: 0, y: 0 } });
    const cursor = service.sessions.tree.cursor(sessionId), count = service.sessions.tree.nodes(sessionId).length;
    other.ipc.events.publish(Update, { value: 2, associated: object.ref.id });
    object.events.publish(Update, { value: 3, associated: "another-resource" });
    await vi.waitFor(() => expect(received).toHaveLength(3));
    expect(received[0]!.source).toEqual({ plugin: ns.id, resource: object.ref });
    expect(received[1]!.source).toEqual({ plugin: foreign.id, resource: null });
    expect(received[2]!.source).toEqual({ plugin: ns.id, resource: object.ref });
    expect(service.sessions.tree.cursor(sessionId)).toBe(cursor);
    expect(service.sessions.tree.nodes(sessionId)).toHaveLength(count);
    expect(() => other.object(sessionId, Resource, object.ref.id)).toThrow();
    await service.sessions.execute({ type: "select", sessionId, nodeId: null });
    expect(() => object.events.publish(Update, { value: 4 })).toThrow("no longer available");
    expect(() => context.ipc.events.publish({ ...Update }, { value: 5 })).toThrow("declared");
  });

  it("发布立即投递，不随所在事务回滚撤回", async () => {
    let context!: PluginContext;
    const received: number[] = [];
    const service = open([publisher(value => { context = value; })]);
    context.ipc.events.subscribe(Update, {}, event => { received.push(event.data.value); });
    const sessionId = service.sessions.tree.create("Unopened");
    const session = context.session(sessionId);
    expect(() => session.commit(() => { context.ipc.events.publish(Update, { value: 2 }); throw new Error("rollback"); })).toThrow("rollback");
    await vi.waitFor(() => expect(received).toEqual([2]));
    expect(service.sessions.tree.nodes(sessionId)).toEqual([]);
  });

  it("后续模块失败会清理 setup 中的待建立订阅和契约", async () => {
    let subscription!: EventSubscription;
    const broken = definePlugin({ namespace: ns, version: "1", modules: [
      defineModule(plugin => { subscription = plugin.ipc.events.subscribe(Update, {}, () => {}); return { events: [Update] }; }),
      defineModule(() => { throw new Error("Setup failed."); }),
    ] });
    const host = { extensionsDirectory: "/unused", data: null as never, refOf: () => null, sessions: { progressChanged() {} } as never,
      models: { list: () => [] } as never, log: () => {} } satisfies PluginHostServices;
    const loaded = loadPlugins([broken], host);
    try {
      expect(loaded.manifest[0]!.status).toBe("failed");
      expect(await subscription.closed).toMatchObject({ reason: "unavailable" });
      await expect(subscription.ready).rejects.toThrow();
      expect(() => loaded.events.contract(Update.id)).toThrow();
    } finally { await loaded.close(); }
  });

  it("插件关闭取消消费并等待回调真正结束，再释放模块设施", async () => {
    let context!: PluginContext, release!: () => void, signal!: AbortSignal, cleaned = false;
    const definition = publisher(value => { context = value; });
    definition.modules = [...definition.modules, defineModule(() => ({ closing: async () => { cleaned = true; } }))];
    const service = open([definition]);
    const sub = context.ipc.events.subscribe(Update, {}, async (_event, current) => {
      signal = current.signal; await new Promise<void>(r => { release = r; });
    });
    context.ipc.events.publish(Update, { value: 1 });
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    const closing = service.close(); services.splice(services.indexOf(service), 1);
    expect(await sub.closed).toMatchObject({ reason: "unavailable" });
    expect(signal.aborted).toBe(true); expect(cleaned).toBe(false);
    expect(() => context.ipc.events.publish(Update, { value: 2 })).toThrow("not available");
    release(); await closing; expect(cleaned).toBe(true);
  });
});
