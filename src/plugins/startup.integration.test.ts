import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, expect, it } from "vitest";
import type { PluginContext } from "@asterism-app/sdk/runtime";
import { PackageList, buildPackages, importPackages, packageCandidates } from "./packages.ts";
import { readPluginBuild, savePluginBuild } from "./artifacts.ts";
import { loadPlugins } from "./loader.ts";
import { testHostServices } from "./testing.ts";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function put(file: string, source: string) { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, source); }
function fixture() {
  const root = mkdtempSync(join(process.cwd(), ".plugin-startup-")); roots.push(root);
  const cache = join(root, "artifacts"), list = new PackageList(join(root, "plugins.json"));
  const add = (name: string, manifest: Record<string, unknown> = {}, metadata: Record<string, unknown> = {}) => {
    const path = join(root, name);
    put(join(path, "package.json"), JSON.stringify({ name: `@fixture/${name}`, type: "module", ...metadata,
      asterism: { id: `fixture.${name}`, displayName: name, ...manifest } }));
    list.add({ source: { kind: "path", path } }, root);
    return path;
  };
  return { root, cache, list, add, build: () => buildPackages(list, root, cache) };
}
const runtime = (id: string, text: string) => `export default { namespace: {id: ${JSON.stringify(id)}}, setup: () => ({agentInstructions: [{id:'version',text:${JSON.stringify(text)}}]}) };`;
const instructions = (plugin: Awaited<ReturnType<typeof importPackages>>[number]) =>
  plugin.definition!.setup!({} as PluginContext)?.agentInstructions;

// Preparation and runtime must agree on executable artifacts even when author files or the managed list change between stages.
it("imports the captured build and list, then resolves changed source on the next startup and reclaims obsolete artifacts", async () => {
  const f = fixture(), path = f.add("snapshot", { runtime: "runtime.js" });
  put(join(path, "runtime.js"), runtime("fixture.snapshot", "before"));
  const initial = await f.build();
  const file = savePluginBuild(f.cache, initial);
  put(join(path, "runtime.js"), runtime("fixture.snapshot", "after"));
  f.add("later");
  const imported = await importPackages(readPluginBuild(file), f.cache);
  expect(imported.map(item => item.manifest!.id)).toEqual(["fixture.snapshot"]);
  expect(instructions(imported[0]!)).toEqual([{ id: "version", text: "before" }]);
  const next = await f.build();
  savePluginBuild(f.cache, next);
  expect(next.map(item => item.manifest!.id)).toEqual(["fixture.snapshot", "fixture.later"]);
  expect(instructions((await importPackages(next, f.cache))[0]!)).toEqual([{ id: "version", text: "after" }]);
  expect(existsSync(join(f.cache, initial[0]!.runtime!))).toBe(false);
  expect(existsSync(join(f.cache, next[0]!.runtime!))).toBe(true);
});

// A nearer scoped package does not change node_modules' immediate entries when the scope already exists.
it("resolves a newly installed nearer scoped dependency on every startup", async () => {
  const f = fixture(), path = f.add("consumer", { runtime: "runtime.js" });
  put(join(path, "runtime.js"), `import {value} from '@fixture/dependency'; export default {namespace:{id:'fixture.consumer'},setup:()=>({agentInstructions:[{id:'version',text:value}]})};`);
  const dependency = (base: string, value: string) => {
    put(join(base, "node_modules/@fixture/dependency/package.json"), JSON.stringify({ name: "@fixture/dependency", type: "module", main: "index.js" }));
    put(join(base, "node_modules/@fixture/dependency/index.js"), `export const value = ${JSON.stringify(value)};`);
  };
  dependency(f.root, "ancestor");
  put(join(path, "node_modules/@fixture/other/index.js"), "export const other = true;");
  expect(instructions((await importPackages(await f.build(), f.cache))[0]!)).toEqual([{ id: "version", text: "ancestor" }]);
  dependency(path, "nearest");
  expect(instructions((await importPackages(await f.build(), f.cache))[0]!)).toEqual([{ id: "version", text: "nearest" }]);
});

// Storage admission belongs to the package graph, including public-only providers, and runs before backend imports.
it("blocks a public-only provider and its consumers after storage failure without importing their runtime", async () => {
  const f = fixture();
  const provider = f.add("provider", { storage: "storage.js" }, { exports: { "./public": "./public.js" } });
  put(join(provider, "storage.js"), "export default [{kind:'json',path:'state.json',version:2,migrations:{}}];");
  put(join(provider, "public.js"), "export const value = 1;");
  const consumer = f.add("consumer", { runtime: "runtime.js" });
  put(join(consumer, "runtime.js"), "export {value} from '@fixture/provider/public'; throw new Error('Runtime must not execute');");
  f.add("independent");
  const packages = await importPackages(await f.build(), f.cache, { storageFailures: new Map([["fixture.provider", "Migration failed."]]) });
  expect(packages.map(item => [item.manifest!.id, item.status, item.diagnostic?.stage])).toEqual([
    ["fixture.provider", "failed", "storage"], ["fixture.consumer", "failed", "dependency"], ["fixture.independent", "ready", undefined],
  ]);
  expect(packages[1]!.definition).toBeUndefined();
  const loaded = loadPlugins([], { ...testHostServices(), packages: packageCandidates(packages) });
  try {
    expect(loaded.packages.map(item => [item.id, item.status])).toEqual([
      ["fixture.provider", "failed"], ["fixture.consumer", "failed"], ["fixture.independent", "loaded"],
    ]);
  } finally { await loaded.close(); }
});
