import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import type { Plugin } from "vite";
import { assertRuntimeModules, isTestFile } from "../src/shared/runtime-modules.ts";
import { pathWithin } from "../src/storage/paths.ts";

interface PackageExports { name: string; exports: Record<string, string> }

/** Expand the package's string subpath exports without evaluating any source module. */
export function exportedModules(metadata: PackageExports, files: readonly string[]): Map<string, string> {
  const modules = new Map<string, string>();
  for (const [key, target] of Object.entries(metadata.exports)) {
    const specifier = key === "." ? metadata.name : `${metadata.name}${key.slice(1)}`;
    if (!target.includes("*")) {
      assertRuntimeModules([target]);
      modules.set(specifier, target);
      continue;
    }
    const [prefix, suffix = ""] = target.split("*");
    for (const file of files) {
      if (isTestFile(file) || !file.startsWith(prefix!) || !file.endsWith(suffix)) continue;
      const capture = file.slice(prefix!.length, file.length - suffix.length);
      modules.set(specifier.replace("*", capture), file);
    }
  }
  return modules;
}

/** Generate static imports from existing package exports for both development and production. */
export function sharedUiModules(packageRoot: string): Plugin {
  const root = resolve(packageRoot), metadataFile = join(root, "package.json");
  const id = "virtual:asterism/shared-ui", resolvedId = `\0${id}`;
  return {
    name: "asterism-shared-ui",
    resolveId(source) { if (source === id) return resolvedId; },
    load(source) {
      if (source !== resolvedId) return;
      this.addWatchFile(metadataFile);
      const metadata: PackageExports = JSON.parse(readFileSync(metadataFile, "utf8"));
      const files = readdirSync(root, { recursive: true, withFileTypes: true })
        .filter(entry => entry.isFile())
        .map(entry => `./${relative(root, join(entry.parentPath, entry.name)).replaceAll("\\", "/")}`)
        .sort();
      const entries = [...exportedModules(metadata, files)];
      return [
        ...entries.map(([name], index) => `import * as module${index} from ${JSON.stringify(name)};`),
        `export default {${entries.map(([name], index) => `${JSON.stringify(name)}: module${index}`).join(",")}};`,
      ].join("\n");
    },
    configureServer(server) {
      server.watcher.add(root);
      server.watcher.on("all", (event, file) => {
        const path = pathWithin(root, file);
        if (path === null || isTestFile(path)) return;
        if (path !== "package.json" && event !== "add" && event !== "unlink") return;
        const module = server.moduleGraph.getModuleById(resolvedId);
        if (module) {
          server.moduleGraph.invalidateModule(module);
          server.ws.send({ type: "full-reload" });
        }
      });
    },
  };
}
