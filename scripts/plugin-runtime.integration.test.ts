import { execFile } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { buildPlugin } from "@asterism-app/plugin-build";
import { buildHost, fixtureManifest, type FixtureConfig } from "../src/plugins/artifact-fixtures.integration.ts";
import { afterEach, expect, test } from "vitest";

const require = createRequire(import.meta.url);
const electron = require("electron") as string;
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function temporary() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "asterism-electron-plugin-")));
  roots.push(root);
  return root;
}
function put(root: string, path: string, contents: string) {
  const file = join(root, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, contents);
}
async function host(root: string, distribution = "app.asar.unpacked") {
  const outdir = join(root, distribution, "dist/main");
  // Bundle the current host/SDK, not mocks or a TS import trampoline. Keep application output depth.
  // Host modules are separate entries sharing chunks with the harness, as in the application build.
  const modules = await buildHost(outdir, { "plugin-runtime-host": resolve("scripts/testing/plugin-runtime-host.ts") });
  writeFileSync(join(outdir, "host-modules.json"), JSON.stringify(modules));
  return join(outdir, "plugin-runtime-host.mjs");
}
async function run(root: string, mode: string, directories: string[] = [], environment: NodeJS.ProcessEnv = {}, entry?: string) {
  const home = join(root, "home");
  mkdirSync(home, { recursive: true });
  const { stdout } = await promisify(execFile)(electron, ["--no-experimental-strip-types", entry ?? await host(root), mode, root, ...directories], {
    cwd: root, maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, NODE_OPTIONS: "", NODE_PATH: "", ELECTRON_RUN_AS_NODE: "1",
      HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: join(home, "config"), XDG_CACHE_HOME: join(home, "cache"),
      npm_config_userconfig: join(home, ".npmrc"), ...environment },
  });
  expect(stdout).toContain(`${mode} passed`);
}
async function plugin(root: string, name: string, config: FixtureConfig, files: Record<string, string>) {
  const source = join(root, "authoring", name);
  put(source, "package.json", JSON.stringify(fixtureManifest(name, config)));
  for (const [path, contents] of Object.entries(files)) put(source, path, contents);
  await buildPlugin({ root: source });
  const shipped = join(root, "relocated", name);
  mkdirSync(shipped, { recursive: true });
  // Distribution contains compiled artifacts only. The original absolute build location ceases to exist.
  cpSync(join(source, "package.json"), join(shipped, "package.json"));
  cpSync(join(source, "dist"), join(shipped, "dist"), { recursive: true });
  if (Object.keys(files).some(path => path.startsWith("node_modules/")))
    cpSync(join(source, "node_modules"), join(shipped, "node_modules"), { recursive: true });
  rmSync(source, { recursive: true });
  return shipped;
}

