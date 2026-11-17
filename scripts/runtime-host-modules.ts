import { pathToFileURL } from "node:url";
import type { Plugin } from "vite";
import { hostModules } from "../src/shared/host-modules.ts";

const id = "virtual:asterism/runtime-host-modules", resolvedId = `\0${id}`;

/**
 * Supplies the file URL of each backend host module. In builds, bundled modules are emitted as their own chunks that
 * re-export the host's instances, and externalized packages load from node_modules. Plugin imports resolve to these
 * real files, so import, require, and namespace identity follow ordinary module semantics. Served graphs (tests) use
 * the resolved source files directly.
 */
export function runtimeHostModules(): Plugin {
  const references = new Set<string>();
  let building = false;
  return {
    name: "asterism-runtime-host-modules",
    enforce: "pre",
    configResolved(config) { building = config.command === "build"; },
    resolveId(source) { if (source === id) return resolvedId; },
    async load(source) {
      if (source !== resolvedId) return;
      const entries = await Promise.all(hostModules.runtime.map(async specifier => {
        const resolved = await this.resolve(specifier, undefined, { skipSelf: true });
        if (!resolved) throw new Error(`Host module ${specifier} cannot be resolved.`);
        const key = JSON.stringify(specifier);
        if (!building) return `${key}: ${JSON.stringify(pathToFileURL(resolved.id).href)}`;
        if (resolved.external) return `${key}: import.meta.resolve(${key})`;
        const reference = this.emitFile({ type: "chunk", id: resolved.id, preserveSignature: "strict",
          name: `host/${specifier.replace(/[^a-z0-9]+/giu, "-").replace(/^-|-$/gu, "")}` });
        references.add(reference);
        return `${key}: import.meta.ROLLUP_FILE_URL_${reference}`;
      }));
      return `export default {${entries.join(", ")}};`;
    },
    resolveFileUrl({ referenceId, relativePath }) {
      if (references.has(referenceId)) return `new URL(${JSON.stringify(relativePath)}, import.meta.url).href`;
    },
  };
}
