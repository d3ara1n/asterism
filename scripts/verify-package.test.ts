import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { verifyPackagedPlugins } from "./verify-package.ts";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "asterism-package-")); roots.push(root);
  const file = (path: string, content: string) => {
    const target = join(root, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  };
  file("packages/plugin/package.json", JSON.stringify({
    name: "@example/plugin", asterism: { id: "example.plugin", artifact: "dist/plugin.json", publicPackages: ["@example/api"] },
  }));
  file("packages/plugin/dist/plugin.json", JSON.stringify({ format: 1, build: "builds/first" }));
  file("packages/plugin/dist/builds/first/artifact.json", JSON.stringify({ format: 1, id: "example.plugin", buildId: "first",
    runtime: "backend/runtime.mjs", public: { runtime: {}, renderer: {} }, imports: { runtime: [], renderer: [] }, runtimeExternals: [], stylesheets: [] }));
  file("packages/plugin/dist/builds/first/backend/runtime.mjs", "export default {};");
  return { root, file };
}

describe("Packaged plugin assets", () => {
  it("checks the resolved public library even when a complete workspace copy is present", () => {
    const { root, file } = fixture();
    const metadata = JSON.stringify({ name: "@example/api", asterism: { manual: ["examples"] } });
    file("packages/api/package.json", metadata);
    file("packages/api/examples/usage.ts", "export {};");
    file("node_modules/@example/api/package.json", metadata);
    expect(() => verifyPackagedPlugins(root)).toThrow("Packaged manual directory is missing: @example/api");
    file("node_modules/@example/api/examples/usage.ts", "export {};");
    expect(() => verifyPackagedPlugins(root)).not.toThrow();
  });

  it("fails when an executable entry is omitted from the package", () => {
    const { root } = fixture();
    rmSync(join(root, "packages/plugin/dist/builds/first/backend/runtime.mjs"));
    expect(() => verifyPackagedPlugins(root)).toThrow("Packaged entry is missing: @example/plugin");
  });

  it("fails when a declared public library cannot be resolved", () => {
    const { root } = fixture();
    expect(() => verifyPackagedPlugins(root)).toThrow("Packaged public library is missing: @example/plugin -> @example/api");
  });
});
