import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
export async function fixture() {
  const root = mkdtempSync(join(tmpdir(), "asterism-artifact-"));
  const loader = join(root, "loader.mjs");
  // Tests explicitly build a host entry, just as application packaging does. Production startup has no compiler dependency.
  await build({ stdin: { contents: 'export * from "./src/plugins/packages.ts"; export * from "./src/plugins/artifacts.ts"; export * from "./src/shared/public-modules.ts";', resolveDir: resolve("."), sourcefile: "loader-fixture.ts" }, outfile: loader, bundle: true, format: "esm", platform: "node", logLevel: "silent" });
  const plugin = async (name: string, config: object, files: Record<string, string> = {}, metadata: object = {}) => {
    const directory = join(root, name);
    put(directory, "package.json", JSON.stringify({ name: `@fixture/${name}`, type: "module", version: "1.0.0", ...metadata,
      asterism: { id: `fixture.${name}`, displayName: name, artifact: "dist/plugin.json", build: config } }));
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
const list = new loader.PackageList(join(root, 'plugins.json'));
const add = (name) => list.add({source:{kind:'path',path:join(root,name)}}, root);
${source}
`);
    await promisify(execFile)(process.execPath, [entry], { maxBuffer: 4 * 1024 * 1024 });
  };
  return { root, plugin, run, close: () => rmSync(root, { recursive: true, force: true }) };
}
