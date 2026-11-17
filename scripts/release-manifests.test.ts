import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect, it } from "vitest";
import { releasedExample, writeReleaseVersions } from "./release-manifests.ts";
import { needsPackagePublication, releaseCatalogue } from "./release-registry.ts";

it("updates only release-owned example development pins, retaining compatibility and ordinary dependencies", () => {
  expect(releasedExample({ name: "example", private: true,
    peerDependencies: { sdk: "^1" }, devDependencies: { sdk: "1.0.0", builder: "0.1.0", typescript: "^7.0.2" },
  }, new Map([["sdk", "1.2.0"], ["builder", "0.2.0"]]))).toEqual({ name: "example", private: true,
    peerDependencies: { sdk: "^1" }, devDependencies: { sdk: "1.2.0", builder: "0.2.0", typescript: "^7.0.2" },
  });
});

it("writes paired example versions even when reusing an already-published owner version", () => {
  const root = mkdtempSync(join(tmpdir(), "asterism-release-manifests-"));
  const put = (path: string, value: unknown) => { const target = join(root, path); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, JSON.stringify(value)); };
  try {
    put("packages/sdk/package.json", { name: "sdk", version: "0.1.0" });
    put("packages/sdk/examples/counter/package.json", { devDependencies: { sdk: "0.1.0" } });
    writeReleaseVersions(root, [{ directory: "packages/sdk", name: "sdk", version: "1.2.0", publish: false,
      examples: ["packages/sdk/examples/counter/package.json"] }]);
    expect(JSON.parse(readFileSync(join(root, "packages/sdk/package.json"), "utf8")).version).toBe("1.2.0");
    expect(JSON.parse(readFileSync(join(root, "packages/sdk/examples/counter/package.json"), "utf8")).devDependencies.sdk).toBe("1.2.0");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

it("reuses an interrupted publication only when registry source identity agrees", () => {
  expect(needsPackagePublication("sdk", "1.2.0", {}, "candidate")).toBe(true);
  expect(needsPackagePublication("sdk", "1.2.0", { "1.2.0": "candidate" }, "candidate")).toBe(false);
  for (const published of ["another-source", null])
    expect(() => needsPackagePublication("sdk", "1.2.0", { "1.2.0": published }, "candidate")).toThrow("without matching source");
});

it("rejects a pre-artifact candidate instead of attempting to read a package it never contained", () => {
  expect(() => releaseCatalogue({})).toThrow("Select a candidate produced by the explicit plugin-artifact release flow");
});
