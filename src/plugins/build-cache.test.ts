import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { PluginBuildCache } from "./build-cache.ts";
import type { CompiledModules } from "./package-modules.ts";

const temporary: string[] = [];
afterEach(() => { for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true }); });
function put(path: string, value: string) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, value); }
function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "atelier-build-cache-")));
  temporary.push(root);
  const plugin = join(root, "plugin"), cache = join(root, "cache");
  const entry = join(cache, "modules-one", "runtime.mjs"), chunk = join(cache, "modules-one", "shared.mjs");
  put(join(plugin, "package.json"), '{"name":"fixture"}');
  put(join(plugin, "src/index.ts"), 'export { value } from "./value";');
  put(join(plugin, "src/value.js"), "export const value = 1;");
  put(join(root, "node_modules/dependency/package.json"), '{"name":"dependency","version":"1.0.0"}');
  put(join(root, "node_modules/dependency/index.js"), "export const value = 1;");
  put(entry, 'export { value } from "./shared.mjs";'); put(chunk, "export const value = 1;");
  const result: CompiledModules = {
    runtime: new Map([["fixture", entry]]), storage: new Map(), renderer: new Map(),
    dependencies: new Map([["fixture", new Set(["provider"])]]),
    runtimeDependencies: new Map([["fixture", new Set(["provider"])]]),
    rendererDependencies: new Map(), failures: new Map(),
  };
  const create = (recipe = "recipe-one") => new PluginBuildCache(cache, [plugin], recipe);
  const save = () => {
    const initial = create();
    initial.inputs([join(plugin, "src/index.ts")]);
    initial.write(result, [entry, chunk]);
  };
  return { root, plugin, cache, entry, chunk, result, create, save };
}

// 缓存必须交还整个共享模块图；只检查入口会漏掉被清理的共享 chunk。
it("未变化时复用完整依赖图，配方变化或共享产物缺失时重新构建", () => {
  const f = fixture();
  f.save();
  expect(f.create().read()).toEqual(f.result);
  expect(f.create("recipe-two").read()).toBeNull();
  rmSync(f.chunk);
  expect(f.create().read()).toBeNull();
});

// 本地源码不随包版本改变；新增优先候选、依赖遮蔽与解析配置都可能改变真实构建结果。
it.each([
  ["源码正文", (f: ReturnType<typeof fixture>) => put(join(f.plugin, "src/value.js"), "export const value = 2;")],
  ["更优先的同名扩展", (f: ReturnType<typeof fixture>) => put(join(f.plugin, "src/value.ts"), "export const value = 3;")],
  ["版本未变的 npm 依赖", (f: ReturnType<typeof fixture>) => put(join(f.root, "node_modules/dependency/index.js"), "export const value = 4;")],
  ["更近的同名依赖", (f: ReturnType<typeof fixture>) => put(join(f.plugin, "node_modules/dependency/index.js"), "export const value = 5;")],
  ["包导出", (f: ReturnType<typeof fixture>) => put(join(f.root, "node_modules/dependency/package.json"), '{"name":"dependency","exports":"./other.js"}')],
  ["新增祖先配置", (f: ReturnType<typeof fixture>) => put(join(f.root, "tsconfig.json"), '{"compilerOptions":{"jsx":"preserve"}}')],
] as const)("%s 变化使已有缓存失效", (_name, change) => {
  const f = fixture();
  f.save();
  change(f);
  expect(f.create().read()).toBeNull();
});

// 这些输入超出指纹覆盖范围，继续使用普通构建结果，但不留下可复用索引。
it("范围外 helper 和继承配置不缓存，普通配置仍可缓存", () => {
  const f = fixture();
  const outside = f.create();
  outside.resolution("../helper", join(f.plugin, "index.ts"), f.plugin);
  outside.write(f.result, [f.entry, f.chunk]);
  expect(f.create().read()).toBeNull();
  put(join(f.plugin, "tsconfig.json"), '{"extends":"../base.json"}');
  f.save();
  expect(f.create().read()).toBeNull();
  put(join(f.plugin, "tsconfig.json"), '{"compilerOptions":{"jsx":"preserve"}}');
  f.save();
  expect(f.create().read()).toEqual(f.result);
});

// 缓存目录位于本地包内时，自身产物写入不能触发下一次启动重编译。
it("缓存产物不参与源码指纹，失败批次不覆盖成功索引", () => {
  const f = fixture();
  const cache = join(f.plugin, ".cache");
  const create = () => new PluginBuildCache(cache, [f.plugin], "recipe");
  create().write(f.result, [f.entry, f.chunk]);
  const index = readFileSync(join(cache, "build-index.json"), "utf8");
  expect(create().read()).toEqual(f.result);
  create().write({ ...f.result, failures: new Map([["fixture", "Invalid source."]]) }, []);
  expect(readFileSync(join(cache, "build-index.json"), "utf8")).toBe(index);
});
