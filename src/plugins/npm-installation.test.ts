import { afterEach, expect, test } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";
import { NpmInstallations, blockedBuilds, resolvedPreview, registrySpec, collectManagedInstallations, type ManagedNpmSource } from "./npm-installation.ts";
import type { NpmProcess, NpmProcessResult } from "./npm-process.ts";

const directories: string[] = [];
function temporary() { const root = mkdtempSync(join(tmpdir(), "asterism-npm-")); directories.push(root); return root; }
afterEach(() => { for (const root of directories.splice(0)) rmSync(root, { recursive: true, force: true }); });
function previewFixture(directory: string) {
  writeFileSync(join(directory, "package.json"), JSON.stringify({ private: true, dependencies: { "test-plugin": "2.0.0" } }));
  writeFileSync(join(directory, "pnpm-lock.yaml"), "packages:\n  test-plugin@2.0.0:\n    resolution:\n      integrity: sha512-registry-integrity\n");
  return ok;
}
const ok: NpmProcessResult = { code: 0, stdout: "", stderr: "" };
function installed(directory: string, options: { version?: string; id?: string; missingArtifact?: boolean } = {}) {
  const root = join(directory, "node_modules/test-plugin"); mkdirSync(join(root, "dist"), { recursive: true });
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "test-plugin", version: options.version ?? "2.0.0", asterism: { id: options.id ?? "test.plugin", displayName: "Test" } }));
  if (!options.missingArtifact) writeFileSync(join(root, "dist/artifact.json"), JSON.stringify({ format: 2, id: options.id ?? "test.plugin", public: { runtime: {}, renderer: {} }, imports: { runtime: [], renderer: [] }, stylesheets: [] }));
  writeFileSync(join(directory, "pnpm-lock.yaml"), "packages:\n  test-plugin@2.0.0:\n    resolution:\n      integrity: sha512-registry-integrity\n");
  return root;
}
function fixture(install: NpmProcess["run"], target?: { source: string; name: string; id: string }) {
  const root = temporary();
  const selections: ManagedNpmSource[] = [];
  const manager = new NpmInstallations({ npmRoot: root, process: { run: async (args, ...rest) => args[0] === "add" ? previewFixture(rest[0]) : install(args, ...rest) }, publish(source) { selections.push(source); } });
  manager.preview("test-plugin@latest", target);
  return { root, manager, selections };
}

// Exact identities are taken from package-manager output, not inferred from the user's mutable range.
test("resolved preview requires the exact dependency written by pnpm and its integrity", () => {
  expect(resolvedPreview(JSON.stringify({ dependencies: { "@team/plugin": "1.10.0" } }), "packages:\n  '@team/plugin@1.10.0':\n    resolution:\n      integrity: sha512-expected\n", "@team/plugin")).toEqual({ name: "@team/plugin", version: "1.10.0", description: null, integrity: "sha512-expected" });
  expect(() => resolvedPreview(JSON.stringify({ dependencies: { "test-plugin": "^1.0.0" } }), "packages: {}", "test-plugin")).toThrow();
  expect(registrySpec(" @team/plugin@^1.2.0 ")).toBe("@team/plugin@^1.2.0");
  expect(registrySpec("test-plugin@>=1.0.0 <2.0.0")).toBe("test-plugin@>=1.0.0 <2.0.0");
  for (const spec of ["--registry=private", "./plugin", "file:plugin", "https://host/pkg.tgz", "test-plugin@npm:other", "test-plugin@a\nignored"]) expect(() => registrySpec(spec)).toThrow();
});

test("blocked build paths retain exact versions while deduplicating peer variants", () => {
  expect(blockedBuilds("ignoredBuilds:\n  - '@team/native@1.2.3(peer@1.0.0)'\n  - '@team/native@1.2.3(peer@2.0.0)'\n  - 'native@4.0.0'\n")).toEqual(["@team/native@1.2.3", "native@4.0.0"]);
});

test("a successful validated installation publishes exact identity but leaves active old files intact", async () => {
  let directory = "";
  const { root, manager, selections } = fixture(async (_args, cwd) => { directory = cwd; installed(cwd); return ok; });
  const old = join(root, "installations/11111111-1111-4111-8111-111111111111"); mkdirSync(old, { recursive: true }); writeFileSync(join(old, "active"), "still running");
  await manager.settled(); manager.install(manager.snapshot()!.id); await manager.settled();
  expect(selections).toEqual([{ kind: "npm", name: "test-plugin", version: "2.0.0", installation: directory.split(/[\\/]/u).at(-1) }]);
  expect(readFileSync(join(old, "active"), "utf8")).toBe("still running");
  expect(JSON.parse(readFileSync(join(directory, "package.json"), "utf8"))).toEqual({ private: true, dependencies: { "test-plugin": "2.0.0" } });
  expect(manager.snapshot()?.phase).toBe("succeeded");
});

