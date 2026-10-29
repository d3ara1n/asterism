import { resolve } from "node:path";
import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { applicationBrand } from "./src/shared/application.ts";
import { coreId } from "./src/shared/core.ts";

export default defineConfig({
  main: {
    build: {
      // Workspace source packages are compiled statically with the app; release artifacts do not read repository .ts files at runtime.
      externalizeDeps: {
        exclude: ["@asterism-app/sdk", "@asterism-app/builtin-api", "@asterism-app/builtin", "@asterism-app/ui"],
        include: ["node-pty", "@xterm/headless", "@xterm/addon-serialize", "@vscode/ripgrep"],
      },
      outDir: resolve("dist/main"),
      rolldownOptions: {
        input: { index: resolve("src/main/index.ts"), runtime: resolve("src/runtime/index.ts"), "prepare-data": resolve("src/runtime/prepare-data.ts") },
        // Package asset resolution uses the same two-level depth as src/plugins and src/runtime.
        output: { format: "es", entryFileNames: "[name].js", chunkFileNames: "[name]-[hash].js" },
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
        // The React Fast Refresh development entry includes an inline preamble; release builds keep the script policy unchanged.
        transformIndexHtml: html => html.replace("script-src 'self' asterism-plugin:;", "script-src 'self' asterism-plugin: 'unsafe-inline';"),
      },
    ],
    server: { host: "127.0.0.1" },
    build: { outDir: resolve("dist/renderer"), minify: true, rolldownOptions: { input: resolve("src/renderer/index.html") } },
  },
});
