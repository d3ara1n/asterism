import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";
import type { BuiltPackage } from "./packages.ts";
import { artifactPath } from "./artifact-resolver.ts";
import { pathWithin } from "../storage/paths.ts";

import { hostModuleSource } from "../shared/public-modules.ts";

const hostKey = "__asterismSharedModules";
const packageName = (specifier: string) => /^(?:@[^/]+\/)?[^/]+/u.exec(specifier)?.[0];
let hooks: ReturnType<typeof registerHooks> | undefined;
/** Each process captures one graph; native linking preserves provider re-exports and mutable ESM bindings. */
export function registerArtifactModules(packages: readonly BuiltPackage[], shared: Record<string, Record<string, unknown>>): void {
  hooks?.deregister();
  (globalThis as Record<string, unknown>)[hostKey] = shared;
  const hosts = new Map(Object.entries(shared).map(([name, exports]) => [name,
    `data:text/javascript,${encodeURIComponent(hostModuleSource(hostKey, name, Object.keys(exports)))}`]));
  const providers = new Map<string, string>();
  for (const item of packages) if (item.status === "ready" && item.artifact && item.artifactRoot)
    for (const [specifier, path] of Object.entries(item.artifact.public.runtime)) providers.set(specifier, pathToFileURL(artifactPath(item.artifactRoot, path)).href);
  const roots = packages.filter(item => item.artifactRoot).map(item => ({ root: item.artifactRoot!, item }))
    .sort((a, b) => b.root.length - a.root.length);
  hooks = registerHooks({ resolve(specifier, context, nextResolve) {
    const parent = context.parentURL?.startsWith("file:") ? fileURLToPath(context.parentURL) : undefined;
    const owner = parent && roots.find(entry => pathWithin(entry.root, parent) !== null)?.item;
    if (!owner) return nextResolve(specifier, context);
    const host = hosts.get(specifier);
    if (host) return { url: host, shortCircuit: true };
    if (owner.artifact?.imports.runtime.includes(specifier)) {
      const publicURL = providers.get(specifier);
      if (publicURL) return { url: publicURL, shortCircuit: true };
      throw new Error(`Public module ${specifier} has no available enabled provider in runtime.`);
    }
    // Anchor external package resolution at the original installation, retaining Node import/require conditions.
    if (owner.artifact?.runtimeExternals.some(request => request === specifier || request === packageName(specifier)))
      return nextResolve(specifier, { ...context, parentURL: pathToFileURL(join(owner.root, "package.json")).href });
    if (providers.has(specifier)) throw new Error(`Public import ${specifier} is not recorded by ${owner.manifest!.id}.`);
    return nextResolve(specifier, context);
  } });
}
export function artifactRoots(packages: readonly BuiltPackage[]): Record<string, string> {
  return Object.fromEntries(packages.flatMap(item => item.artifactKey && item.artifactRoot ? [[item.artifactKey, item.artifactRoot]] : []));
}
/** Browser public bindings use exact immutable artifact URLs; host facades are added by the page before import. */
export function rendererImportMap(packages: readonly BuiltPackage[]): Record<string, string> {
  return Object.fromEntries(packages.flatMap(item => item.status === "ready" && item.artifact && item.artifactKey
    ? Object.entries(item.artifact.public.renderer).map(([specifier, path]) => [specifier, `asterism-plugin://${item.artifactKey}/${path}`]) : []));
}