for (const failure of ["process", "artifact", "version", "plugin-id", "integrity", "publish"] as const) {
  test(`${failure} failure does not replace the selection and removes only the failed staging project`, async () => {
    let directory = "";
    const root = temporary(); const active = join(root, "active"); mkdirSync(active); writeFileSync(join(active, "data"), "retained");
    let selected = "old-installation";
    const manager = new NpmInstallations({ npmRoot: root, process: { async run(args, cwd) {
      if (args[0] === "add") return previewFixture(cwd);
      directory = cwd;
      if (failure === "process") return { code: 1, stdout: "", stderr: "Registry unavailable" };
      installed(cwd, { missingArtifact: failure === "artifact", version: failure === "version" ? "1.0.0" : undefined, id: failure === "plugin-id" ? "different.plugin" : undefined });
      if (failure === "integrity") writeFileSync(join(cwd, "pnpm-lock.yaml"), "packages:\n  test-plugin@2.0.0:\n    resolution:\n      integrity: sha512-different\n");
      return ok;
    } }, publish(source) { if (failure === "publish") throw new Error("Duplicate plugin identity"); selected = source.installation; } });
    manager.preview("test-plugin", { source: "test-plugin@1.0.0", name: "test-plugin", id: "test.plugin" }); await manager.settled();
    manager.install(manager.snapshot()!.id); await manager.settled();
    expect(manager.snapshot()?.phase).toBe("failed"); expect(selected).toBe("old-installation");
    expect(existsSync(directory)).toBe(false); expect(readFileSync(join(active, "data"), "utf8")).toBe("retained");
  });
}

test("script approval persists exact allowBuilds and resumes only after an explicit decision", async () => {
  let directory = "", attempts = 0;
  const { manager, selections } = fixture(async (args, cwd) => {
    directory = cwd; attempts++;
    if (attempts === 3) expect(args).toContain("--frozen-lockfile");
    mkdirSync(join(cwd, "node_modules"), { recursive: true });
    if (attempts === 1) {
      writeFileSync(join(cwd, "node_modules/.modules.yaml"), "ignoredBuilds:\n  - native@1.0.0\n");
      return { code: 1, stdout: "ERR_PNPM_IGNORED_BUILDS", stderr: "" };
    }
    expect(parse(readFileSync(join(cwd, "pnpm-workspace.yaml"), "utf8"))).toMatchObject({ allowBuilds: { "native@1.0.0": true }, strictDepBuilds: true });
    writeFileSync(join(cwd, "node_modules/.modules.yaml"), "ignoredBuilds: []\n"); installed(cwd); return ok;
  });
  await manager.settled(); const id = manager.snapshot()!.id; manager.install(id); await manager.settled();
  expect(manager.snapshot()).toMatchObject({ phase: "awaiting-approval", blockedBuilds: ["native@1.0.0"] });
  expect(attempts).toBe(1); expect(selections).toEqual([]);
  expect(() => manager.approve(id, ["unreviewed@1.0.0"])).toThrow();
  manager.approve(id, ["native@1.0.0"]); await manager.settled();
  expect(selections).toHaveLength(1); expect(existsSync(directory)).toBe(true); expect(manager.snapshot()?.phase).toBe("succeeded");
  const previous = selections[0]!; const oldDirectory = directory;
  manager.preview("test-plugin@2.0.0", { source: "test-plugin@2.0.0", name: "test-plugin", id: "test.plugin", installation: previous.installation, version: previous.version });
  await manager.settled(); manager.install(manager.snapshot()!.id); await manager.settled();
  expect(selections).toHaveLength(2); expect(selections[1]!.installation).not.toBe(previous.installation);
  expect(manager.snapshot()?.phase).toBe("succeeded"); expect(existsSync(oldDirectory)).toBe(true);
});

test("cancellation waits for owned work to settle before removing staging files", async () => {
  let started!: () => void, finish!: () => void, directory = "";
  const ready = new Promise<void>(resolve => { started = resolve; });
  const finished = new Promise<void>(resolve => { finish = resolve; });
  const { manager, selections } = fixture(async (_args, cwd, signal) => { directory = cwd; started(); await finished; signal.throwIfAborted(); return ok; });
  await manager.settled(); const id = manager.snapshot()!.id; manager.install(id); await ready;
  manager.cancel(id); expect(manager.snapshot()?.phase).toBe("cancelling"); expect(existsSync(directory)).toBe(true);
  finish(); await manager.settled(); expect(manager.snapshot()?.phase).toBe("cancelled"); expect(existsSync(directory)).toBe(false); expect(selections).toEqual([]);
});

test("fresh-start collection only reclaims marked application installations, retaining selections and external material", () => {
  const root = temporary();
  const selected = "11111111-1111-4111-8111-111111111111", old = "22222222-2222-4222-8222-222222222222", external = "33333333-3333-4333-8333-333333333333";
  for (const name of [selected, old, external, "user-directory"]) {
    mkdirSync(join(root, "installations", name), { recursive: true });
    if (name !== external) writeFileSync(join(root, "installations", name, "asterism-installation.json"), "{}");
  }
  collectManagedInstallations(root, new Set([selected]));
  expect(existsSync(join(root, "installations", old))).toBe(false);
  for (const name of [selected, external, "user-directory"]) expect(existsSync(join(root, "installations", name))).toBe(true);
});
