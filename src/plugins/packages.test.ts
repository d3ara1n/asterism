import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PackageList, loadPackages, readManifest, readPackageMetadata } from "./packages.ts";
import sdkMetadata from "@asterism/sdk/package.json" with { type: "json" };
import { ApplicationService } from "../runtime/service.ts";
import { pathToFileURL } from "node:url";
import type { PluginDefinition } from "@asterism/sdk/runtime";

const roots: string[] = [];
afterEach(() => { for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true }); });
function temp() { const r = mkdtempSync(join(tmpdir(), "plugin-pkg-")); roots.push(r); return r; }
function pkg(root: string, asterism: unknown, source?: string) {
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "x", peerDependencies: { "@asterism/sdk": `^${sdkMetadata.version}` }, asterism }));
  if (source) writeFileSync(join(root, "src", "runtime.ts"), source);
}
const runtime = (id: string) => `import { pluginNamespace } from "@asterism/sdk/contracts";
import { definePlugin, defineModule } from "@asterism/sdk/runtime";
const ns = pluginNamespace(${JSON.stringify(id)});
export default definePlugin({ namespace: ns, version: "0.0.1", modules: [defineModule(() => ({}))] });`;

describe("Plugin packages", () => {
  // Manual entries expose only declared package subdirectories; overlapping roots and escaping symlinks are ambiguous or broaden exposure.
  it("validates documentation directories independently of executable entries", () => {
    const root = temp(), outside = temp();
    mkdirSync(join(root, "docs/examples"), { recursive: true });
    mkdirSync(join(root, "examples"));
    const manifest = (manual: string[]) => { pkg(root, { id: "example.manual", manual }); return readManifest(root); };
    expect(manifest(["docs", "examples"]).manual).toEqual(["docs", "examples"]);
    for (const paths of [["."], ["../outside"], ["/absolute"], ["C:\\outside"], ["docs/../examples"], ["missing"],
      ["docs", "docs"], ["docs", "docs/examples"]])
      expect(() => manifest(paths)).toThrow();
    symlinkSync(outside, join(root, "external"));
    expect(() => manifest(["external"])).toThrow("inside the package");
    writeFileSync(join(root, "article.md"), "Article");
    expect(() => manifest(["article.md"])).toThrow("directory");
  });

  // Information cards must load independently of code and API compatibility; disabled or failed plugins still show real identity metadata.
  it("metadata reads execute no plugin code and can read names, authors, and package icons from incompatible packages", () => {
    const root = temp();
    writeFileSync(join(root, "package.json"), JSON.stringify({
      name: "@example/info", version: "1.2.3", description: "Package description", author: { name: "Author" },
      peerDependencies: { "@asterism/sdk": "^0.1.0" },
      asterism: { id: "example.info", displayName: "Display name", icon: "icon.svg", runtime: "runtime.ts" },
    }));
    writeFileSync(join(root, "runtime.ts"), 'throw new Error("Must not execute.");');
    writeFileSync(join(root, "icon.svg"), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    expect(() => readManifest(root)).toThrow();
    expect(readPackageMetadata(root)).toEqual({
      name: "Display name", description: "Package description", version: "1.2.3", author: "Author",
      icon: `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString("base64")}`,
    });
  });
  it("accepts package roots only; adding directories without manifests fails without retaining entries", () => {
    const data = temp(); const dir = temp();
    const list = new PackageList(join(data, "plugins.json"));
    expect(() => list.add({ source: { kind: "path", path: dir } }, data)).toThrow();
    pkg(dir, undefined);
    expect(() => list.add({ source: { kind: "path", path: dir } }, data)).toThrow();
    expect(list.read()).toEqual([]);
  });
  // Local source dependencies cannot replace host compatibility declarations; 0.x caret ranges cannot cross minor versions.
  it.each([
    [undefined, "invalid_manifest"],
    ["file:../sdk", "invalid_manifest"],
    ["^0.1.0", "incompatible_api"],
    [">=99.0.0", "incompatible_api"],
  ])("rejects SDK peer declaration %s and reports the host version", (range, code) => {
    const dir = temp();
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      asterism: { id: "acme.x" }, peerDependencies: { "@asterism/sdk": range },
      devDependencies: { "@asterism/sdk": "file:../sdk" },
    }));
    expect(() => readManifest(dir)).toThrow(expect.objectContaining({ code, message: expect.stringContaining(`host provides ${sdkMetadata.version}`) }));
  });
  it("compatibility ranges are independent of local development dependencies and startup rechecks modified requirements", async () => {
    const dir = temp(), data = temp();
    const metadata = { asterism: { id: "acme.x" }, peerDependencies: { "@asterism/sdk": `^${sdkMetadata.version}` },
      devDependencies: { "@asterism/sdk": "file:../sdk" } };
    writeFileSync(join(dir, "package.json"), JSON.stringify(metadata));
    const list = new PackageList(join(data, "plugins.json"));
    expect(list.add({ source: { kind: "path", path: dir } }, data).id).toBe("acme.x");
    metadata.peerDependencies["@asterism/sdk"] = ">=99.0.0";
    writeFileSync(join(dir, "package.json"), JSON.stringify(metadata));
    const [loaded] = await loadPackages(list, data, join(data, "cache"), []);
    expect(loaded).toMatchObject({ status: "invalid", error: expect.stringContaining("requires @asterism/sdk >=99.0.0") });
  });
  it("esbuild bundles and imports source packages with the host SDK instance; disabled and duplicate IDs do not load", async () => {
    const data = temp(); const a = temp(); const b = temp(); const c = temp();
    pkg(a, { id: "acme.a", runtime: "src/runtime.ts" }, runtime("acme.a"));
    pkg(b, { id: "acme.b", runtime: "src/runtime.ts" }, runtime("acme.b"));
    pkg(c, { id: "acme.b", runtime: "src/runtime.ts" }, runtime("acme.b"));
    const list = new PackageList(join(data, "plugins.json"));
    list.add({ source: { kind: "path", path: a } }, data);
    list.add({ source: { kind: "path", path: b } }, data);
    expect(() => list.add({ source: { kind: "path", path: c } }, data)).toThrow();
    list.setEnabled(1, false);
    const loaded = await loadPackages(list, data, join(data, "cache"), ["asterism.builtin"]);
    expect(loaded.map(item => [item.manifest?.id, item.status])).toEqual([["acme.a", "loaded"], ["acme.b", "disabled"]]);
    expect(loaded[0]!.definition?.namespace.id).toBe("acme.a");
  });
  it("build failures mark only the affected package", async () => {
    const data = temp(); const a = temp();
    pkg(a, { id: "acme.a", runtime: "src/runtime.ts" }, "export default {{;");
    const list = new PackageList(join(data, "plugins.json"));
    list.add({ source: { kind: "path", path: a } }, data);
    const [item] = await loadPackages(list, data, join(data, "cache"), []);
    expect(item!.status).toBe("failed");
    expect(item!.error).toMatch(/Build failed/);
  });
  it("source packages provide real resources using only the public SDK without host-internal factories", async () => {
    const data = temp(); const root = temp();
    pkg(root, { id: "acme.sdk", runtime: "src/runtime.ts" }, `
      import { z } from "zod";
      import { pluginNamespace, defineCreation, defineAction } from "@asterism/sdk/contracts";
      import { definePlugin, defineModule, implementResource, implementCreation, implementAction } from "@asterism/sdk/runtime";
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
      expect(service.sessions.current(sessionId).workbench.objects[0]!.presentation).toEqual({
        contract: { id: "acme.sdk/view" }, data: "Hello",
      });
      const objectId = service.sessions.current(sessionId).workbench.objects[0]!.id;
      await service.sessions.execute({ type: "resource.command", sessionId, objectId,
        command: { id: "acme.sdk/rename", input: "Renamed" } });
      expect(service.sessions.current(sessionId).workbench.objects[0]!.presentation.data).toBe("Renamed");
    } finally { await service.close(); }
  });
});

// Symlink entry source paths resolve; CSS ownership still follows output entries so class names and url() remain valid after relocation.
it("registers independent styles, preserves CSS Module names and asset paths, and reads styles after cache reuse", async () => {
  const root = temp(), plain = temp(), other = temp(), broken = temp(), data = temp(), cache = join(data, "cache");
  pkg(root, { id: "acme.styled", renderer: "src/renderer.ts" });
  pkg(plain, { id: "acme.plain", renderer: "src/renderer.ts" });
  pkg(other, { id: "acme.other", renderer: "src/renderer.ts" });
  pkg(broken, { id: "acme.broken-style", renderer: "src/renderer.ts" });
  writeFileSync(join(root, "src/entry.ts"), 'import "./base.css"; export { default as styles } from "./panel.module.css"; export default {};');
  symlinkSync("entry.ts", join(root, "src/renderer.ts"));
  writeFileSync(join(plain, "src/renderer.ts"), "export default {};");
  writeFileSync(join(other, "src/renderer.ts"), 'export { default as styles } from "./panel.module.css"; export default {};');
  writeFileSync(join(other, "src/panel.module.css"), ".card { color: #abcdef; }");
  writeFileSync(join(broken, "src/renderer.ts"), 'import "./missing.css"; export default {};');
  writeFileSync(join(root, "src/base.css"), '@font-face { font-family: Example; src: url("./font.woff"); }');
  writeFileSync(join(root, "src/panel.module.css"), '.card { color: #123456; background-image: url("./image.webp"); }');
  writeFileSync(join(root, "src/font.woff"), "font-fixture");
  writeFileSync(join(root, "src/image.webp"), "image-fixture");
  const list = new PackageList(join(data, "plugins.json"));
  for (const path of [root, plain, other, broken]) list.add({ source: { kind: "path", path } }, data);
  const load = () => loadPackages(list, data, cache, []);
  const first = await load();
  expect(first.map(item => item.status)).toEqual(["loaded", "loaded", "loaded", "failed"]);
  expect(first[3]!.error).toContain("missing.css");
  expect(first[1]!.stylesheet).toBeUndefined();
  const stylesheet = join(cache, first[0]!.stylesheet!);
  const css = readFileSync(stylesheet, "utf8");
  const module = await import(pathToFileURL(join(cache, first[0]!.renderer!)).href) as { styles: { card: string } };
  const otherModule = await import(pathToFileURL(join(cache, first[2]!.renderer!)).href) as { styles: { card: string } };
  expect(otherModule.styles.card).not.toBe(module.styles.card);
  expect(readFileSync(join(cache, first[2]!.stylesheet!), "utf8")).toContain(`.${otherModule.styles.card}`);
  expect(module.styles.card).not.toBe("card");
  expect(css).toContain(`.${module.styles.card}`);
  expect(css).toContain("#123456");
  const assets = [...css.matchAll(/url\(["']?([^"')]+)["']?\)/gu)].map(match =>
    readFileSync(resolve(dirname(stylesheet), match[1]!), "utf8"));
  expect(assets.sort()).toEqual(["font-fixture", "image-fixture"]);
  list.remove(3);
  await load();
  const cached = await load();
  expect(cached.map(item => [item.renderer, item.stylesheet])).toEqual(first.slice(0, 3).map(item => [item.renderer, item.stylesheet]));
  writeFileSync(join(root, "src/panel.module.css"), ".card { color: #654321; }");
  const updated = await load();
  expect(updated[0]!.stylesheet).not.toBe(first[0]!.stylesheet);
  expect(readFileSync(join(cache, updated[0]!.stylesheet!), "utf8")).toContain("#654321");
});

function publicFixture() {
  const data = temp(), provider = temp(), consumer = temp();
  pkg(provider, { id: "acme.provider", runtime: "src/runtime.ts", renderer: "src/renderer.ts" }, `
    import { pluginNamespace } from "@asterism/sdk/contracts";
    import { Read, settings, Marker, events } from "./state.ts";
    export default { namespace: pluginNamespace("acme.provider"), version: "1",
      probe: { Read, settings, Marker, events }, modules: [{ setup(plugin) {
        events.push("provider"); settings.set("ready", 1);
        plugin.lifetime.defer(async () => { events.push("close-provider"); });
        return {};
      } }] };
  `);
  const info = JSON.parse(readFileSync(join(provider, "package.json"), "utf8"));
  writeFileSync(join(provider, "package.json"), JSON.stringify({ ...info, name: "@fixture/provider", exports: { "./public": "./src/public.ts" } }));
  writeFileSync(join(provider, "src/state.ts"), `
    import { defineTool } from "@asterism/sdk/contracts";
    import { z } from "zod";
    export const Read = defineTool({ id: "acme.provider/read", name: "read", description: "Read.", guidelines: [],
      argsSchema: z.null().describe("No arguments.") });
    export const settings = new Map();
    export const events = [];
    export class Marker {}
  `);
  writeFileSync(join(provider, "src/public.ts"), 'export { Read, settings, Marker, events } from "./state.ts";');
  writeFileSync(join(provider, "src/renderer.ts"), 'export { Read, settings, Marker } from "./state.ts"; export default { modules: [{ resources: [], cards: [], tools: [] }] };');
  pkg(consumer, { id: "acme.consumer", runtime: "src/runtime.ts", renderer: "src/renderer.ts" }, `
    import { pluginNamespace, defineImplementation } from "@asterism/sdk/contracts";
    import { implementTool } from "@asterism/sdk/runtime";
    import { z } from "zod";
    import { Read, settings, Marker, events } from "@fixture/provider/public";
    const ns = pluginNamespace("acme.consumer");
    const implementation = defineImplementation({ ...ns.data("read", z.null().describe("No result.")),
      resource: ns.resource("thing", z.object({})), tool: Read, targetSchema: z.null().describe("Whole resource."),
      effect: "read", execution: "parallel" });
    export default { namespace: ns, version: "1",
      probe: { Read, settings, Marker, events }, modules: [{ setup(plugin) {
        if (settings.get("ready") !== 1) throw new Error("Provider is not initialized.");
        events.push("consumer");
        plugin.lifetime.defer(async () => { events.push("close-consumer"); });
        return { tools: [implementTool(implementation, { async call() { return { kind: "succeeded", data: null }; } })] };
      } }] };
  `);
  const consumerInfo = JSON.parse(readFileSync(join(consumer, "package.json"), "utf8"));
  writeFileSync(join(consumer, "package.json"), JSON.stringify({ ...consumerInfo, name: "@fixture/consumer", peerDependencies: { ...consumerInfo.peerDependencies, "@fixture/provider": "*" } }));
  writeFileSync(join(consumer, "src/renderer.ts"), 'export { Read, settings, Marker } from "@fixture/provider/public"; export default { modules: [{ resources: [], cards: [], tools: [] }] };');
  const list = new PackageList(join(data, "plugins.json"));
  list.add({ source: { kind: "path", path: consumer } }, data);
  list.add({ source: { kind: "path", path: provider } }, data);
  return { data, provider, consumer, list, cache: join(data, "cache") };
}
type Probe = { Read: object; settings: Map<string, number>; Marker: new () => object; events: string[] };
describe("Public modules", () => {
  it("provider internal references, two consumers, and re-exports share real declarations, state, and class identity", async () => {
    const fixture = publicFixture(), second = temp();
    const metadata = JSON.parse(readFileSync(join(fixture.consumer, "package.json"), "utf8"));
    pkg(second, { ...metadata.asterism, id: "acme.second", renderer: undefined },
      readFileSync(join(fixture.consumer, "src/runtime.ts"), "utf8").replaceAll("acme.consumer", "acme.second"));
    writeFileSync(join(second, "package.json"), JSON.stringify({ ...metadata, name: "@fixture/second",
      asterism: { ...metadata.asterism, id: "acme.second", renderer: undefined } }));
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
  it("frontend artifacts share real exports while backend and frontend keep separate instances", async () => {
    const fixture = publicFixture();
    const packages = await loadPackages(fixture.list, fixture.data, fixture.cache, []);
    // Supply the frontend dependency table in an isolated test process to verify build artifacts directly without launching a GUI.
    const globals = globalThis as Record<string, unknown>, previous = globals.__asterismRendererModules;
    globals.__asterismRendererModules = { zod: await import("zod"), "@asterism/sdk/contracts": await import("@asterism/sdk/contracts") };
    try {
      const consumer = await import(pathToFileURL(join(fixture.cache, packages[0]!.renderer!)).href) as Probe;
      const provider = await import(pathToFileURL(join(fixture.cache, packages[1]!.renderer!)).href) as Probe;
      expect(consumer.Read).toBe(provider.Read);
      expect(consumer.settings).toBe(provider.settings);
      expect(new consumer.Marker()).toBeInstanceOf(provider.Marker);
      expect(consumer.Read).not.toBe((packages[0]!.definition as PluginDefinition & { probe: Probe }).probe.Read);
    } finally {
      if (previous === undefined) delete globals.__asterismRendererModules;
      else globals.__asterismRendererModules = previous;
    }
  });
  it("disabled providers explicitly block consumers while unrelated broken plugins preserve the public module graph", async () => {
    const fixture = publicFixture(), broken = temp();
    pkg(broken, { id: "acme.broken", runtime: "src/runtime.ts" }, "invalid }");
    fixture.list.add({ source: { kind: "path", path: broken } }, fixture.data);
    let packages = await loadPackages(fixture.list, fixture.data, fixture.cache, []);
    expect(packages.map(pkg => pkg.status)).toEqual(["loaded", "loaded", "failed"]);
    fixture.list.setEnabled(1, false);
    packages = await loadPackages(fixture.list, fixture.data, fixture.cache, []);
    expect(packages.map(pkg => pkg.status)).toEqual(["failed", "disabled", "failed"]);
    expect(packages[0]!.error).toEqual(expect.any(String));
  });
  it("re-exports outside plugin roots register indirect dependencies and broken providers do not disrupt unrelated plugins", async () => {
    const fixture = publicFixture(), outside = temp(), healthy = temp();
    const helper = join(outside, "helper.ts");
    writeFileSync(helper, 'export * from "@fixture/provider/public";');
    const source = join(fixture.consumer, "src/runtime.ts");
    writeFileSync(source, readFileSync(source, "utf8").replace('"@fixture/provider/public"', JSON.stringify(helper)));
    const metadata = JSON.parse(readFileSync(join(fixture.consumer, "package.json"), "utf8"));
    delete metadata.asterism.renderer;
    writeFileSync(join(fixture.consumer, "package.json"), JSON.stringify(metadata));
    pkg(healthy, { id: "acme.healthy", runtime: "src/runtime.ts" }, runtime("acme.healthy"));
    fixture.list.add({ source: { kind: "path", path: healthy } }, fixture.data);
    let packages = await loadPackages(fixture.list, fixture.data, fixture.cache, []);
    expect(packages[0]!.definition?.dependencies).toEqual(["acme.provider"]);
    writeFileSync(join(fixture.provider, "src/runtime.ts"), "invalid }");
    packages = await loadPackages(fixture.list, fixture.data, fixture.cache, []);
    expect(packages.map(pkg => pkg.status)).toEqual(["failed", "failed", "loaded"]);
  });
  it("frontend reverse imports do not create backend initialization cycles", async () => {
    const fixture = publicFixture();
    const consumer = JSON.parse(readFileSync(join(fixture.consumer, "package.json"), "utf8"));
    consumer.exports = { "./public": "./src/public.ts" };
    writeFileSync(join(fixture.consumer, "package.json"), JSON.stringify(consumer));
    writeFileSync(join(fixture.consumer, "src/public.ts"), "export const label = 'Consumer';");
    const provider = JSON.parse(readFileSync(join(fixture.provider, "package.json"), "utf8"));
    provider.peerDependencies = { ...provider.peerDependencies, "@fixture/consumer": "*" };
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
  it("disabled same-name packages do not affect enabled providers' valid private self-references", async () => {
    const fixture = publicFixture(), disabled = temp();
    const provider = JSON.parse(readFileSync(join(fixture.provider, "package.json"), "utf8"));
    provider.exports["./internal"] = "./src/state.ts";
    writeFileSync(join(fixture.provider, "package.json"), JSON.stringify(provider));
    const source = join(fixture.provider, "src/runtime.ts");
    writeFileSync(source, readFileSync(source, "utf8").replace('"./state.ts"', '"@fixture/provider/internal"'));
    writeFileSync(join(disabled, "package.json"), JSON.stringify({ ...provider, asterism: { id: "acme.disabled" } }));
    const list = new PackageList(join(fixture.data, "other-plugins.json"));
    list.add({ source: { kind: "path", path: disabled } }, fixture.data); list.setEnabled(0, false);
    list.add({ source: { kind: "path", path: fixture.consumer } }, fixture.data);
    list.add({ source: { kind: "path", path: fixture.provider } }, fixture.data);
    const packages = await loadPackages(list, fixture.data, fixture.cache, []);
    expect(packages.map(pkg => pkg.status)).toEqual(["disabled", "loaded", "loaded"]);
  });
});
