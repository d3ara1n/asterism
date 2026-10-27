import { nanoid } from "nanoid";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { Agent, CreateAgent, SubmitAgentInput, builtin } from "@asterism/builtin-api/contracts";
import * as builtinRendererAPI from "@asterism/builtin-api/renderer";
import { agentCreations, defineAgentCreation } from "@asterism/builtin-api/runtime";
import { resourceCall } from "@asterism/sdk/contracts";
import type { PluginDefinition } from "@asterism/sdk/runtime";
import sdkMetadata from "@asterism/sdk/package.json" with { type: "json" };
import { PackageList, loadPackages } from "./packages.ts";
import { ApplicationService } from "../runtime/service.ts";
import { bindPublicProvider } from "../shared/public-modules.ts";
import { builtinPublicModules, builtinPublicProvider } from "../builtin-public.ts";
import { builtinRuntimePublicModules } from "../builtin-runtime-public.ts";
import { loadPluginRenderers } from "../renderer/modules/plugins.ts";

const roots: string[] = [], release: (() => void)[] = [];
const compatibleRange = `^${builtinPublicProvider.version}`;
const incompatibleRange = `<${builtinPublicProvider.version}`;
afterEach(() => { for (const close of release.splice(0).reverse()) close(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function temp() { const root = mkdtempSync(join(tmpdir(), "builtin-public-")); roots.push(root); return root; }
function file(root: string, path: string, content: string) { const destination = join(root, path); mkdirSync(join(destination, ".."), { recursive: true }); writeFileSync(destination, content); }
function fixture(ranges: (string | null)[] = [compatibleRange, `~${builtinPublicProvider.version}`]) {
  const data = temp(), list = new PackageList(join(data, "plugins.json"));
  const consumers = ranges.map((range, index) => {
    const root = temp(), id = `fixture.consumer${index}`;
    file(root, "package.json", JSON.stringify({ name: `@fixture/consumer${index}`, version: "1.0.0",
      peerDependencies: { "@asterism/sdk": `^${sdkMetadata.version}`, ...(range === null ? {} : { "@asterism/builtin-api": range }) },
      asterism: { id, runtime: "runtime.ts", renderer: "renderer.ts" } }));
    file(root, "public.ts", 'export { SubmitAgentInput } from "@asterism/builtin-api/contracts";');
    file(root, "runtime.ts", `
      import { pluginNamespace } from "@asterism/sdk/contracts";
      import { definePlugin, defineModule, implementPreparer } from "@asterism/sdk/runtime";
      import { SubmitAgentInput } from "./public.ts";
      const calls = [];
      export default { ...definePlugin({ namespace: pluginNamespace(${JSON.stringify(id)}), version: "1.0.0",
        modules: [defineModule(() => ({ preparers: [implementPreparer(SubmitAgentInput, {
          id: "input", prepare(input, context) {
            calls.push({ input, resource: context.object.ref });
            return ${index === 1 ? '{ action: "reject", code: "blocked", message: "Blocked by external preparer." }' : '{ action: "accept" }'};
          }
        })] }))] }), probe: { SubmitAgentInput, calls } };
    `);
    file(root, "renderer.ts", 'export { SubmitAgentInput } from "./public.ts"; export default { modules: [{ resources: [], cards: [], tools: [] }] };');
    // A consumer's local installation copy must not displace declarations already loaded by the app.
    file(root, "node_modules/@asterism/builtin-api/package.json", JSON.stringify({ name: "@asterism/builtin-api", version: builtinPublicProvider.version, exports: { "./contracts": "./copy.js" } }));
    file(root, "node_modules/@asterism/builtin-api/copy.js", 'throw new Error("A private copy must not execute.");');
    list.add({ source: { kind: "path", path: root } }, data);
    return root;
  });
  release.push(bindPublicProvider("runtime", builtinPublicProvider, builtinRuntimePublicModules));
  const cache = join(data, "cache");
  return { data, list, cache, consumers, load: () => loadPackages(list, data, cache, [builtin.id], [builtinPublicProvider]) };
}
type Probe = { SubmitAgentInput: typeof SubmitAgentInput; calls: unknown[] };

describe("Built-in public packages", () => {
  // Backend creation entry services must share exported instances with built-in implementations rather than using consumer-private installations.
  it("independent plugins obtain the same creation declarations and catalog services from backend public entries", async () => {
    const f = fixture([compatibleRange]);
    file(f.consumers[0]!, "runtime.ts", `
      import { agentCreations, defineAgentCreation } from "@asterism/builtin-api/runtime";
      import { pluginNamespace } from "@asterism/sdk/contracts";
      import { definePlugin } from "@asterism/sdk/runtime";
      export default { ...definePlugin({ namespace: pluginNamespace("fixture.consumer0"), version: "1" }),
        probe: { agentCreations, defineAgentCreation } };
    `);
    const [loaded] = await f.load();
    expect(loaded?.error).toBeUndefined();
    const probe = (loaded!.definition as PluginDefinition & { probe: { agentCreations: unknown; defineAgentCreation: unknown } }).probe;
    expect(probe.agentCreations).toBe(agentCreations);
    expect(probe.defineAgentCreation).toBe(defineAgentCreation);
    file(f.consumers[0]!, "renderer.ts", 'import { agentCreations } from "@asterism/builtin-api/runtime"; export default agentCreations;');
    expect((await f.load())[0]?.error).toContain("not exported");
  });

  // Based on real public contract instances and action preparation rules: same-name copies cannot bind built-in Agents; re-exports and private installs must not create copies.
  it("built-in declarations share references with two independent source plugins and run external preparation on real Agent actions", async () => {
    const f = fixture();
    const packages = await f.load();
    expect(packages.map(item => item.error)).toEqual([undefined, undefined]);
    const probes = packages.map(item => (item.definition as PluginDefinition & { probe: Probe }).probe);
    for (const [index, probe] of probes.entries()) {
      expect(probe.SubmitAgentInput).toBe(SubmitAgentInput);
      expect(packages[index]!.definition!.dependencies).toEqual([builtin.id]);
    }
    const service = new ApplicationService(f.data, { plugins: packages.map(item => item.definition!) });
    try {
      expect(service.sessions.plugins.every(item => item.status === "loaded")).toBe(true);
      const sessionId = service.sessions.tree.create("Public API");
      await service.sessions.execute({ type: "resource.create", sessionId, kind: Agent.kind, creation: { id: CreateAgent.id },
        input: { selection: { agent: "worker", model: null, thinking: null } }, position: { x: 0, y: 0 } });
      const before = service.sessions.current(sessionId), objectId = before.workbench.objects[0]!.id;
      await expect(service.sessions.execute({ type: "resource.command", sessionId, objectId,
        command: resourceCall(SubmitAgentInput, { mode: "follow", submissionId: nanoid(16), parts: [{ kind: "text", text: "Hello" }] }) }))
        .rejects.toThrow("Blocked by external preparer.");
      expect(probes.map(probe => probe.calls.length)).toEqual([1, 1]);
      expect(service.sessions.current(sessionId).nodes).toEqual(before.nodes);
    } finally { await service.close(); }
    // Frontend artifacts obtain instances from their environment bindings; deliberately distinct objects catch accidental backend binding use.
    const frontendAction = { ...SubmitAgentInput };
    release.push(bindPublicProvider("renderer", builtinPublicProvider, {
      "@asterism/builtin-api/contracts": { ...builtinPublicModules["@asterism/builtin-api/contracts"], SubmitAgentInput: frontendAction },
      "@asterism/builtin-api/renderer": builtinRendererAPI,
    }));
    for (const item of packages) {
      const frontend = await import(pathToFileURL(join(f.cache, item.renderer!)).href);
      expect(frontend.SubmitAgentInput).toBe(frontendAction);
      expect(frontend.SubmitAgentInput).not.toBe(SubmitAgentInput);
    }
  });
  // Dependency package names, version ranges, and environment exports are loading gates; local copies cannot serve as fallbacks after failure.
  it("rejects missing dependencies, incompatible versions, and private entries while retaining unrelated consumers", async () => {
    const f = fixture([null, incompatibleRange, compatibleRange, compatibleRange]);
    file(f.consumers[2]!, "public.ts", 'export { SubmitAgentInput } from "@asterism/builtin-api/private";');
    const packages = await f.load();
    expect(packages.map(item => item.status)).toEqual(["failed", "failed", "failed", "loaded"]);
    expect(packages[0]!.error).toContain("must declare a dependency");
    expect(packages[1]!.error).toContain(`application provides ${builtinPublicProvider.version}`);
    expect(packages[2]!.error).toContain("not exported");
  });
  // Agent UI loads only through frontend public exports; two source plugins register with the same service consumed by built-in implementations.
  it("frontend consumers share Agent UI services and release contributions with registration lifetime", async () => {
    const f = fixture([compatibleRange, compatibleRange]);
    for (const [index, root] of f.consumers.entries()) {
      file(root, "renderer.ts", `
        import { agentUI, AgentOverlay, AgentScrollArea, AgentToolbarItem, useAgentModelSelection } from "@asterism/builtin-api/renderer";
        import { createElement } from "react";
        export { agentUI, AgentOverlay, AgentScrollArea, AgentToolbarItem, useAgentModelSelection };
        export default { modules: [{ resources: [], cards: [], tools: [] }], async prepare({ signal }) {
          agentUI.register({ id: "fixture.consumer${index}/panel",
            Component: () => createElement(AgentOverlay, { position: "bottom", hideComposer: true,
              children: createElement(AgentScrollArea, { style: { maxHeight: "16rem" }, children: "Question" }) })
          }, { signal });
        } };
      `);
    }
    const packages = await f.load();
    expect(packages.map(item => item.error)).toEqual([undefined, undefined]);
    release.push(bindPublicProvider("renderer", builtinPublicProvider, {
      ...builtinPublicModules, "@asterism/builtin-api/renderer": builtinRendererAPI,
    }));
    const loaded = await Promise.all(packages.map(item => import(pathToFileURL(join(f.cache, item.renderer!)).href)));
    expect(loaded.every(module => module.agentUI === builtinRendererAPI.agentUI
      && module.AgentOverlay === builtinRendererAPI.AgentOverlay
      && module.AgentScrollArea === builtinRendererAPI.AgentScrollArea
      && module.AgentToolbarItem === builtinRendererAPI.AgentToolbarItem
      && module.useAgentModelSelection === builtinRendererAPI.useAgentModelSelection)).toBe(true);
    const lifetime = new AbortController();
    try {
      for (const module of loaded) await module.default.prepare({ signal: lifetime.signal });
      expect(builtinRendererAPI.agentUI.getSnapshot().map(entry => entry.id)).toEqual(["fixture.consumer0/panel", "fixture.consumer1/panel"]);
    } finally { lifetime.abort(); }
    expect(builtinRendererAPI.agentUI.getSnapshot()).toEqual([]);
  });

  // Public frontend services must not enter backend module graphs, preventing React/UI state from mixing across environments.
  it("backend consumers cannot import Agent UI frontend exports", async () => {
    const f = fixture([compatibleRange]);
    file(f.consumers[0]!, "runtime.ts", 'import { agentUI } from "@asterism/builtin-api/renderer"; export default agentUI;');
    const [item] = await f.load();
    expect(item!.status).toBe("failed");
    expect(item!.error).toContain("not exported");
  });
  // Intermediate libraries lack asterism manifests; validate their own npm dependencies while runtime dependencies remain with actual consumer plugins.
  it.each(["nested", "symlink"] as const)("independent intermediate npm packages validate versions for %s imports by package ownership", async mode => {
    const f = fixture([null, compatibleRange]);
    for (const [index, root] of f.consumers.entries()) {
      const metadata = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
      metadata.dependencies = { "@fixture/helper": "1.0.0" };
      file(root, "package.json", JSON.stringify(metadata));
      const helper = mode === "nested" ? join(root, "node_modules/@fixture/helper") : temp();
      file(helper, "package.json", JSON.stringify({ name: "@fixture/helper", version: "1.0.0", type: "module",
        exports: "./index.js", peerDependencies: { "@asterism/builtin-api": index === 0 ? compatibleRange : incompatibleRange } }));
      file(helper, "index.js", 'export { SubmitAgentInput } from "@asterism/builtin-api/contracts";');
      if (mode === "symlink") {
        mkdirSync(join(root, "node_modules/@fixture"), { recursive: true });
        symlinkSync(helper, join(root, "node_modules/@fixture/helper"), "dir");
      }
      file(root, "public.ts", 'export { SubmitAgentInput } from "@fixture/helper";');
    }
    const [compatible, incompatible] = await f.load();
    expect(compatible!.status, compatible!.error).toBe("loaded");
    expect(compatible!.definition!.dependencies).toEqual([builtin.id]);
    expect((compatible!.definition as PluginDefinition & { probe: Probe }).probe.SubmitAgentInput).toBe(SubmitAgentInput);
    expect(incompatible!.status).toBe("failed");
    expect(incompatible!.error).toContain(`Package @fixture/helper requires @asterism/builtin-api ${incompatibleRange}`);
  });
  // Importing declarations successfully does not imply implementation availability; missing or failed setup propagates along actual implementation dependencies.
  it("consumers do not initialize when implementation provider setup fails", async () => {
    const f = fixture([compatibleRange]), [consumer] = await f.load();
    const { loadPlugins } = await import("./loader.ts");
    const { SessionDataStore } = await import("../session/data.ts");
    const { openDatabase } = await import("../runtime/storage.ts");
    const db = openDatabase(f.data);
    const failed: PluginDefinition = { namespace: builtin, version: "0.2.0", modules: [{ setup() { throw new Error("Provider setup failed."); } }] };
    const loaded = loadPlugins([consumer!.definition!, failed], {
      extensionsDirectory: join(f.data, "extensions"), data: new SessionDataStore(db), refOf: () => null,
      sessions: {} as never, models: {} as never, log() {},
    });
    try { expect(loaded.manifest.map(item => item.status)).toEqual(["failed", "failed"]); }
    finally { await loaded.close(); db.close(); }
  });
  // Provider views may conflict even after frontend builds succeed; consumers must not assemble past failed providers.
  it("frontend assembly follows dependency order and propagates view registration failure", async () => {
    const seen: string[] = [];
    const result = await loadPluginRenderers([
      { id: "consumer", renderer: "consumer", dependencies: ["provider"] },
      { id: "provider", renderer: "provider", dependencies: [builtin.id] },
      { id: "other", renderer: "other", dependencies: [] },
    ], { available: [builtin.id], load: async path => {
      seen.push(path); return { default: { modules: [{ resources: [], cards: [], tools: [] }], marker: path } };
    }, accept: module => { if ((module as unknown as { marker: string }).marker === "provider") throw new Error("Conflicting view."); } });
    expect(seen).toEqual(["provider", "other"]);
    expect(result.failures.map(item => item.id)).toEqual(["provider", "consumer"]);
    expect(result.modules).toHaveLength(1);
  });
});
