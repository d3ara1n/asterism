import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runtimeImportsFile } from "./bundle-runtime-imports.ts";
import { artifactDirectory } from "@asterism-app/plugin-build/artifact";

/** Ship the package manifest, its completed artifact directory, manuals, and catalogs; sources stay behind. */
export function pluginDistributionFiles(packageRoot: string): string[] {
  const metadata = JSON.parse(readFileSync(resolve(packageRoot, "package.json"), "utf8"));
  return ["package.json", `${artifactDirectory}/**`,
    ...(metadata.asterism.manual ?? []).map((path: string) => `${path}/**`),
    ...Object.values(metadata.asterism.i18n?.catalogs ?? {}) as string[], "!**/*.map", `!**/${runtimeImportsFile}`];
}