// Opt-in process integration: no Electron app entry, BrowserWindow, GUI assertions, or user data.
// Requires `npm run build:plugins`; ASTERISM_TEST_BUILTIN_ROOT can select a packaged built-in root.
test("compiled host loads relocated source-free artifacts with native public/host identities and external JSON in Electron", async () => {
  const root = temporary();
  const provider = await plugin(root, "provider", {
    runtime: "runtime.ts", storage: "storage.ts",
    provides: { runtime: { "@fixture/api/contracts": "public.ts", "@fixture/api/relay": "relay.ts" } },
  }, {
    "public.ts": "export class Token{};export const registry=new Set();export const stored={value:'shared'};export let count=0;export function increment(){count++;}",
    "relay.ts": "export {Token,registry,count,increment} from '@fixture/api/contracts';",
    "runtime.ts": "import {Token,registry,stored} from '@fixture/api/contracts';export const evidence={Token,registry,stored};export default {namespace:{id:'fixture.provider'}};",
    "storage.ts": "import {stored} from '@fixture/api/contracts';export default [{kind:'json',path:'state.json',version:2,migrations:{1:()=>stored}}];",
  });
  const consumers: string[] = [];
  for (const name of ["one", "two"]) consumers.push(await plugin(root, name, {
    runtime: "runtime.ts", peers: ["@fixture/api"], dependencies: ["@fixture/private"],
  }, {
    "runtime.ts": `import {Token,registry} from '@fixture/api/relay';
      export {count,increment} from '@fixture/api/relay';
      import {PluginApiError} from '@asterism-app/sdk/runtime';import {string as zString} from 'zod';
      import {createRequire} from 'node:module';
      import {mode as importMode} from '@fixture/private';
      import json from '@fixture/private/data' with {type:'json'};
      const {mode:requireMode}=createRequire(import.meta.url)('@fixture/private');
      const requiredZod=createRequire(import.meta.url)('zod').string;
      export const evidence={Token,registry,PluginApiError,zString,importMode,requireMode,json,requiredZod};
      export default {namespace:{id:'fixture.${name}'}};`,
    "node_modules/@fixture/api/package.json": JSON.stringify({ name: "@fixture/api", type: "module", exports: { "./relay": "./wrong.mjs" } }),
    "node_modules/@fixture/api/wrong.mjs": "throw new Error('Consumer-private public copy executed');",
    "node_modules/@fixture/private/package.json": JSON.stringify({ name: "@fixture/private", type: "module",
      exports: { ".": { import: "./import.mjs", require: "./require.cjs" }, "./data": "./data.json" } }),
    "node_modules/@fixture/private/import.mjs": "export const mode='import';",
    "node_modules/@fixture/private/require.cjs": "exports.mode='require';",
    "node_modules/@fixture/private/data.json": JSON.stringify({ shipped: "json-import-attributes" }),
  }));
  // Consumers deliberately precede their provider to exercise the captured dependency graph.
  await run(root, "fixtures", [consumers[0]!, provider, consumers[1]!]);
}, 60_000);

test("compiled host executes the built-in distribution and its public consumer in Electron Node mode", async () => {
  const root = temporary();
  const consumer = await plugin(root, "builtin-consumer", {
    runtime: "runtime.ts", peers: ["@asterism-app/builtin-api"],
  }, {
    "runtime.ts": `import {builtin} from '@asterism-app/builtin-api/contracts';
      import {agentCreations} from '@asterism-app/builtin-api/runtime';
      export const evidence={builtin,agentCreations};export default {namespace:{id:'fixture.builtin-consumer'}};`,
  });
  const builtin = resolve(process.env.ASTERISM_TEST_BUILTIN_ROOT ?? "packages/builtin");
  await run(root, "builtin", [consumer, builtin]);
}, 60_000);

const contextFoldRoot = process.env.ASTERISM_TEST_CONTEXT_FOLD_ROOT;
test.skipIf(!contextFoldRoot)("compiled Context Fold joins the built-in projector registry from a source-free package", async () => {
  const root = temporary();
  const shipped = join(root, "relocated", "context-fold");
  mkdirSync(shipped, { recursive: true });
  for (const path of ["package.json", "dist", "locales"]) cpSync(join(contextFoldRoot!, path), join(shipped, path), { recursive: true });
  await run(root, "context-fold", [shipped, resolve(process.env.ASTERISM_TEST_BUILTIN_ROOT ?? "packages/builtin")]);
}, 60_000);

test("starts pnpm from a real ASAR while leaving regular dependencies in the archive", async () => {
  const root = temporary();
  const staging = join(root, "staging");
  await host(root, "staging");
  const asar = createRequire(require.resolve("app-builder-lib/package.json"))("@electron/asar") as typeof import("@electron/asar");
  cpSync(dirname(require.resolve("pnpm")), join(staging, "node_modules/pnpm"), { recursive: true });
  put(staging, "node_modules/fixture-archived/package.json", JSON.stringify({ name: "fixture-archived", exports: "./index.mjs" }));
  put(staging, "node_modules/fixture-archived/index.mjs", "export default 'packed';");
  put(staging, "dist/main/probe.mjs", `import assert from 'node:assert/strict';
    import dependency from 'fixture-archived';
    assert.equal(dependency, 'packed');
    await import('./plugin-runtime-host.mjs');`);
  await asar.createPackageWithOptions(staging, join(root, "app.asar"), { unpackDir: "node_modules/pnpm" });
  put(root, "project/package.json", JSON.stringify({ name: "isolated-script-probe", private: true }));
  await run(root, "pnpm", [], { PATH: "" }, join(root, "app.asar/dist/main/probe.mjs"));
}, 60_000);
