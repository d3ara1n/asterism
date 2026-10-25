import { resolve } from "node:path";
import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { applicationBrand } from "./src/shared/application.ts";
import { coreId } from "./src/shared/core.ts";

export default defineConfig({
  main: {
    build: {
      // 工作区源码包随应用静态编译，发布产物不在运行时读取仓库中的 .ts。
      externalizeDeps: {
        exclude: ["@atelier/sdk", "@atelier/builtin-api", "@atelier/builtin", "@atelier/ui"],
        include: ["node-pty", "@xterm/headless", "@xterm/addon-serialize", "@vscode/ripgrep"],
      },
      outDir: resolve("dist/main"),
      rolldownOptions: {
        input: { index: resolve("src/main/index.ts"), runtime: resolve("src/runtime/index.ts") },
        output: { format: "es", entryFileNames: "[name].js" },
      },
    },
  },
  preload: {
    build: {
      outDir: resolve("dist/preload"),
      externalizeDeps: false,
      rolldownOptions: {
        input: resolve("src/preload/index.ts"),
        output: { format: "cjs", entryFileNames: "index.cjs" },
      },
    },
  },
  renderer: {
    root: "src/renderer",
    resolve: { alias: { "@": resolve("src/renderer") } },
    plugins: [
      react(), tailwindcss(),
      {
        name: "application-title",
        transformIndexHtml: {
          order: "pre",
          handler: html => html.replace("%APPLICATION_TITLE%", `${applicationBrand.en} · ${applicationBrand.zh}`),
        },
      },
      {
        name: coreId("development-csp"),
        apply: "serve",
        // React Fast Refresh 的开发入口包含内联 preamble；发布构建不放宽脚本策略。
        transformIndexHtml: html => html.replace("script-src 'self' atelier-plugin:;", "script-src 'self' atelier-plugin: 'unsafe-inline';"),
      },
    ],
    server: { host: "127.0.0.1" },
    build: { outDir: resolve("dist/renderer"), minify: true, rolldownOptions: { input: resolve("src/renderer/index.html") } },
  },
});
