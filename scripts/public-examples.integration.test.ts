import { execFile } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect, test } from "vitest";

const repository = realpathSync(fileURLToPath(new URL("..", import.meta.url)));
const execute = promisify(execFile);

function inside(parent: string, child: string) {
  const path = relative(parent, child);
  return path === "" || (!isAbsolute(path) && path !== ".." && !path.startsWith(`..${sep}`));
}

async function run(command: string, args: string[], cwd: string) {
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_PATH: "", NODE_OPTIONS: "" };
  const pathKey = Object.keys(env).find(key => key.toLowerCase() === "path") ?? "PATH";
  // npm run/npx inject workspace .bin directories into PATH. Keep the native Node/toolchain,
  // but an omitted example dependency must not find an executable in the repository instead.
  env[pathKey] = [dirname(process.execPath), ...(process.env[pathKey] ?? "").split(delimiter)
    .filter(path => path && !inside(repository, resolve(path)))].join(delimiter);
  try {
    return await execute(command, args, {
      cwd, maxBuffer: 8 * 1024 * 1024,
      // Neither native Node probes nor npm's children may resolve through application injections.
      env,
    });
  } catch (error) {
    const failure = error as Error & { stdout?: string; stderr?: string };
    throw new Error(`${command} ${args.join(" ")} failed in ${cwd}\n${failure.stdout ?? ""}\n${failure.stderr ?? ""}`, { cause: error });
  }
}

function json(path: string) {
  return JSON.parse(readFileSync(path, "utf8"));
}

// Compare maintained author material with the *actual* archive, so removing a files entry cannot
// silently turn this into a successful test of a smaller example. Local build histories are not inputs.
function checkAuthorFiles(source: string, packed: string) {
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    if (entry.name === "dist" || entry.name === "node_modules") continue;
    const original = join(source, entry.name);
    const delivered = join(packed, entry.name);
    if (entry.isDirectory()) checkAuthorFiles(original, delivered);
    else expect(readFileSync(delivered).equals(readFileSync(original)), `Packed author file: ${delivered}`).toBe(true);
  }
}

// This script lives in each cleanroom, so Node's own resolver and the installed builder's schema
// exercise the delivered package exports, not Vitest aliases or the workspace's builder import.
const validate = String.raw`
import assert from 'node:assert/strict';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, join, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pointerSchema, artifactSchema } from '@asterism-app/plugin-build/artifact';
const root = realpathSync(process.cwd());
const json = path => JSON.parse(readFileSync(path, 'utf8'));
const installed = join(root, 'node_modules');
for (const expected of json(process.argv[2])) {
  const directory = join(installed, expected.name);
  assert.equal(realpathSync(directory), directory, 'Public package must be installed, not linked');
  assert.deepEqual(json(join(directory, 'package.json')), expected);
  const request = expected.name === '@asterism-app/plugin-build' ? expected.name + '/artifact' : expected.name + '/contracts';
  const resolved = realpathSync(fileURLToPath(import.meta.resolve(request)));
  const path = relative(directory, resolved);
  assert.ok(path !== '..' && !path.startsWith('../') && !path.startsWith('..\\') && !isAbsolute(path), request + ' escaped its installed package');
}
const manifest = json(join(root, 'package.json'));
const pointerFile = join(root, manifest.asterism.artifact);
const pointer = pointerSchema.parse(json(pointerFile));
const build = join(dirname(pointerFile), pointer.build);
const artifact = artifactSchema.parse(json(join(build, 'artifact.json')));
assert.equal(artifact.id, manifest.asterism.id);
// Validate the selected graph's files, including the counter's renderer/CSS and public entries.
const entries = [artifact.runtime, artifact.storage, artifact.renderer,
  ...Object.values(artifact.public.runtime), ...Object.values(artifact.public.renderer), ...artifact.stylesheets];
for (const entry of entries.filter(Boolean)) assert.ok(statSync(join(build, entry)).isFile(), entry);
for (const entry of ['runtime', 'storage', 'renderer']) {
  if (manifest.asterism.build[entry]) assert.ok(artifact[entry], 'Missing built ' + entry);
}
for (const realm of ['runtime', 'renderer']) {
  for (const request of Object.keys(manifest.asterism.build.public[realm])) {
    assert.ok(artifact.public[realm][request], 'Missing built public entry ' + request);
  }
}
`;

