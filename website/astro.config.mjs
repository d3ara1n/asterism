import { defineConfig } from "astro/config";

// GitHub Pages serves either a custom domain at "/" or a project path such as "/asterism/".
export default defineConfig({
  site: process.env.SITE_URL ?? "https://asterism.dearain.dev",
  base: process.env.SITE_BASE ?? "/",
  trailingSlash: "always",
  i18n: {
    locales: ["en", "zh"],
    defaultLocale: "en",
    routing: { prefixDefaultLocale: false },
  },
});
