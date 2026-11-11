import { mkdirSync, mkdtempSync, rmSync, writeFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PackageList, readManifest, readPackageMetadata } from "./packages.ts";
import sdkMetadata from "@asterism-app/sdk/package.json" with { type: "json" };

const roots: string[] = [];
afterEach(() => { for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true }); });
function temp() { const r = mkdtempSync(join(tmpdir(), "plugin-pkg-")); roots.push(r); return r; }
function pkg(root: string, asterism: object | undefined) {
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "x", version: "1.0.0", peerDependencies: { "@asterism-app/sdk": `^${sdkMetadata.version}` },
    ...(asterism && { asterism: { displayName: "Test plugin", ...asterism } }) }));
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
      asterism: { id: "example.info", displayName: "Display name", icon: "icon.svg", runtime: "runtime.ts" },
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
});
