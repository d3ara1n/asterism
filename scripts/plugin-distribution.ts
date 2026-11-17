import { readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { pointerSchema } from "@asterism-app/plugin-build/artifact";
import { pathWithin } from "../src/storage/paths.ts";

/** Ship the selected immutable build, not retained local builds from earlier authoring sessions. */
export function pluginDistributionFiles(packageRoot: string): string[] {
  const root = resolve(packageRoot);
  const metadata = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
  const pointerFile = resolve(root, metadata.asterism.artifact);
  if (!pathWithin(root, pointerFile)) throw new Error("Plugin artifact descriptor is outside its package.");
  const pointer = pointerSchema.parse(JSON.parse(readFileSync(pointerFile, "utf8")));
  const directory = resolve(dirname(pointerFile), pointer.build);
  if (!pathWithin(root, directory)) throw new Error("Plugin build is outside its package.");
  const portable = (path: string) => relative(root, path).replaceAll("\\", "/");
  return ["package.json", portable(pointerFile), `${portable(directory)}/**`,
    ...(metadata.asterism.manual ?? []).map((path: string) => `${path}/**`),
    ...Object.values(metadata.asterism.i18n?.catalogs ?? {}) as string[], "!**/*.map"];
}
