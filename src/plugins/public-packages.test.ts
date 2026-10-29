import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import type { PluginDefinition } from "@asterism-app/sdk/runtime";
import { PackageList, loadPackages } from "./packages.ts";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function directory() { const root = mkdtempSync(join(tmpdir(), "asterism-public-")); roots.push(root); return root; }
function file(root: string, path: string, content: string) {
  const target = join(root, path);
  mkdirSync(join(target, ".."), { recursive: true });
  writeFileSync(target, content);
}
function fixture() {
  const data = directory(), provider = directory(), consumers = [directory(), directory()];
  const list = new PackageList(join(data, "plugins.json")), cache = join(data, "cache");
  file(provider, "package.json", JSON.stringify({ name: "@example/provider", type: "module",
    asterism: { displayName: "Test plugin", id: "example.provider", runtime: "runtime.ts", renderer: "renderer.ts", publicPackages: ["@example/paradigm"] } }));
  file(provider, "node_modules/@example/paradigm/package.json", JSON.stringify({
    name: "@example/paradigm", type: "module", exports: { "./contracts": "./contracts.js" },
  }));
  file(provider, "node_modules/@example/paradigm/contracts.js", "export const registry = new Set();");
  for (const [index, root] of [provider, ...consumers].entries()) {
    const id = index ? `example.consumer${index}` : "example.provider";
    if (index) {
      file(root, "package.json", JSON.stringify({ name: `@example/consumer${index}`, type: "module",
        asterism: { displayName: "Test plugin", id, runtime: "runtime.ts", renderer: "renderer.ts" } }));
      file(root, "node_modules/@example/paradigm/package.json", JSON.stringify({
        name: "@example/paradigm", type: "module", exports: { "./contracts": "./private.js" },
      }));
      file(root, "node_modules/@example/paradigm/private.js", 'throw new Error("A private copy must not replace the provider API.");');
    }
    file(root, "runtime.ts", `
      import { pluginNamespace } from "@asterism-app/sdk/contracts";
      import { definePlugin } from "@asterism-app/sdk/runtime";
      import { registry } from "@example/paradigm/contracts";
      export default { ...definePlugin({ namespace: pluginNamespace(${JSON.stringify(id)}) }), probe: registry };
    `);
    file(root, "renderer.ts", `
      import { registry } from "@example/paradigm/contracts";
      export { registry };
      export default { modules: [], async prepare() { registry.add(${JSON.stringify(id)}); } };
    `);
    list.add({ source: { kind: "path", path: root } }, data);
  }
  return { data, provider, consumers, list, cache, load: () => loadPackages(list, data, cache, []) };
}
describe("Plugin-owned public packages", () => {
  it("shares provider-owned registration state across consumers and keeps frontend and backend instances separate", async () => {
    const fixture_ = fixture(), packages = await fixture_.load();
    expect(packages.map(item => item.status)).toEqual(["loaded", "loaded", "loaded"]);
    const registries = packages.map(item => (item.definition as PluginDefinition & { probe: Set<string> }).probe);
    registries[1]!.add("backend");
    expect([...registries[0]!]).toEqual(["backend"]);
    expect([...registries[2]!]).toEqual(["backend"]);
    expect(packages.slice(1).map(item => item.runtimeDependencies)).toEqual([["example.provider"], ["example.provider"]]);
    const renderers = await Promise.all(packages.map(item => import(pathToFileURL(join(fixture_.cache, item.renderer!)).href)));
    for (const renderer of renderers) await renderer.default.prepare();
    expect([...renderers[0]!.registry]).toEqual(["example.provider", "example.consumer1", "example.consumer2"]);
    expect(renderers[1]!.registry).toBe(renderers[2]!.registry);
    expect([...registries[0]!]).toEqual(["backend"]);
  });
  it("rejects consumers of a disabled API provider without executing their private copies", async () => {
    const fixture_ = fixture();
    fixture_.list.setEnabled(0, false);
    const packages = await fixture_.load();
    expect(packages.map(item => item.status)).toEqual(["disabled", "failed", "failed"]);
    expect(packages[1]!.error).toContain("no available enabled provider");
  });
  it("rejects conflicting ownership between a public library and a plugin public export", async () => {
    const fixture_ = fixture(), root = directory();
    file(root, "package.json", JSON.stringify({ name: "@example/paradigm", type: "module",
      exports: { "./public": "./public.ts" }, asterism: { displayName: "Test plugin", id: "example.other" } }));
    file(root, "public.ts", "export const registry = new Set();");
    fixture_.list.add({ source: { kind: "path", path: root } }, fixture_.data);
    const packages = await fixture_.load();
    for (const id of ["example.provider", "example.other"]) {
      const entry = packages.find(item => item.manifest?.id === id)!;
      expect(entry.status).toBe("failed");
      expect(entry.error).toContain("Multiple plugins provide public package @example/paradigm");
    }
    expect(packages.filter(item => item.manifest?.id.startsWith("example.consumer")).map(item => item.status)).toEqual(["failed", "failed"]);
  });
  it("preserves package-relative assets for explicitly external runtime dependencies", async () => {
    const data = directory(), root = directory(), list = new PackageList(join(data, "plugins.json"));
    file(root, "package.json", JSON.stringify({ name: "@example/native-consumer", type: "module",
      asterism: { displayName: "Test plugin", id: "example.native", runtime: "runtime.ts", runtimeExternals: ["native-library"] } }));
    file(root, "node_modules/native-library/package.json", JSON.stringify({ name: "native-library", type: "module", exports: "./index.js" }));
    file(root, "node_modules/native-library/data.txt", "package asset");
    file(root, "node_modules/native-library/index.js", 'import { readFileSync } from "node:fs"; export const value = readFileSync(new URL("./data.txt", import.meta.url), "utf8");');
    file(root, "runtime.ts", `
      import { pluginNamespace } from "@asterism-app/sdk/contracts";
      import { value } from "native-library";
      export default { namespace: pluginNamespace("example.native"), probe: value };
    `);
    list.add({ source: { kind: "path", path: root } }, data);
    const [loaded] = await loadPackages(list, data, join(data, "cache"), []);
    expect(loaded?.error).toBeUndefined();
    expect((loaded!.definition as PluginDefinition & { probe: string }).probe).toBe("package asset");
  });
});
