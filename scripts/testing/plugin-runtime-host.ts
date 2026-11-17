// Compiled by the opt-in test, then executed by Electron in Node mode, never by Vitest's source loader.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { PackageList, buildPackages, importPackages, type ResolvedPackage } from "../../src/plugins/packages.ts";
import * as sdkRuntime from "@asterism-app/sdk/runtime";
import * as zod from "zod";
import { savePluginBuild, readPluginBuild } from "../../src/plugins/artifacts.ts";
import { createNpmProcess, pnpmLauncher } from "../../src/plugins/npm-process.ts";

assert.ok(process.versions.electron, "The harness must execute inside the actual Electron Node runtime.");
assert.equal(process.env.ELECTRON_RUN_AS_NODE, "1");
assert.equal(process.features.typescript, false, "TypeScript execution must be disabled, not a fallback for missing compiled entries.");
const [mode, root, ...directories] = process.argv.slice(2);
assert.ok(root);
const cache = join(root, "cache");
// The compiling test supplies the host-module files emitted beside this harness; they share chunks with it.
const hostModules = JSON.parse(readFileSync(join(import.meta.dirname, "host-modules.json"), "utf8")) as Record<string, string>;

async function load(): Promise<ResolvedPackage[]> {
  const list = new PackageList(join(root, "plugins.json"));
  for (const path of directories) list.add({ source: { kind: "path", path } }, root!);
  const built = await buildPackages(list, root!);
  for (const item of built) assert.equal(item.status, "ready", JSON.stringify(item.diagnostic));
  // Exercise the compiled preparation -> runtime serialization boundary as well as native entry imports.
  const items = await importPackages(readPluginBuild(savePluginBuild(cache, built)), hostModules);
  for (const item of items) assert.equal(item.status, "ready", `${item.manifest?.id}: ${JSON.stringify(item.diagnostic)}`);
  return items;
}
function entry(item: ResolvedPackage) {
  assert.ok(item.runtime);
  return import(pathToFileURL(item.runtime).href);
}

if (mode === "fixtures") {
  const items = await load();
  const one = items.find(item => item.manifest?.id === "fixture.one")!;
  const two = items.find(item => item.manifest?.id === "fixture.two")!;
  const provider = items.find(item => item.manifest?.id === "fixture.provider")!;
  const a = await entry(one), b = await entry(two), p = await entry(provider);
  assert.equal(a.evidence.Token, p.evidence.Token);
  assert.equal(b.evidence.registry, p.evidence.registry);
  assert.ok(new a.evidence.Token() instanceof b.evidence.Token);
  a.evidence.registry.add("electron");
  assert.deepEqual([...p.evidence.registry], ["electron"]);
  a.increment();
  assert.equal(b.count, 1, "Public re-exports must retain live bindings in Electron's native module graph.");
  const storage = provider.storage![0]!;
  assert.equal(storage.kind, "json");
  assert.ok(storage.kind === "json");
  assert.equal(storage.migrations[1]!({}), p.evidence.stored);
  assert.equal(a.evidence.PluginApiError, sdkRuntime.PluginApiError, "Plugins must share the host's own SDK instance.");
  assert.equal(a.evidence.zString, zod.string);
  assert.equal(a.evidence.requiredZod, zod.string, "Plugin code requiring a host module must reach the host instance.");
  assert.ok(new a.evidence.PluginApiError("invalid_argument", "probe") instanceof sdkRuntime.PluginApiError);
  assert.equal(a.evidence.importMode, "import");
  assert.equal(a.evidence.requireMode, "require");
  assert.deepEqual(a.evidence.json, { shipped: "json-import-attributes" });
  assert.deepEqual(one.runtimeDependencies, ["fixture.provider"]);
} else if (mode === "builtin") {
  const items = await load();
  const builtin = items.find(item => item.manifest?.id === "asterism.builtin")!;
  const consumer = items.find(item => item.manifest?.id === "fixture.builtin-consumer")!;
  assert.ok(builtin.definition);
  assert.ok(builtin.storage?.length, "The distributed built-in storage entry must execute too.");
  const { evidence } = await entry(consumer);
  assert.equal(builtin.definition.namespace, evidence.builtin, "Builtin runtime and consumers must share the provider-owned public graph.");
  const publicEntry = builtin.artifact!.public.runtime["@asterism-app/builtin-api/runtime"]!;
  const api = await import(pathToFileURL(join(builtin.artifactRoot!, publicEntry)).href);
  assert.equal(evidence.agentCreations, api.agentCreations);
  assert.deepEqual(consumer.runtimeDependencies, ["asterism.builtin"]);
} else if (mode === "pnpm") {
  const launcher = pnpmLauncher();
  assert.equal(launcher, join(root, "app.asar.unpacked/node_modules/pnpm/bin/pnpm.cjs"));
  const project = join(root, "project");
  const resultFile = join(project, "result.json");
  writeFileSync(join(project, "probe.cjs"), `require('node:fs').writeFileSync(${JSON.stringify(resultFile)}, JSON.stringify({electron:process.versions.electron, executable:process.execPath, cwd:process.cwd()}));`);
  const result = await createNpmProcess().run(["exec", "node", "probe.cjs"], project, new AbortController().signal, () => {});
  assert.equal(result.code, 0, result.stderr || result.stdout);
  const probe = JSON.parse(readFileSync(resultFile, "utf8"));
  assert.equal(probe.electron, process.versions.electron);
  assert.equal(probe.executable, process.execPath, "pnpm exec must find the application's Node-mode shim, not a system Node.");
  assert.equal(probe.cwd, project);
} else {
  throw new Error(`Unknown integration mode: ${mode}`);
}
process.stdout.write(`Electron ${process.versions.electron}: ${mode} passed\n`);
