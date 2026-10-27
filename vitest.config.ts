import { defineConfig } from "vitest/config";

export default defineConfig({
  // Shares automatic JSX runtime with renderer builds; tests check view dispatch only without mounting GUI.
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "packages/**/*.test.ts", "scripts/**/*.test.ts"],
  },
});
