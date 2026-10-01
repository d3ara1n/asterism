import { resolve } from "node:path";
import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  main: {
    build: {
      outDir: resolve("dist/main"),
      rollupOptions: {
        input: { index: resolve("src/main/index.ts"), runtime: resolve("src/runtime/index.ts") },
        output: { format: "es", entryFileNames: "[name].js" },
      },
    },
  },
  preload: {
    build: {
      outDir: resolve("dist/preload"),
      externalizeDeps: false,
      rollupOptions: {
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
        name: "weft-development-csp",
        apply: "serve",
        // React Fast Refresh 的开发入口包含内联 preamble；发布构建不放宽脚本策略。
        transformIndexHtml: html => html.replace("script-src 'self';", "script-src 'self' 'unsafe-inline';"),
      },
    ],
    server: { host: "127.0.0.1" },
    build: { outDir: resolve("dist/renderer"), minify: true, rollupOptions: { input: resolve("src/renderer/index.html") } },
  },
});
