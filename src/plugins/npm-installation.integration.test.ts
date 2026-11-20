import { expect, test } from "vitest";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { once } from "node:events";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NpmInstallations } from "./npm-installation.ts";
import { createNpmProcess } from "./npm-process.ts";

/** Opt-in smoke test of the shipped process boundary, not the installer state machine. */
test("bundled pnpm runs a dependency script only after approval, without system Node or npm", async () => {
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
      dependencies: { "fixture-native": "1.0.0" },
    }, {
      "dist/artifact.json": JSON.stringify({ format: 2, id: "fixture.plugin", runtime: "runtime.mjs", public: { runtime: {}, renderer: {} }, imports: { runtime: [], renderer: [] }, stylesheets: [] }),
      "dist/runtime.mjs": "throw new Error('Installation must never import plugin code');\n",
    });
    const home = join(root, "home"), temp = join(root, "tmp"), systemBin = join(root, "system-bin");
    for (const directory of [home, temp, systemBin]) mkdirSync(directory);
    if (process.platform !== "win32") symlinkSync("/bin/sh", join(systemBin, "sh"));
    // Metadata survives a store change, so isolate config and cache for every pnpm command, including preview.
    const env: NodeJS.ProcessEnv = {
      PATH: systemBin, ELECTRON_RUN_AS_NODE: "1", HOME: home, USERPROFILE: home,
      TMPDIR: temp, TMP: temp, TEMP: temp,
      XDG_CONFIG_HOME: join(root, "config"), XDG_CACHE_HOME: join(root, "cache"),
      XDG_DATA_HOME: join(root, "data"), XDG_STATE_HOME: join(root, "state"),
      npm_config_userconfig: join(home, ".npmrc"), npm_config_globalconfig: join(home, "global.npmrc"),
      ...(process.platform === "win32" ? { SystemRoot: process.env.SystemRoot, ComSpec: process.env.ComSpec,
        PATHEXT: process.env.PATHEXT, APPDATA: home, LOCALAPPDATA: home } : {}),
    };
    const executable = createRequire(import.meta.url)("electron") as string;
    const owned = createNpmProcess(undefined, { executable, env });
    let installation: string | undefined;
    const flags = [`--registry=${registry}`, `--store-dir=${join(root, "store")}`, "--fetch-retries=0", "--config.update-notifier=false"];
    manager = new NpmInstallations({ npmRoot: join(root, "managed"),
      process: { run(args, cwd, ...rest) {
        if (args[0] === "install") installation = cwd;
        return owned.run([...args, ...flags], cwd, ...rest);
      } },
      publish() {},
    });
    manager.preview("fixture-plugin@latest"); await manager.settled();
    expect(manager.snapshot(), JSON.stringify(manager.snapshot())).toMatchObject({ phase: "preview", preview: { name: "fixture-plugin", version: "1.0.0" } });
    const id = manager.snapshot()!.id; manager.install(id); await manager.settled();
    expect(manager.snapshot(), JSON.stringify(manager.snapshot())).toMatchObject({ phase: "awaiting-approval", blockedBuilds: ["fixture-native@1.0.0"] });
    if (!installation) throw new Error("Missing installation directory.");
    const scriptMarker = join(installation, "node_modules/.pnpm/fixture-native@1.0.0/node_modules/fixture-native/script-built.txt");
    expect(existsSync(scriptMarker)).toBe(false);
    manager.approve(id, ["fixture-native@1.0.0"]); await manager.settled();
    expect(manager.snapshot(), JSON.stringify(manager.snapshot())).toMatchObject({ phase: "succeeded" });
    expect(readFileSync(scriptMarker, "utf8")).toBe("approved");
  } finally {
    await manager?.close();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    rmSync(root, { recursive: true, force: true });
  }
}, 60_000);
