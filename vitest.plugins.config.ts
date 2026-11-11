import { configDefaults, defineConfig } from "vitest/config";
import configuration from "./vitest.config.ts";

export default defineConfig({
  ...configuration,
  test: {
    ...configuration.test,
    include: ["src/plugins/**/*.integration.test.ts"],
    exclude: configDefaults.exclude,
  },
});
