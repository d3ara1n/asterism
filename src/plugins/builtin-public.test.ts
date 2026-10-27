import { nanoid } from "nanoid";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { Agent, CreateAgent, SubmitAgentInput, builtin } from "@asterism-app/builtin-api/contracts";
import * as builtinRendererAPI from "@asterism-app/builtin-api/renderer";
import { agentCreations, defineAgentCreation } from "@asterism-app/builtin-api/runtime";
import { resourceCall } from "@asterism-app/sdk/contracts";
import type { PluginDefinition } from "@asterism-app/sdk/runtime";
import sdkMetadata from "@asterism-app/sdk/package.json" with { type: "json" };
import { PackageList, loadPackages } from "./packages.ts";
import { ApplicationService } from "../runtime/service.ts";
import { bindPublicProvider } from "../shared/public-modules.ts";
import { builtinPublicModules, builtinPublicProvider } from "../builtin-public.ts";
import { builtinRuntimePublicModules } from "../builtin-runtime-public.ts";
import builtinApiMetadata from "../../packages/builtin-api/package.json" with { type: "json" };
import { loadPluginRenderers } from "../renderer/modules/plugins.ts";

const roots: string[] = [], release: (() => void)[] = [];
const currentRange = `^${builtinApiMetadata.version}`;
const olderRange = `<${builtinApiMetadata.version}`;
afterEach(() => { for (const close of release.splice(0).reverse()) close(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function temp() { const root = mkdtempSync(join(tmpdir(), "builtin-public-")); roots.push(root); return root; }
function file(root: string, path: string, content: string) { const destination = join(root, path); mkdirSync(join(destination, ".."), { recursive: true }); writeFileSync(destination, content); }
function fixture(ranges: (string | null)[] = [currentRange, `~${builtinApiMetadata.version}`]) {
  const data = temp(), list = new PackageList(join(data, "plugins.json"));
  const consumers = ranges.map((range, index) => {
    const root = temp(), id = `fixture.consumer${index}`;
    file(root, "package.json", JSON.stringify({ name: `@fixture/consumer${index}`, version: "1.0.0",
      peerDependencies: { "@asterism-app/sdk": `^${sdkMetadata.version}`, ...(range === null ? {} : { "@asterism-app/builtin-api": range }) },
      asterism: { id, runtime: "runtime.ts", renderer: "renderer.ts" } }));
    file(root, "public.ts", 'export { SubmitAgentInput } from "@asterism-app/builtin-api/contracts";');
    file(root, "runtime.ts", `
      import { pluginNamespace } from "@asterism-app/sdk/contracts";
      import { definePlugin, defineModule, implementPreparer } from "@asterism-app/sdk/runtime";
      import { SubmitAgentInput } from "./public.ts";
      const calls = [];
      export default { ...definePlugin({ namespace: pluginNamespace(${JSON.stringify(id)}),
        modules: [defineModule(() => ({ preparers: [implementPreparer(SubmitAgentInput, {
          id: "input", prepare(input, context) {
            calls.push({ input, resource: context.object.ref });
            return ${index === 1 ? '{ action: "reject", code: "blocked", message: "Blocked by external preparer." }' : '{ action: "accept" }'};
          }
        })] }))] }), probe: { SubmitAgentInput, calls } };
    `);
    file(root, "renderer.ts", 'export { SubmitAgentInput } from "./public.ts"; export default { modules: [{ resources: [], cards: [], tools: [] }] };');
    // A consumer's local installation copy must not displace declarations already loaded by the app.
    file(root, "node_modules/@asterism-app/builtin-api/package.json", JSON.stringify({ name: "@asterism-app/builtin-api", version: "0.0.0", exports: { "./contracts": "./copy.js" } }));
    file(root, "node_modules/@asterism-app/builtin-api/copy.js", 'throw new Error("A private copy must not execute.");');
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
    const f = fixture([currentRange]);
    file(f.consumers[0]!, "runtime.ts", `
      import { agentCreations, defineAgentCreation } from "@asterism-app/builtin-api/runtime";
      import { pluginNamespace } from "@asterism-app/sdk/contracts";
      import { definePlugin } from "@asterism-app/sdk/runtime";
      export default { ...definePlugin({ namespace: pluginNamespace("fixture.consumer0") }),
        probe: { agentCreations, defineAgentCreation } };
    `);
    const [loaded] = await f.load();
    expect(loaded?.error).toBeUndefined();
    const probe = (loaded!.definition as PluginDefinition & { probe: { agentCreations: unknown; defineAgentCreation: unknown } }).probe;
    expect(probe.agentCreations).toBe(agentCreations);
    expect(probe.defineAgentCreation).toBe(defineAgentCreation);
    file(f.consumers[0]!, "renderer.ts", 'import { agentCreations } from "@asterism-app/builtin-api/runtime"; export default agentCreations;');
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
      expect(packages[index]!.runtimeDependencies).toEqual([builtin.id]);
    }
    const service = new ApplicationService(f.data, { plugins: packages.map(item => item.definition!),
      pluginDependencies: new Map(packages.map(item => [item.manifest!.id, item.runtimeDependencies ?? []])) });
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
      "@asterism-app/builtin-api/contracts": { ...builtinPublicModules["@asterism-app/builtin-api/contracts"], SubmitAgentInput: frontendAction },
      "@asterism-app/builtin-api/renderer": builtinRendererAPI,
    }));
    for (const item of packages) {
      const frontend = await import(pathToFileURL(join(f.cache, item.renderer!)).href);
      expect(frontend.SubmitAgentInput).toBe(frontendAction);
      expect(frontend.SubmitAgentInput).not.toBe(SubmitAgentInput);
    }
  });
  // Public bindings follow actual exports, independently of peer ranges; private entries remain unavailable.
  it("loads available APIs despite absent or older peer ranges and rejects private entries", async () => {
    const f = fixture([null, olderRange, currentRange, currentRange]);
    file(f.consumers[2]!, "public.ts", 'export { SubmitAgentInput } from "@asterism-app/builtin-api/private";');
    const packages = await f.load();
    expect(packages.map(item => item.status)).toEqual(["loaded", "loaded", "failed", "loaded"]);
    for (const index of [0, 1, 3])
      expect((packages[index]!.definition as PluginDefinition & { probe: Probe }).probe.SubmitAgentInput).toBe(SubmitAgentInput);
    expect(packages[2]!.error).toContain("not exported");
  });
  // Agent UI loads only through frontend public exports; two source plugins register with the same service consumed by built-in implementations.
  it("frontend consumers share Agent UI services and release contributions with registration lifetime", async () => {
    const f = fixture([currentRange, currentRange]);
    for (const [index, root] of f.consumers.entries()) {
      file(root, "renderer.ts", `
        import { agentUI, AgentOverlay, AgentScrollArea, AgentToolbarItem, useAgentModelSelection } from "@asterism-app/builtin-api/renderer";
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
      ...builtinPublicModules, "@asterism-app/builtin-api/renderer": builtinRendererAPI,
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
    const f = fixture([currentRange]);
    file(f.consumers[0]!, "runtime.ts", 'import { agentUI } from "@asterism-app/builtin-api/renderer"; export default agentUI;');
    const [item] = await f.load();
    expect(item!.status).toBe("failed");
    expect(item!.error).toContain("not exported");
  });
  // Intermediate libraries participate in the same host binding, while lifecycle dependencies remain with their consumer plugins.
  it.each(["nested", "symlink"] as const)("independent %s npm helpers share host declarations regardless of peer ranges", async mode => {
    const f = fixture([null, currentRange]);
    for (const [index, root] of f.consumers.entries()) {
      const metadata = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
      metadata.dependencies = { "@fixture/helper": "1.0.0" };
      file(root, "package.json", JSON.stringify(metadata));
      const helper = mode === "nested" ? join(root, "node_modules/@fixture/helper") : temp();
      file(helper, "package.json", JSON.stringify({ name: "@fixture/helper", version: "1.0.0", type: "module",
        exports: "./index.js", peerDependencies: { "@asterism-app/builtin-api": index === 0 ? currentRange : olderRange } }));
      file(helper, "index.js", 'export { SubmitAgentInput } from "@asterism-app/builtin-api/contracts";');
      if (mode === "symlink") {
        mkdirSync(join(root, "node_modules/@fixture"), { recursive: true });
        symlinkSync(helper, join(root, "node_modules/@fixture/helper"), "dir");
      }
      file(root, "public.ts", 'export { SubmitAgentInput } from "@fixture/helper";');
    }
    for (const item of await f.load()) {
      expect(item.status, item.error).toBe("loaded");
      expect(item.runtimeDependencies).toEqual([builtin.id]);
      expect((item.definition as PluginDefinition & { probe: Probe }).probe.SubmitAgentInput).toBe(SubmitAgentInput);
    }
  });
  // Importing declarations successfully does not imply implementation availability; missing or failed setup propagates along actual implementation dependencies.
  it("consumers do not initialize when implementation provider setup fails", async () => {
    const f = fixture([currentRange]), [consumer] = await f.load();
    const { loadPlugins } = await import("./loader.ts");
    const { SessionDataStore } = await import("../session/data.ts");
    const { openDatabase } = await import("../runtime/storage.ts");
    const db = openDatabase(f.data);
    const failed: PluginDefinition = { namespace: builtin, modules: [{ setup() { throw new Error("Provider setup failed."); } }] };
    const loaded = loadPlugins([consumer!.definition!, failed], {
      pluginDependencies: new Map([[consumer!.manifest!.id, consumer!.runtimeDependencies ?? []]]),
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
