import { expect, test } from "vitest";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { once } from "node:events";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";
import { NpmInstallations, type ManagedNpmSource } from "./npm-installation.ts";
import { createNpmProcess } from "./npm-process.ts";

/** Real pnpm against an isolated local registry; this opt-in suite never publishes or modifies application data. */
test.each(["node", "electron-node"])("%s: pnpm blocks dependency scripts and executes approved pending builds without system Node/npm", async runtime => {
  const root = mkdtempSync(join(tmpdir(), "asterism-npm-registry-"));
  const archives = new Map<string, Buffer>();
  const server = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url!, "http://localhost").pathname);
    if (archives.has(path)) { response.setHeader("content-type", "application/octet-stream"); response.end(archives.get(path)); return; }
    const name = path.split("/")[1];
    const manifest = manifests.get(name);
    if (!manifest) { response.writeHead(404); response.end(JSON.stringify({ error: "not_found" })); return; }
    response.setHeader("content-type", "application/json");
    if (path.endsWith("/1.0.0")) response.end(JSON.stringify(manifest));
    else response.end(JSON.stringify({ name, "dist-tags": { latest: "1.0.0" }, versions: { "1.0.0": manifest }, time: { "1.0.0": "2020-01-01T00:00:00.000Z" } }));
  });
  const manifests = new Map<string, Record<string, unknown>>();
  let manager: NpmInstallations | undefined;
  try {
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    const address = server.address(); if (!address || typeof address === "string") throw new Error("Expected local test registry port.");
    const registry = `http://127.0.0.1:${address.port}`;
    function pack(name: string, metadata: Record<string, unknown>, files: Record<string, string>) {
      const work = join(root, name); const directory = join(work, "package"); mkdirSync(directory, { recursive: true });
      const manifest = { name, version: "1.0.0", ...metadata };
      writeFileSync(join(directory, "package.json"), JSON.stringify(manifest));
      for (const [path, value] of Object.entries(files)) { mkdirSync(join(directory, path, ".."), { recursive: true }); writeFileSync(join(directory, path), value); }
      const archive = join(work, "package.tgz");
      execFileSync("tar", ["-czf", archive, "-C", work, "package"]);
      const bytes = readFileSync(archive); const route = `/files/${name}.tgz`; archives.set(route, bytes);
      manifests.set(name, { ...manifest, dist: { tarball: registry + route, integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}` } });
    }
    pack("fixture-native", { scripts: { install: `node -e "require('node:fs').writeFileSync('script-built.txt', 'approved')"` } }, {});
    pack("fixture-plugin", {
      asterism: { id: "fixture.plugin", displayName: "Fixture" },
      dependencies: { "fixture-native": "1.0.0" }, devDependencies: { "must-not-fetch-dev": "1.0.0" },
    }, {
      "dist/artifact.json": JSON.stringify({ format: 2, id: "fixture.plugin", runtime: "runtime.mjs", public: { runtime: {}, renderer: {} }, imports: { runtime: [], renderer: [] }, stylesheets: [] }),
      "dist/runtime.mjs": "throw new Error('Installation must never import plugin code');\n",
    });
    const systemBin = join(root, "system-bin"); mkdirSync(systemBin);
    if (process.platform !== "win32") symlinkSync("/bin/sh", join(systemBin, "sh"));
    const require = createRequire(import.meta.url);
    const owned = createNpmProcess(undefined, { executable: runtime === "electron-node" ? require("electron") as string : process.execPath,
      env: { ...process.env, PATH: systemBin, ...(runtime === "electron-node" ? { ELECTRON_RUN_AS_NODE: "1" } : {}) } });
    const selected: ManagedNpmSource[] = [];
    // The registry/store flags isolate all test packages and cache while exercising the production launcher/process owner.
    manager = new NpmInstallations({ npmRoot: join(root, "managed"),
      process: { run: (args, ...rest) => owned.run([...args, `--registry=${registry}`, ...(args[0] === "install" ? [`--store-dir=${join(root, "store")}`] : []), "--fetch-retries=0"], ...rest) },
      publish(source) { selected.push(source); },
    });
    manager.preview("fixture-plugin@latest"); await manager.settled();
    expect(manager.snapshot(), JSON.stringify(manager.snapshot())).toMatchObject({ phase: "preview", preview: { name: "fixture-plugin", version: "1.0.0" } });
    const id = manager.snapshot()!.id; manager.install(id); await manager.settled();
    expect(manager.snapshot(), JSON.stringify(manager.snapshot())).toMatchObject({ phase: "awaiting-approval", blockedBuilds: ["fixture-native@1.0.0"] });
    expect(selected).toEqual([]);
    manager.approve(id, ["fixture-native@1.0.0"]); await manager.settled();
    expect(manager.snapshot(), JSON.stringify(manager.snapshot())).toMatchObject({ phase: "succeeded" }); expect(selected).toHaveLength(1);
    const project = join(root, "managed/installations", selected[0]!.installation);
    const scriptMarker = join(project, "node_modules/.pnpm/fixture-native@1.0.0/node_modules/fixture-native/script-built.txt");
    expect(readFileSync(scriptMarker, "utf8")).toBe("approved");
    expect(parse(readFileSync(join(project, "pnpm-workspace.yaml"), "utf8"))).toMatchObject({ strictDepBuilds: true, allowBuilds: { "fixture-native@1.0.0": true } });
    expect(existsSync(join(project, "pnpm-lock.yaml"))).toBe(true);
    expect(existsSync(join(project, "node_modules/.pnpm/must-not-fetch-dev@1.0.0"))).toBe(false);
  } finally {
    await manager?.close();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    rmSync(root, { recursive: true, force: true });
  }
}, 60_000);
