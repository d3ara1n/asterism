import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PackageList, loadPackages, readManifest } from "./packages.ts";
import { ApplicationService } from "../runtime/service.ts";

const roots: string[] = [];
afterEach(() => { for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true }); });
function temp() { const r = mkdtempSync(join(tmpdir(), "plugin-pkg-")); roots.push(r); return r; }
function pkg(root: string, atelier: unknown, source?: string) {
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "x", atelier }));
  if (source) writeFileSync(join(root, "src", "runtime.ts"), source);
}
const runtime = (id: string) => `import { pluginNamespace } from "@atelier/sdk/contracts";
import { definePlugin, defineModule } from "@atelier/sdk/runtime";
const ns: { id: string } = pluginNamespace(${JSON.stringify(id)});
export default definePlugin({ namespace: ns, version: "0.0.1", modules: [defineModule(() => ({}))] });`;

describe("插件包", () => {
  it("只认包根：无清单的目录添加失败且不留条目", () => {
    const data = temp(); const dir = temp();
    const list = new PackageList(join(data, "plugins.json"));
    expect(() => list.add({ source: { kind: "path", path: dir } }, data)).toThrow(/No package.json/);
    pkg(dir, { id: "acme.x" });
    expect(() => list.add({ source: { kind: "path", path: dir } }, data)).toThrow(/atelier.api/);
    expect(list.read()).toEqual([]);
  });
  it("不兼容的 API 主版本被拒绝", () => {
    const dir = temp(); pkg(dir, { id: "acme.x", api: { major: 2, minMinor: 0 } });
    expect(() => readManifest(dir)).toThrow(/requires SDK API 2.0/);
  });
  it("源码包经 esbuild 打包导入，SDK 解析到宿主实例；禁用与重复 ID 不加载", async () => {
    const data = temp(); const a = temp(); const b = temp(); const c = temp();
    pkg(a, { id: "acme.a", api: { major: 1, minMinor: 0 }, runtime: "src/runtime.ts" }, runtime("acme.a"));
    pkg(b, { id: "acme.b", api: { major: 1, minMinor: 0 }, runtime: "src/runtime.ts" }, runtime("acme.b"));
    pkg(c, { id: "acme.b", api: { major: 1, minMinor: 0 }, runtime: "src/runtime.ts" }, runtime("acme.b"));
    const list = new PackageList(join(data, "plugins.json"));
    list.add({ source: { kind: "path", path: a } }, data);
    list.add({ source: { kind: "path", path: b } }, data);
    expect(() => list.add({ source: { kind: "path", path: c } }, data)).toThrow(/already added/);
    list.setEnabled(1, false);
    const loaded = await loadPackages(list, data, join(data, "cache"), ["atelier.core"]);
    expect(loaded.map(item => [item.manifest?.id, item.status])).toEqual([["acme.a", "loaded"], ["acme.b", "disabled"]]);
    expect(loaded[0]!.definition?.namespace.id).toBe("acme.a");
  });
  it("构建失败只标记该包", async () => {
    const data = temp(); const a = temp();
    pkg(a, { id: "acme.a", api: { major: 1, minMinor: 0 }, runtime: "src/runtime.ts" }, "export default {{;");
    const list = new PackageList(join(data, "plugins.json"));
    list.add({ source: { kind: "path", path: a } }, data);
    const [item] = await loadPackages(list, data, join(data, "cache"), []);
    expect(item!.status).toBe("failed");
    expect(item!.error).toMatch(/failed to build/);
  });
  it("源码包仅引入公开 SDK 即可提供真实资源，不需要宿主内部工厂", async () => {
    const data = temp(); const root = temp();
    pkg(root, { id: "acme.sdk", api: { major: 1, minMinor: 0 }, runtime: "src/runtime.ts" }, `
      import { z } from "zod";
      import { pluginNamespace } from "@atelier/sdk/contracts";
      import { definePlugin, defineModule, implementResource } from "@atelier/sdk/runtime";
      const ns = pluginNamespace("acme.sdk");
      const resource = ns.resource("label", z.object({ label: z.string() }));
      export default definePlugin({ namespace: ns, version: "1", modules: [defineModule(() => ({
        resources: [implementResource(resource, ns.data("view", 1, z.string()), {
          creation: { schema: z.string(), create: label => ({ title: label, data: { label } }) },
          project: data => data.label, inspect: async data => data,
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
      await service.sessions.execute({ type: "resource.create", sessionId, kind: "acme.sdk/label", input: "Hello", position: { x: 0, y: 0 } });
      expect(service.sessions.snapshot(sessionId).workbench.objects[0]!.presentation).toEqual({
        contract: { id: "acme.sdk/view", version: 1 }, data: "Hello",
      });
    } finally { await service.close(); }
  });
});
