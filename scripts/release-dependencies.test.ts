import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { dependencyExclusions, runtimeDependencyNames } from "./release-dependencies.ts";

const scratch: string[] = [];
afterEach(() => { for (const root of scratch.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "asterism-release-deps-"));
  scratch.push(root);
  function json(file: string, value: object) {
    const path = join(root, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(value));
  }
  return { root, json };
}

it("retains nested runtime and peer packages while excluding packages used only by the browser build", () => {
  const { root, json } = fixture();
  json("packages/builtin/node_modules/runtime/package.json", { dependencies: { inner: "1" }, peerDependencies: { peer: "1" } });
  json("packages/builtin/node_modules/runtime/node_modules/inner/package.json", { optionalDependencies: { "foreign-native": "1" } });
  json("node_modules/peer/package.json", {});
  json("node_modules/runtime/package.json", { dependencies: { "renderer-leaf": "1" } });
  json("package-lock.json", { packages: {
    "node_modules/browser": {}, "node_modules/renderer-leaf": {}, "node_modules/peer": {}, "node_modules/foreign-native": {},
    "packages/builtin/node_modules/runtime": {}, "packages/builtin/node_modules/runtime/node_modules/inner": {},
  } });
  const used = runtimeDependencyNames([{ directory: join(root, "packages/builtin"), imports: ["runtime/entry"] }]);
  expect(dependencyExclusions(join(root, "package-lock.json"), used)).toEqual([
    "!**/node_modules/browser{,/**}", "!**/node_modules/renderer-leaf{,/**}",
  ]);
});

it("does not treat a missing required package as a platform optional dependency", () => {
  const { root, json } = fixture();
  json("node_modules/launcher/package.json", { dependencies: { "missing-test-runtime-library": "1" } });
  expect(() => runtimeDependencyNames([{ directory: root, imports: ["launcher"] }]))
    .toThrow("Runtime dependency missing-test-runtime-library is not installed");
});
