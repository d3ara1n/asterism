import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { BuiltPackage } from "./packages.ts";
import { artifactPath } from "./artifact-resolver.ts";
import { pathWithin } from "../storage/paths.ts";

let hooks: ReturnType<typeof registerHooks> | undefined;
/**
 * Each process captures one graph. Only the peer imports recorded in a plugin's artifact are remapped: host modules to
 * the host's own module files, plugin-public modules to the provider's entry files. Everything else, including
 * private dependencies of the plugin, resolves through Node from the package. Every target is a real module file, so
 * import, require, live bindings, and namespace identity keep their ordinary semantics.
 */
export function registerArtifactModules(packages: readonly BuiltPackage[], hostModules: Readonly<Record<string, string>>): void {
  hooks?.deregister();
  const providers = new Map<string, string>();
  for (const item of packages) if (item.status === "ready" && item.artifact && item.artifactRoot)
    for (const [specifier, path] of Object.entries(item.artifact.public.runtime)) providers.set(specifier, pathToFileURL(artifactPath(item.artifactRoot, path)).href);
  const roots = packages.filter(item => item.artifactRoot).map(item => ({ root: item.artifactRoot!, item }))
    .sort((a, b) => b.root.length - a.root.length);
  hooks = registerHooks({ resolve(specifier, context, nextResolve) {
    const parent = context.parentURL?.startsWith("file:") ? fileURLToPath(context.parentURL) : undefined;
    const owner = parent ? roots.find(entry => pathWithin(entry.root, parent) !== null)?.item : undefined;
    if (!owner?.artifact) return nextResolve(specifier, context);
    if (!owner.artifact.imports.runtime.includes(specifier)) {
      // Another plugin's public module reached without a peer declaration would otherwise load a private copy.
      if (providers.has(specifier) && !Object.hasOwn(owner.artifact.public.runtime, specifier))
        throw new Error(`Public import ${specifier} is not declared as a peer dependency of ${owner.manifest!.id}.`);
      return nextResolve(specifier, context);
    }
    const url = hostModules[specifier] ?? providers.get(specifier);
    if (!url) throw new Error(`Public module ${specifier} has no available enabled provider in runtime.`);
    return { url, shortCircuit: true };
  } });
}
export function artifactRoots(packages: readonly BuiltPackage[]): Record<string, string> {
  return Object.fromEntries(packages.flatMap(item => item.artifactKey && item.artifactRoot ? [[item.artifactKey, item.artifactRoot]] : []));
}
/** Browser public bindings use exact artifact URLs; host facades are added by the page before import. */
export function rendererImportMap(packages: readonly BuiltPackage[]): Record<string, string> {
  return Object.fromEntries(packages.flatMap(item => item.status === "ready" && item.artifact && item.artifactKey
    ? Object.entries(item.artifact.public.renderer).map(([specifier, path]) => [specifier, `asterism-plugin://${item.artifactKey}/${path}`]) : []));
}
