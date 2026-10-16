import { defineConfig } from "vitest/config";

export default defineConfig({
  // 与 renderer 构建共用自动 JSX runtime；测试只检查视图分派，不挂载 GUI。
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "packages/**/*.test.ts"],
  },
});
