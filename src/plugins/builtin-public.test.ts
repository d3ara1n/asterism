import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { Agent, CreateAgent, SubmitAgentInput, builtin } from "@atelier/builtin-api/contracts";
import * as builtinRendererAPI from "@atelier/builtin-api/renderer";
import { resourceCall } from "@atelier/sdk/contracts";
import type { PluginDefinition } from "@atelier/sdk/runtime";
import { PackageList, loadPackages } from "./packages.ts";
import { ApplicationService } from "../runtime/service.ts";
import { bindPublicProvider } from "../shared/public-modules.ts";
import { builtinPublicModules, builtinPublicProvider } from "../builtin-public.ts";
import { loadPluginRenderers } from "../renderer/modules/plugins.ts";

const roots: string[] = [], release: (() => void)[] = [];
afterEach(() => { for (const close of release.splice(0).reverse()) close(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function temp() { const root = mkdtempSync(join(tmpdir(), "builtin-public-")); roots.push(root); return root; }
function file(root: string, path: string, content: string) { const destination = join(root, path); mkdirSync(join(destination, ".."), { recursive: true }); writeFileSync(destination, content); }
function fixture(ranges: (string | null)[] = ["^0.2.0", "~0.2.0"]) {
  const data = temp(), list = new PackageList(join(data, "plugins.json"));
  const consumers = ranges.map((range, index) => {
    const root = temp(), id = `fixture.consumer${index}`;
    file(root, "package.json", JSON.stringify({ name: `@fixture/consumer${index}`, version: "1.0.0",
      ...(range === null ? {} : { peerDependencies: { "@atelier/builtin-api": range } }),
      atelier: { id, api: { major: 8, minMinor: 3 }, runtime: "runtime.ts", renderer: "renderer.ts" } }));
    file(root, "public.ts", 'export { SubmitAgentInput } from "@atelier/builtin-api/contracts";');
    file(root, "runtime.ts", `
      import { pluginNamespace } from "@atelier/sdk/contracts";
      import { definePlugin, defineModule, implementPreparer } from "@atelier/sdk/runtime";
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
    file(root, "renderer.ts", 'export { SubmitAgentInput } from "./public.ts"; export default { resources: [], cards: [], tools: [] };');
    // 消费者的本地安装副本不能抢占应用已经加载的声明。
    file(root, "node_modules/@atelier/builtin-api/package.json", JSON.stringify({ name: "@atelier/builtin-api", version: "0.2.0", exports: { "./contracts": "./copy.js" } }));
    file(root, "node_modules/@atelier/builtin-api/copy.js", 'throw new Error("A private copy must not execute.");');
    list.add({ source: { kind: "path", path: root } }, data);
    return root;
  });
  release.push(bindPublicProvider("runtime", builtinPublicProvider, builtinPublicModules));
  const cache = join(data, "cache");
  return { data, list, cache, consumers, load: () => loadPackages(list, data, cache, [builtin.id], [builtinPublicProvider]) };
}
type Probe = { SubmitAgentInput: typeof SubmitAgentInput; calls: unknown[] };

describe("内置公共包", () => {
  // 依据公共契约真实实例与动作准备规则：同名副本不能绑定内置 Agent；re-export 和私有安装不得产生副本。
  it("内置声明与两个独立源码插件共享引用，并在真实 Agent 动作上执行外部准备", async () => {
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
      const before = service.sessions.snapshot(sessionId), objectId = before.workbench.objects[0]!.id;
      await expect(service.sessions.execute({ type: "resource.command", sessionId, objectId,
        command: resourceCall(SubmitAgentInput, { type: "submit", submissionId: crypto.randomUUID(), parts: [{ kind: "text", text: "Hello" }] }) }))
        .rejects.toThrow("Blocked by external preparer.");
      expect(probes.map(probe => probe.calls.length)).toEqual([1, 1]);
      expect(service.sessions.snapshot(sessionId).nodes).toEqual(before.nodes);
    } finally { await service.close(); }
    // 前端产物从其环境绑定取实例；刻意使用不同对象，防止误取后台绑定。
    const frontendAction = { ...SubmitAgentInput };
    release.push(bindPublicProvider("renderer", builtinPublicProvider, {
      "@atelier/builtin-api/contracts": { ...builtinPublicModules["@atelier/builtin-api/contracts"], SubmitAgentInput: frontendAction },
      "@atelier/builtin-api/renderer": builtinRendererAPI,
    }));
    for (const item of packages) {
      const frontend = await import(pathToFileURL(join(f.cache, item.renderer!)).href);
      expect(frontend.SubmitAgentInput).toBe(frontendAction);
      expect(frontend.SubmitAgentInput).not.toBe(SubmitAgentInput);
    }
  });
  // 依赖包名、版本范围和环境出口均是加载门禁；本地副本不能成为失败后的兜底。
  it("拒绝缺少依赖、不兼容版本和未公开入口，保留无关消费者", async () => {
    const f = fixture([null, "^0.3.0", "^0.2.0", "^0.2.0"]);
    file(f.consumers[2]!, "public.ts", 'export { SubmitAgentInput } from "@atelier/builtin-api/private";');
    const packages = await f.load();
    expect(packages.map(item => item.status)).toEqual(["failed", "failed", "failed", "loaded"]);
    expect(packages[0]!.error).toContain("must declare a dependency");
    expect(packages[1]!.error).toContain(`application provides ${builtinPublicProvider.version}`);
    expect(packages[2]!.error).toContain("not exported");
  });
  // Agent UI 只经前端公共出口加载；两个源码插件登记到内置实现所读的同一服务。
  it("前端消费者共享 Agent UI 服务，贡献跟随登记生命周期释放", async () => {
    const f = fixture(["^0.2.0", "^0.2.0"]);
    for (const [index, root] of f.consumers.entries()) {
      file(root, "renderer.ts", `
        import { agentUI, AgentOverlay } from "@atelier/builtin-api/renderer";
        import { createElement } from "react";
        export { agentUI, AgentOverlay };
        export default { resources: [], cards: [], tools: [], async prepare({ signal }) {
          agentUI.register({ id: "fixture.consumer${index}/panel",
            Component: () => createElement(AgentOverlay, { position: "bottom", hideComposer: true, children: "Question" })
          }, { signal });
        } };
      `);
    }
    const packages = await f.load();
    expect(packages.map(item => item.error)).toEqual([undefined, undefined]);
    release.push(bindPublicProvider("renderer", builtinPublicProvider, {
      ...builtinPublicModules, "@atelier/builtin-api/renderer": builtinRendererAPI,
    }));
    const loaded = await Promise.all(packages.map(item => import(pathToFileURL(join(f.cache, item.renderer!)).href)));
    expect(loaded.every(module => module.agentUI === builtinRendererAPI.agentUI && module.AgentOverlay === builtinRendererAPI.AgentOverlay)).toBe(true);
    const lifetime = new AbortController();
    try {
      for (const module of loaded) await module.default.prepare({ signal: lifetime.signal });
      expect(builtinRendererAPI.agentUI.getSnapshot().map(entry => entry.id)).toEqual(["fixture.consumer0/panel", "fixture.consumer1/panel"]);
    } finally { lifetime.abort(); }
    expect(builtinRendererAPI.agentUI.getSnapshot()).toEqual([]);
  });

  // 公共前端服务不能进入后台模块图，避免 React/界面状态跨环境混用。
  it("后台消费者不能导入 Agent UI 前端出口", async () => {
    const f = fixture(["^0.2.0"]);
    file(f.consumers[0]!, "runtime.ts", 'import { agentUI } from "@atelier/builtin-api/renderer"; export default agentUI;');
    const [item] = await f.load();
    expect(item!.status).toBe("failed");
    expect(item!.error).toContain("not exported");
  });
  // 中间库没有 atelier 清单；校验它自己的 npm 依赖，运行依赖仍归实际消费者插件。
  it.each(["nested", "symlink"] as const)("独立中间 npm 包的 %s 导入按包归属校验版本", async mode => {
    const f = fixture([null, "^0.2.0"]);
    for (const [index, root] of f.consumers.entries()) {
      const metadata = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
      metadata.dependencies = { "@fixture/helper": "1.0.0" };
      file(root, "package.json", JSON.stringify(metadata));
      const helper = mode === "nested" ? join(root, "node_modules/@fixture/helper") : temp();
      file(helper, "package.json", JSON.stringify({ name: "@fixture/helper", version: "1.0.0", type: "module",
        exports: "./index.js", peerDependencies: { "@atelier/builtin-api": index === 0 ? "^0.2.0" : "^0.3.0" } }));
      file(helper, "index.js", 'export { SubmitAgentInput } from "@atelier/builtin-api/contracts";');
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
    expect(incompatible!.error).toContain("Package @fixture/helper requires @atelier/builtin-api ^0.3.0");
  });
  // 声明导入成功不等于实现可用；缺失或 setup 失败都必须沿实际实现依赖传播。
  it("实现提供方 setup 失败时消费者不初始化", async () => {
    const f = fixture(["^0.2.0"]), [consumer] = await f.load();
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
  // 前端构建成功后，提供方视图仍可能冲突；消费者不得越过失败提供方装配。
  it("前端按依赖顺序装配并传播视图登记失败", async () => {
    const seen: string[] = [];
    const result = await loadPluginRenderers([
      { id: "consumer", renderer: "consumer", dependencies: ["provider"] },
      { id: "provider", renderer: "provider", dependencies: [builtin.id] },
      { id: "other", renderer: "other", dependencies: [] },
    ], { available: [builtin.id], load: async path => {
      seen.push(path); return { default: { resources: [], cards: [], tools: [], marker: path } };
    }, accept: module => { if ((module as unknown as { marker: string }).marker === "provider") throw new Error("Conflicting view."); } });
    expect(seen).toEqual(["provider", "other"]);
    expect(result.failures.map(item => item.id)).toEqual(["provider", "consumer"]);
    expect(result.modules).toHaveLength(1);
  });
});