// Opt-in via test:plugins. pretest:plugins builds the builder; packing intentionally skips scripts.
// This proves prepublication archive completeness and real external author installs/builds. Explicit
// tarballs override release-aligned example pins while source package versions are placeholders.
// Release preparation stamps those versions together. This does NOT prove that the pinned versions
// are available from the registry, nor does it load plugins in Asterism (covered by loader tests).
test("packed public packages deliver complete examples that typecheck and build outside the workspace", async () => {
  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new Error("Run through npm run test:plugins or npx vitest so npm_execpath identifies the npm CLI.");
  const root = realpathSync(mkdtempSync(join(tmpdir(), "asterism-packed-examples-")));
  try {
    expect(inside(repository, root), "Cleanrooms must be outside the repository").toBe(false);
    const npm = (args: string[], cwd: string) => run(process.execPath, [npmCli, ...args], cwd);
    const archives = join(root, "archives");
    mkdirSync(archives);
    const catalog: string[] = json(join(repository, "package.json")).asterismRelease.packages;
    const packages = [];
    for (const [index, directory] of catalog.entries()) {
      const source = join(repository, directory);
      const { stdout } = await npm(["pack", "--ignore-scripts", "--json", "--pack-destination", archives], source);
      // npm 12 keys pack JSON by name; earlier npm versions return an array.
      const [packed] = Object.values(JSON.parse(stdout)) as Array<{ filename: string }>;
      const tarball = join(archives, packed!.filename);
      const unpacked = join(root, "unpacked", String(index));
      mkdirSync(unpacked, { recursive: true });
      await run("tar", ["-xf", tarball, "-C", unpacked], root);
      const contents = join(unpacked, "package");
      const manifest = json(join(contents, "package.json"));
      // Manuals and all examples are part of the author-facing package contract, not just build inputs.
      for (const path of ["README.md", "docs", "examples"]) {
        if (!existsSync(join(source, path))) continue;
        if (path === "README.md") expect(readFileSync(join(contents, path), "utf8")).toBe(readFileSync(join(source, path), "utf8"));
        else checkAuthorFiles(join(source, path), join(contents, path));
      }
      packages.push({ tarball, contents, manifest });
    }
    const expected = join(root, "packed-manifests.json");
    writeFileSync(expected, JSON.stringify(packages.map(item => item.manifest)));
    for (const [name, owner, example] of [
      ["counter", "@asterism-app/sdk", "examples/counter"],
      ["agent-observation", "@asterism-app/builtin-api", "examples"],
    ] as const) {
      const provider = packages.find(item => item.manifest.name === owner);
      expect(provider, `Release catalog must supply ${owner}`).toBeDefined();
      const project = join(root, "projects", name);
      // Sibling projects cannot self-resolve through an unpacked public package's exports or peers.
      cpSync(join(provider!.contents, example), project, { recursive: true });
      expect(existsSync(join(project, "dist")), "Packed examples must not carry local build histories").toBe(false);
      await npm(["install", "--no-save", "--package-lock=false", "--no-audit", "--no-fund", "--include=dev", "--include=peer",
        ...packages.map(item => item.tarball)], project);
      await npm(["run", "typecheck"], project);
      await npm(["run", "build"], project);
      const probe = join(project, "validate-packed-artifact.mjs");
      writeFileSync(probe, validate);
      await run(process.execPath, [probe, expected], project);
    }
  } finally {
    // Every child is awaited (including failure settlement) before removing its working directory.
    rmSync(root, { recursive: true, force: true });
  }
}, 600_000);
