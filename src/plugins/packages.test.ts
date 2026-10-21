import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PackageList, loadPackages, readManifest, readPackageMetadata } from "./packages.ts";
import { ApplicationService } from "../runtime/service.ts";
import { pathToFileURL } from "node:url";
import type { PluginDefinition } from "@atelier/sdk/runtime";

const roots: string[] = [];
afterEach(() => { for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true }); });
function temp() { const r = mkdtempSync(join(tmpdir(), "plugin-pkg-")); roots.push(r); return r; }
function pkg(root: string, atelier: unknown, source?: string) {
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "x", atelier }));
  if (source) writeFileSync(join(root, "src", "runtime.ts"), source);
}
const runtime = (id: string) => `import { pluginNamespace, defineCreation, defineAction } from "@atelier/sdk/contracts";
import { definePlugin, defineModule } from "@atelier/sdk/runtime";
const ns: { id: string } = pluginNamespace(${JSON.stringify(id)});
export default definePlugin({ namespace: ns, version: "0.0.1", modules: [defineModule(() => ({}))] });`;

describe("插件包", () => {
  // 信息卡片必须独立于代码与 API 兼容读取；禁用、失败插件仍显示真实身份资料。
  it("元信息不执行插件代码，旧 API 的包也可读取名称、作者和包内图标", () => {
    const root = temp();
    writeFileSync(join(root, "package.json"), JSON.stringify({
      name: "@example/info", version: "1.2.3", description: "Package description", author: { name: "Author" },
      atelier: { id: "example.info", api: { major: 8, minMinor: 0 }, displayName: "Display name", icon: "icon.svg", runtime: "runtime.ts" },
    }));
    writeFileSync(join(root, "runtime.ts"), 'throw new Error("Must not execute.");');
    writeFileSync(join(root, "icon.svg"), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    expect(() => readManifest(root)).toThrow();
    expect(readPackageMetadata(root)).toEqual({
      name: "Display name", description: "Package description", version: "1.2.3", author: "Author",
      icon: `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString("base64")}`,
    });
  });
  it("只认包根：无清单的目录添加失败且不留条目", () => {
    const data = temp(); const dir = temp();
    const list = new PackageList(join(data, "plugins.json"));
    expect(() => list.add({ source: { kind: "path", path: dir } }, data)).toThrow();
    pkg(dir, { id: "acme.x" });
    expect(() => list.add({ source: { kind: "path", path: dir } }, data)).toThrow();
    expect(list.read()).toEqual([]);
  });
  it("API 12.0 接受同主版本接口并拒绝旧主版本与更高小版本", () => {
    const dir = temp();
    pkg(dir, { id: "acme.x", api: { major: 12, minMinor: 0 } });
    expect(readManifest(dir).api).toEqual({ major: 12, minMinor: 0 });
    pkg(dir, { id: "acme.x", api: { major: 10, minMinor: 2 } });
    expect(() => readManifest(dir)).toThrow();
    pkg(dir, { id: "acme.x", api: { major: 12, minMinor: 1 } });
    expect(() => readManifest(dir)).toThrow();
  });
  it("源码包经 esbuild 打包导入，SDK 解析到宿主实例；禁用与重复 ID 不加载", async () => {
    const data = temp(); const a = temp(); const b = temp(); const c = temp();
    pkg(a, { id: "acme.a", api: { major: 12, minMinor: 0 }, runtime: "src/runtime.ts" }, runtime("acme.a"));
    pkg(b, { id: "acme.b", api: { major: 12, minMinor: 0 }, runtime: "src/runtime.ts" }, runtime("acme.b"));
    pkg(c, { id: "acme.b", api: { major: 12, minMinor: 0 }, runtime: "src/runtime.ts" }, runtime("acme.b"));
    const list = new PackageList(join(data, "plugins.json"));
    list.add({ source: { kind: "path", path: a } }, data);
    list.add({ source: { kind: "path", path: b } }, data);
    expect(() => list.add({ source: { kind: "path", path: c } }, data)).toThrow();
    list.setEnabled(1, false);
    const loaded = await loadPackages(list, data, join(data, "cache"), ["atelier.builtin"]);
    expect(loaded.map(item => [item.manifest?.id, item.status])).toEqual([["acme.a", "loaded"], ["acme.b", "disabled"]]);
    expect(loaded[0]!.definition?.namespace.id).toBe("acme.a");
  });
  it("构建失败只标记该包", async () => {
    const data = temp(); const a = temp();
    pkg(a, { id: "acme.a", api: { major: 12, minMinor: 0 }, runtime: "src/runtime.ts" }, "export default {{;");
    const list = new PackageList(join(data, "plugins.json"));
    list.add({ source: { kind: "path", path: a } }, data);
    const [item] = await loadPackages(list, data, join(data, "cache"), []);
    expect(item!.status).toBe("failed");
    expect(item!.error).toMatch(/Build failed/);
  });
  it("源码包仅引入公开 SDK 即可提供真实资源，不需要宿主内部工厂", async () => {
    const data = temp(); const root = temp();
    pkg(root, { id: "acme.sdk", api: { major: 12, minMinor: 0 }, runtime: "src/runtime.ts" }, `
      import { z } from "zod";
      import { pluginNamespace, defineCreation, defineAction } from "@atelier/sdk/contracts";
      import { definePlugin, defineModule, implementResource, implementCreation, implementAction } from "@atelier/sdk/runtime";
      const ns = pluginNamespace("acme.sdk");
      const resource = ns.resource("label", z.object({ label: z.string() }));
      const content = ns.data("content", z.string());
      const rename = defineAction(resource, { id: ns.name("rename"), schema: z.string() });
      export default definePlugin({ namespace: ns, version: "1", modules: [defineModule(() => ({
        resources: [implementResource(resource, ns.data("view", z.string()), {
          creation: implementCreation(defineCreation(resource, { id: ns.name("create"), schema: z.string() }), { create: label => ({ title: label, data: { label } }) }),
          actions: [implementAction(rename, { async execute(input, object) { object.commit(writer => { writer.set(content, input); }); } })],
          project: (data, object) => object.get(content) ?? data.label, inspect: async data => data,
        })],
      }))] });
    `);
    const list = new PackageList(join(data, "plugins.json"));
    list.add({ source: { kind: "path", path: root } }, data);
    const [loaded] = await loadPackages(list, data, join(data, "cache"), []);
    expect(loaded!.status, loaded!.error).toBe("loaded");
    const service = new ApplicationService(data, { plugins: [loaded!.definition!] });
    try {
      const sessionId = service.sessions.tree.create("SDK");
      await service.sessions.execute({ type: "resource.create", sessionId, kind: "acme.sdk/label", creation: { id: "acme.sdk/create" }, input: "Hello", position: { x: 0, y: 0 } });
      expect(service.sessions.snapshot(sessionId).workbench.objects[0]!.presentation).toEqual({
        contract: { id: "acme.sdk/view" }, data: "Hello",
      });
      const objectId = service.sessions.snapshot(sessionId).workbench.objects[0]!.id;
      await service.sessions.execute({ type: "resource.command", sessionId, objectId,
        command: { id: "acme.sdk/rename", input: "Renamed" } });
      expect(service.sessions.snapshot(sessionId).workbench.objects[0]!.presentation.data).toBe("Renamed");
    } finally { await service.close(); }
  });
});

function publicFixture() {
  const data = temp(), provider = temp(), consumer = temp();
  pkg(provider, { id: "acme.provider", api: { major: 12, minMinor: 0 }, runtime: "src/runtime.ts", renderer: "src/renderer.ts" }, `
    import { pluginNamespace } from "@atelier/sdk/contracts";
    import { Read, settings, Marker, events } from "./state.ts";
    export default { namespace: pluginNamespace("acme.provider"), version: "1",
      probe: { Read, settings, Marker, events }, modules: [{ setup() {
        events.push("provider"); settings.set("ready", 1);
        return { closing: async () => { events.push("close-provider"); } };
      } }] };
  `);
  const info = JSON.parse(readFileSync(join(provider, "package.json"), "utf8"));
  writeFileSync(join(provider, "package.json"), JSON.stringify({ ...info, name: "@fixture/provider", exports: { "./public": "./src/public.ts" } }));
  writeFileSync(join(provider, "src/state.ts"), `
    import { defineTool } from "@atelier/sdk/contracts";
    import { z } from "zod";
    export const Read = defineTool({ id: "acme.provider/read", name: "read", description: "Read.", guidelines: [],
      argsSchema: z.null().describe("No arguments.") });
    export const settings = new Map();
    export const events = [];
    export class Marker {}
  `);
  writeFileSync(join(provider, "src/public.ts"), 'export { Read, settings, Marker, events } from "./state.ts";');
  writeFileSync(join(provider, "src/renderer.ts"), 'export { Read, settings, Marker } from "./state.ts"; export default { modules: [{ resources: [], cards: [], tools: [] }] };');
  pkg(consumer, { id: "acme.consumer", api: { major: 12, minMinor: 0 }, runtime: "src/runtime.ts", renderer: "src/renderer.ts" }, `
    import { pluginNamespace, defineImplementation } from "@atelier/sdk/contracts";
    import { implementTool } from "@atelier/sdk/runtime";
    import { z } from "zod";
    import { Read, settings, Marker, events } from "@fixture/provider/public";
    const ns = pluginNamespace("acme.consumer");
    const implementation = defineImplementation({ ...ns.data("read", z.null().describe("No result.")),
      resource: ns.resource("thing", z.object({})), tool: Read, targetSchema: z.null().describe("Whole resource."),
      effect: "read", execution: "parallel" });
    export default { namespace: ns, version: "1",
      probe: { Read, settings, Marker, events }, modules: [{ setup() {
        if (settings.get("ready") !== 1) throw new Error("Provider is not initialized.");
        events.push("consumer");
        return { tools: [implementTool(implementation, { async call() { return { kind: "succeeded", data: null }; } })],
          closing: async () => { events.push("close-consumer"); } };
      } }] };
  `);
  const consumerInfo = JSON.parse(readFileSync(join(consumer, "package.json"), "utf8"));
  writeFileSync(join(consumer, "package.json"), JSON.stringify({ ...consumerInfo, name: "@fixture/consumer", peerDependencies: { "@fixture/provider": "*" } }));
  writeFileSync(join(consumer, "src/renderer.ts"), 'export { Read, settings, Marker } from "@fixture/provider/public"; export default { modules: [{ resources: [], cards: [], tools: [] }] };');
  const list = new PackageList(join(data, "plugins.json"));
  list.add({ source: { kind: "path", path: consumer } }, data);
  list.add({ source: { kind: "path", path: provider } }, data);
  return { data, provider, consumer, list, cache: join(data, "cache") };
}
type Probe = { Read: object; settings: Map<string, number>; Marker: new () => object; events: string[] };
describe("公共模块", () => {
  it("提供方内部引用、两个消费者与 re-export 共享真实声明、状态和类身份", async () => {
    const fixture = publicFixture(), second = temp();
    const metadata = JSON.parse(readFileSync(join(fixture.consumer, "package.json"), "utf8"));
    pkg(second, { ...metadata.atelier, id: "acme.second", renderer: undefined },
      readFileSync(join(fixture.consumer, "src/runtime.ts"), "utf8").replaceAll("acme.consumer", "acme.second"));
    writeFileSync(join(second, "package.json"), JSON.stringify({ ...metadata, name: "@fixture/second",
      atelier: { ...metadata.atelier, id: "acme.second", renderer: undefined } }));
    fixture.list.add({ source: { kind: "path", path: second } }, fixture.data);
    const packages = await loadPackages(fixture.list, fixture.data, fixture.cache, []);
    expect(packages.map(pkg => pkg.error)).toEqual([undefined, undefined, undefined]);
    const probes = packages.map(pkg => (pkg.definition as PluginDefinition & { probe: Probe }).probe);
    for (const probe of probes) {
      expect(probe.Read).toBe(probes[0]!.Read);
      expect(probe.settings).toBe(probes[0]!.settings);
      expect(new probe.Marker()).toBeInstanceOf(probes[0]!.Marker);
    }
    const service = new ApplicationService(fixture.data, { plugins: packages.map(pkg => pkg.definition!) });
    try {
      expect(service.sessions.plugins.every(pkg => pkg.status === "loaded")).toBe(true);
      expect(service.sessions.plugins.filter(pkg => pkg.id.startsWith("acme."))
        .flatMap(pkg => pkg.implementations).map(implementation => implementation.active)).toEqual([true, true]);
    } finally { await service.close(); }
  });
  it("前端产物共享真实导出，后台与前端保持各自实例", async () => {
    const fixture = publicFixture();
    const packages = await loadPackages(fixture.list, fixture.data, fixture.cache, []);
    // 在隔离的测试进程中提供前端依赖表，直接验证构建产物，不启动 GUI。
    const globals = globalThis as Record<string, unknown>, previous = globals.__atelierRendererModules;
    globals.__atelierRendererModules = { zod: await import("zod"), "@atelier/sdk/contracts": await import("@atelier/sdk/contracts") };
    try {
      const consumer = await import(pathToFileURL(join(fixture.cache, packages[0]!.renderer!)).href) as Probe;
      const provider = await import(pathToFileURL(join(fixture.cache, packages[1]!.renderer!)).href) as Probe;
      expect(consumer.Read).toBe(provider.Read);
      expect(consumer.settings).toBe(provider.settings);
      expect(new consumer.Marker()).toBeInstanceOf(provider.Marker);
      expect(consumer.Read).not.toBe((packages[0]!.definition as PluginDefinition & { probe: Probe }).probe.Read);
    } finally {
      if (previous === undefined) delete globals.__atelierRendererModules;
      else globals.__atelierRendererModules = previous;
    }
  });
  it("提供方禁用明确阻断消费者；损坏的无关插件不阻断公共模块图", async () => {
    const fixture = publicFixture(), broken = temp();
    pkg(broken, { id: "acme.broken", api: { major: 12, minMinor: 0 }, runtime: "src/runtime.ts" }, "invalid }");
    fixture.list.add({ source: { kind: "path", path: broken } }, fixture.data);
    let packages = await loadPackages(fixture.list, fixture.data, fixture.cache, []);
    expect(packages.map(pkg => pkg.status)).toEqual(["loaded", "loaded", "failed"]);
    fixture.list.setEnabled(1, false);
    packages = await loadPackages(fixture.list, fixture.data, fixture.cache, []);
    expect(packages.map(pkg => pkg.status)).toEqual(["failed", "disabled", "failed"]);
    expect(packages[0]!.error).toEqual(expect.any(String));
  });
  it("插件根目录外的 re-export 仍登记间接依赖，提供方损坏不拖垮无关插件", async () => {
    const fixture = publicFixture(), outside = temp(), healthy = temp();
    const helper = join(outside, "helper.ts");
    writeFileSync(helper, 'export * from "@fixture/provider/public";');
    const source = join(fixture.consumer, "src/runtime.ts");
    writeFileSync(source, readFileSync(source, "utf8").replace('"@fixture/provider/public"', JSON.stringify(helper)));
    const metadata = JSON.parse(readFileSync(join(fixture.consumer, "package.json"), "utf8"));
    delete metadata.atelier.renderer;
    writeFileSync(join(fixture.consumer, "package.json"), JSON.stringify(metadata));
    pkg(healthy, { id: "acme.healthy", api: { major: 12, minMinor: 0 }, runtime: "src/runtime.ts" }, runtime("acme.healthy"));
    fixture.list.add({ source: { kind: "path", path: healthy } }, fixture.data);
    let packages = await loadPackages(fixture.list, fixture.data, fixture.cache, []);
    expect(packages[0]!.definition?.dependencies).toEqual(["acme.provider"]);
    writeFileSync(join(fixture.provider, "src/runtime.ts"), "invalid }");
    packages = await loadPackages(fixture.list, fixture.data, fixture.cache, []);
    expect(packages.map(pkg => pkg.status)).toEqual(["failed", "failed", "loaded"]);
  });
  it("前端的反向导入不制造后台初始化循环", async () => {
    const fixture = publicFixture();
    const consumer = JSON.parse(readFileSync(join(fixture.consumer, "package.json"), "utf8"));
    consumer.exports = { "./public": "./src/public.ts" };
    writeFileSync(join(fixture.consumer, "package.json"), JSON.stringify(consumer));
    writeFileSync(join(fixture.consumer, "src/public.ts"), "export const label = 'Consumer';");
    const provider = JSON.parse(readFileSync(join(fixture.provider, "package.json"), "utf8"));
    provider.peerDependencies = { "@fixture/consumer": "*" };
    writeFileSync(join(fixture.provider, "package.json"), JSON.stringify(provider));
    writeFileSync(join(fixture.provider, "src/renderer.ts"),
      'export { label } from "@fixture/consumer/public"; export default { modules: [{ resources: [], cards: [], tools: [] }] };');
    const packages = await loadPackages(fixture.list, fixture.data, fixture.cache, []);
    expect(packages[0]!.definition?.dependencies).toEqual(["acme.provider"]);
    expect(packages[1]!.definition?.dependencies).toEqual([]);
    const service = new ApplicationService(fixture.data, { plugins: packages.map(pkg => pkg.definition!) });
    try { expect(service.sessions.plugins.every(pkg => pkg.status === "loaded")).toBe(true); }
    finally { await service.close(); }
  });
  it("禁用的同名包不影响启用提供方的合法私有自引用", async () => {
    const fixture = publicFixture(), disabled = temp();
    const provider = JSON.parse(readFileSync(join(fixture.provider, "package.json"), "utf8"));
    provider.exports["./internal"] = "./src/state.ts";
    writeFileSync(join(fixture.provider, "package.json"), JSON.stringify(provider));
    const source = join(fixture.provider, "src/runtime.ts");
    writeFileSync(source, readFileSync(source, "utf8").replace('"./state.ts"', '"@fixture/provider/internal"'));
    writeFileSync(join(disabled, "package.json"), JSON.stringify({ ...provider, atelier: { id: "acme.disabled", api: { major: 12, minMinor: 0 } } }));
    const list = new PackageList(join(fixture.data, "other-plugins.json"));
    list.add({ source: { kind: "path", path: disabled } }, fixture.data); list.setEnabled(0, false);
    list.add({ source: { kind: "path", path: fixture.consumer } }, fixture.data);
    list.add({ source: { kind: "path", path: fixture.provider } }, fixture.data);
    const packages = await loadPackages(list, fixture.data, fixture.cache, []);
    expect(packages.map(pkg => pkg.status)).toEqual(["disabled", "loaded", "loaded"]);
  });
});
