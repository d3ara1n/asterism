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
    name: "@example/plugin", dependencies: { "private-lib": "1.0.0" }, asterism: { id: "example.plugin" },
  }));
  file("packages/plugin/dist/artifact.json", JSON.stringify({ format: 2, id: "example.plugin",
    runtime: "backend/runtime.mjs", public: { runtime: { "@example/api/contracts": "backend/public-0.mjs" }, renderer: {} },
    imports: { runtime: [], renderer: [] }, stylesheets: [] }));
  file("packages/plugin/dist/backend/runtime.mjs", "export default {};");
  file("packages/plugin/dist/backend/public-0.mjs", "export {};");
  file("node_modules/private-lib/package.json", JSON.stringify({ name: "private-lib" }));
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
    rmSync(join(root, "packages/plugin/dist/backend/runtime.mjs"));
    expect(() => verifyPackagedPlugins(root)).toThrow("Packaged entry is missing: @example/plugin");
  });

  it("fails when a provided public library cannot be resolved", () => {
    const { root } = fixture();
    expect(() => verifyPackagedPlugins(root)).toThrow("Packaged public library is missing: plugin -> @example/api");
  });

  // Backend output leaves installed packages external; a filtered distribution would fail only at import time.
  it("fails when a runtime dependency is absent from the packaged tree", () => {
    const { root, file } = fixture();
    file("node_modules/@example/api/package.json", JSON.stringify({ name: "@example/api" }));
    rmSync(join(root, "node_modules/private-lib"), { recursive: true });
    expect(() => verifyPackagedPlugins(root)).toThrow("Packaged dependency is missing: @example/plugin -> private-lib");
  });
});
