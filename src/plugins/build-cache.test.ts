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
  const root = realpathSync(mkdtempSync(join(tmpdir(), "asterism-build-cache-")));
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
    runtime: new Map([["fixture", entry]]), storage: new Map(), renderer: new Map(), stylesheets: new Map(),
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

// Caches must return the complete shared module graph; checking only entries misses deleted shared chunks.
it("reuses unchanged complete dependency graphs and rebuilds when recipes change or shared artifacts are missing", () => {
  const f = fixture();
  f.save();
  expect(f.create().read()).toEqual(f.result);
  expect(f.create("recipe-two").read()).toBeNull();
  rmSync(f.chunk);
  expect(f.create().read()).toBeNull();
});

// Local source does not change with package versions; new higher-priority candidates, dependency shadowing, and resolution configuration can change actual builds.
it.each([
  ["source contents", (f: ReturnType<typeof fixture>) => put(join(f.plugin, "src/value.js"), "export const value = 2;")],
  ["higher-priority same-name extension", (f: ReturnType<typeof fixture>) => put(join(f.plugin, "src/value.ts"), "export const value = 3;")],
  ["npm dependency with unchanged version", (f: ReturnType<typeof fixture>) => put(join(f.root, "node_modules/dependency/index.js"), "export const value = 4;")],
  ["nearer same-name dependency", (f: ReturnType<typeof fixture>) => put(join(f.plugin, "node_modules/dependency/index.js"), "export const value = 5;")],
  ["package exports", (f: ReturnType<typeof fixture>) => put(join(f.root, "node_modules/dependency/package.json"), '{"name":"dependency","exports":"./other.js"}')],
  ["new ancestor configuration", (f: ReturnType<typeof fixture>) => put(join(f.root, "tsconfig.json"), '{"compilerOptions":{"jsx":"preserve"}}')],
] as const)("%s changes invalidate existing caches", (_name, change) => {
  const f = fixture();
  f.save();
  change(f);
  expect(f.create().read()).toBeNull();
});

// These inputs exceed fingerprint coverage; use ordinary builds without leaving reusable indexes.
it("out-of-scope helpers and inherited configuration bypass caching while ordinary configuration remains cacheable", () => {
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

// When caches live inside local packages, writing artifacts must not trigger recompilation at the next startup.
it("cache artifacts do not enter source fingerprints and failed batches do not overwrite successful indexes", () => {
  const f = fixture();
  const cache = join(f.plugin, ".cache");
  const create = () => new PluginBuildCache(cache, [f.plugin], "recipe");
  create().write(f.result, [f.entry, f.chunk]);
  const index = readFileSync(join(cache, "build-index.json"), "utf8");
  expect(create().read()).toEqual(f.result);
  create().write({ ...f.result, failures: new Map([["fixture", "Invalid source."]]) }, []);
  expect(readFileSync(join(cache, "build-index.json"), "utf8")).toBe(index);
});
