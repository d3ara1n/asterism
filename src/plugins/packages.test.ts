import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PackageList, loadPackages, readManifest } from "./packages.ts";

const roots: string[] = [];
afterEach(() => { for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true }); });
function temp() { const r = mkdtempSync(join(tmpdir(), "plugin-pkg-")); roots.push(r); return r; }
function pkg(root: string, atelier: unknown, source?: string) {
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "x", atelier }));
  if (source) writeFileSync(join(root, "src", "runtime.ts"), source);
}
const runtime = (id: string) => `import { pluginNamespace } from "@atelier/sdk/contracts";
const ns: { id: string } = pluginNamespace(${JSON.stringify(id)});
export default { namespace: ns, version: "0.0.1", modules: [] };`;

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
});
