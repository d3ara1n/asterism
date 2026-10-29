import { describe, expect, it } from "vitest";
import { exportedModules } from "./shared-ui-modules.ts";

describe("Shared package module discovery", () => {
  it("expands public exports while excluding tests and unexported source files", () => {
    const metadata = { name: "@example/ui", exports: {
      "./count": "./src/count.ts",
      "./ui/*": "./src/ui/*.tsx",
    } };
    const modules = exportedModules(metadata, [
      "./src/count.ts", "./src/count.test.ts", "./src/private.ts",
      "./src/ui/button.tsx", "./src/ui/button.test.tsx", "./src/ui/form/input.tsx",
    ]);
    expect([...modules]).toEqual([
      ["@example/ui/count", "./src/count.ts"],
      ["@example/ui/ui/button", "./src/ui/button.tsx"],
      ["@example/ui/ui/form/input", "./src/ui/form/input.tsx"],
    ]);
  });

  it("reports an explicitly exported test instead of silently removing the public entry", () => {
    expect(() => exportedModules({ name: "example", exports: { "./oops": "./src/helper.test.ts" } }, []))
      .toThrow("Runtime entry imports a test module: ./src/helper.test.ts");
  });

  it("keeps explicit exports for the bundler to resolve even when discovery has no file entry", () => {
    expect([...exportedModules({ name: "example", exports: { ".": "./src/index.ts" } }, [])])
      .toEqual([["example", "./src/index.ts"]]);
  });
});
