import { describe, expect, it } from "vitest";
import { assertRuntimeModules, isTestFile } from "./runtime-modules.ts";

describe("Runtime module boundaries", () => {
  it("recognizes test sources through platform paths and bundler query suffixes", () => {
    for (const path of ["/project/ui/count.test.ts", "C:\\project\\ui\\card.test.tsx?used", "src/helpers.test.mjs", "fixtures/input.test.json"]) {
      expect(isTestFile(path)).toBe(true);
      expect(() => assertRuntimeModules([path])).toThrow("Runtime entry imports a test module");
    }
    expect(() => assertRuntimeModules(["/project/src/test-data.ts", "/project/src/count.ts", "src/testimony.tsx"])).not.toThrow();
  });

  it("rejects the test runner as a package import or resolved dependency", () => {
    for (const path of ["vitest", "vitest/config", "@vitest/runner", "/project/node_modules/vitest/dist/index.js",
      "C:\\project\\node_modules\\@vitest\\expect\\index.js"])
      expect(() => assertRuntimeModules([path])).toThrow("Runtime entry imports a test module");
    expect(() => assertRuntimeModules(["/project/src/vitest-notes.ts", "/project/node_modules/react/index.js"])).not.toThrow();
  });
});
