import { defineConfig } from "vitest/config";
import { testSourceGlob } from "./src/shared/runtime-modules.ts";
import { sharedUiModules } from "./scripts/shared-ui-modules.ts";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [sharedUiModules(resolve("packages/ui"))],
  // Shares automatic JSX runtime with renderer builds; tests check view dispatch only without mounting GUI.
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    include: ["src", "packages", "scripts"].map(directory => `${directory}/${testSourceGlob}`),
  },
});
