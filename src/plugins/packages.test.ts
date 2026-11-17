import { mkdirSync, mkdtempSync, rmSync, writeFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PackageList, readManifest, readPackageMetadata, packageRoot } from "./packages.ts";
import sdkMetadata from "@asterism-app/sdk/package.json" with { type: "json" };

const roots: string[] = [];
afterEach(() => { for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true }); });
function temp() { const r = mkdtempSync(join(tmpdir(), "plugin-pkg-")); roots.push(r); return r; }
function pkg(root: string, asterism: object | undefined) {
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "x", version: "1.0.0", peerDependencies: { "@asterism-app/sdk": `^${sdkMetadata.version}` },
    ...(asterism && { asterism: { displayName: "Test plugin", artifact: "dist/plugin.json", ...asterism } }) }));
  if (asterism && "id" in asterism) {
    mkdirSync(join(root, "dist/builds/unit"), { recursive: true });
    writeFileSync(join(root, "dist/plugin.json"), JSON.stringify({ format: 1, build: "builds/unit" }));
    writeFileSync(join(root, "dist/builds/unit/artifact.json"), JSON.stringify({ format: 1, id: (asterism as { id: string }).id, buildId: "unit",
      public: { runtime: {}, renderer: {} }, imports: { runtime: [], renderer: [] }, runtimeExternals: [], stylesheets: [] }));
  }
}

describe("Plugin packages", () => {
  // Manual entries expose only declared package subdirectories; overlapping roots and escaping symlinks are ambiguous or broaden exposure.
  it("validates documentation directories independently of executable entries", () => {
    const root = temp(), outside = temp();
    mkdirSync(join(root, "docs/examples"), { recursive: true });
    mkdirSync(join(root, "examples"));
    const manifest = (manual: string[]) => { pkg(root, { id: "example.manual", manual }); return readManifest(root); };
    expect(manifest(["docs", "examples"]).manual).toEqual(["docs", "examples"]);
    for (const paths of [["."], ["../outside"], ["/absolute"], ["C:\\outside"], ["docs/../examples"], ["missing"],
      ["docs", "docs"], ["docs", "docs/examples"]])
      expect(() => manifest(paths)).toThrow();
    symlinkSync(outside, join(root, "external"));
    expect(() => manifest(["external"])).toThrow("inside the package");
    writeFileSync(join(root, "article.md"), "Article");
    expect(() => manifest(["article.md"])).toThrow("directory");
  });

  // Information cards must load without executing entries, including entries that would throw during import.
  it("metadata reads use the package version and do not execute plugin code", () => {
    const root = temp();
    writeFileSync(join(root, "package.json"), JSON.stringify({
      name: "@example/info", version: "1.2.3", description: "Package description", author: { name: "Author" },
      peerDependencies: { "@asterism-app/sdk": "^0.1.0" },
      asterism: { id: "example.info", displayName: "Display name", icon: "icon.svg", artifact: "dist/plugin.json", build: { runtime: "runtime.ts" } },
    }));
    writeFileSync(join(root, "runtime.ts"), 'throw new Error("Must not execute.");');
    writeFileSync(join(root, "icon.svg"), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    expect(readManifest(root).id).toBe("example.info");
    expect(readPackageMetadata(root)).toEqual({
      name: "Display name", description: "Package description", version: "1.2.3", author: "Author",
      icon: `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString("base64")}`,
    });
  });
  it("accepts package roots only; adding directories without manifests fails without retaining entries", () => {
    const data = temp(); const dir = temp();
    const list = new PackageList(join(data, "plugins.json"));
    expect(() => list.add({ source: { kind: "path", path: dir } }, data)).toThrow();
    pkg(dir, undefined);
    expect(() => list.add({ source: { kind: "path", path: dir } }, data)).toThrow();
    expect(list.read()).toEqual([]);
  });
  it("replaces one selection without admitting a duplicate ID or changing a rejected list", () => {
    const data = temp(), first = temp(), second = temp(), replacement = temp();
    pkg(first, { id: "example.first" }); pkg(second, { id: "example.second" }); pkg(replacement, { id: "example.first" });
    const list = new PackageList(join(data, "plugins.json"));
    list.add({ source: { kind: "path", path: first } }, data);
    list.add({ source: { kind: "path", path: second } }, data);
    expect(() => list.replace(1, { source: { kind: "path", path: replacement }, enabled: true }, data)).toThrow("already added");
    expect(list.read()[1]!.source).toEqual({ kind: "path", path: second });
    list.replace(0, { source: { kind: "path", path: replacement }, enabled: false }, data);
    expect(list.read()[0]).toEqual({ source: { kind: "path", path: replacement }, enabled: false });
  });

  it("reads unchanged version-2 path, bundled, and legacy npm selections alongside isolated installations", () => {
    const data = temp(), file = join(data, "plugins.json");
    const packages = [
      { source: { kind: "path", path: "/owner/plugin" }, enabled: false },
      { source: { kind: "bundled", name: "builtin" }, enabled: true },
      { source: { kind: "npm", name: "@example/plugin", version: "1.0.0" }, enabled: true },
      { source: { kind: "npm", name: "@example/next", version: "2.0.0", installation: "captured-id" }, enabled: false },
    ];
    writeFileSync(file, JSON.stringify({ version: 2, packages }));
    const entries = new PackageList(file).read();
    expect(entries).toEqual(packages);
    expect(packageRoot(entries[2]!, data)).toBe(join(data, "node_modules/@example/plugin"));
    expect(packageRoot(entries[3]!, data)).toBe(join(data, "installations/captured-id/node_modules/@example/next"));
  });

});
