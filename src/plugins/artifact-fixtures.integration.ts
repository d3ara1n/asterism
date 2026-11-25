import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { hostModules } from "../shared/host-modules.ts";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { build } from "esbuild";
import { buildPlugin } from "@asterism-app/plugin-build";

export function put(root: string, path: string, source: string): void {
  const file = join(root, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, source);
}
/**
 * Compile a host entry as application packaging does: each backend host module becomes its own entry file sharing
 * chunks with the host code, so the host and plugins observe the same instances. Returns the host-module file URLs.
 */
export async function buildHost(outdir: string, entry: Record<string, string>): Promise<Record<string, string>> {
  const names = hostModules.runtime.map((specifier, index) => [specifier, `host-${index}`] as const);
  await build({ entryPoints: { ...entry, ...Object.fromEntries(names.map(([specifier, name]) => [name, specifier])) }, outdir,
    bundle: true, splitting: true, format: "esm", platform: "node", target: "node22", outExtension: { ".js": ".mjs" }, logLevel: "silent" });
  return Object.fromEntries(names.map(([specifier, name]) => [specifier, pathToFileURL(join(outdir, `${name}.mjs`)).href]));
}
/**
 * Fixture shorthand. provides maps public specifiers to package files; they must share one package name, which becomes
 * the fixture's own package name with matching exports. peers and dependencies become the package's declarations.
 */
export interface FixtureConfig {
  runtime?: string; storage?: string; renderer?: string;
  provides?: { runtime?: Record<string, string>; renderer?: Record<string, string> };
  peers?: string[]; dependencies?: string[];
}
export function fixtureManifest(name: string, config: FixtureConfig, metadata: object = {}) {
  const provided = { ...config.provides?.runtime, ...config.provides?.renderer };
  const owners = new Set(Object.keys(provided).map(specifier => /^(?:@[^/]+\/)?[^/]+/u.exec(specifier)![0]));
  if (owners.size > 1) throw new Error(`Fixture ${name} provides several packages.`);
  const [own] = owners;
  return { name: own ?? `@fixture/${name}`, type: "module", version: "1.0.0",
    ...own && { exports: Object.fromEntries(Object.entries(provided).map(([specifier, file]) => [`.${specifier.slice(own.length)}`, `./${file}`])) },
    dependencies: Object.fromEntries((config.dependencies ?? []).map(dependency => [dependency, "*"])),
    peerDependencies: Object.fromEntries(["@asterism-app/sdk", "zod", "react", "react-intl", ...config.peers ?? []].map(peer => [peer, "*"])),
    ...metadata,
    asterism: { id: `fixture.${name}`, displayName: name, build: {
      runtime: config.runtime, storage: config.storage, renderer: config.renderer,
      public: { runtime: Object.keys(config.provides?.runtime ?? {}), renderer: Object.keys(config.provides?.renderer ?? {}) } } } };
}
export async function fixture() {
  const root = mkdtempSync(join(tmpdir(), "asterism-artifact-"));
  // Tests explicitly build a host entry, just as application packaging does. Production startup has no compiler dependency.
  const loaderSource = join(root, "loader-source.ts");
  put(root, "loader-source.ts", `export * from ${JSON.stringify(resolve("src/plugins/packages.ts"))}; export * from ${JSON.stringify(resolve("src/plugins/artifacts.ts"))}; export * from ${JSON.stringify(resolve("src/storage/migrations/plugin-entries.ts"))};`);
  const hostModuleUrls = await buildHost(join(root, "host"), { loader: loaderSource });
  const loader = join(root, "host/loader.mjs");
  const plugin = async (name: string, config: FixtureConfig, files: Record<string, string> = {}, metadata: object = {}) => {
    const directory = join(root, name);
    put(directory, "package.json", JSON.stringify(fixtureManifest(name, config, metadata)));
    for (const [path, source] of Object.entries(files)) put(directory, path, source);
    await buildPlugin({ root: directory });
    return directory;
  };
  const run = async (source: string) => {
    const entry = join(root, "run.mjs");
    put(root, "run.mjs", `import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as loader from ${JSON.stringify(pathToFileURL(loader).href)};
const root = ${JSON.stringify(root)};
const cache = join(root, 'cache');
const hostModules = ${JSON.stringify(hostModuleUrls)};
const list = new loader.PackageList(join(root, 'plugins.json'));
const add = (name) => list.add({source:{kind:'path',path:join(root,name)}}, root);
${source}
`);
    await promisify(execFile)(process.execPath, [entry], { maxBuffer: 4 * 1024 * 1024 });
  };
  return { root, plugin, run, hostModules: hostModuleUrls, close: () => rmSync(root, { recursive: true, force: true }) };
}
