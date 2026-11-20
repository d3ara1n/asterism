import { existsSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";

export interface DistributionManifest {
  name?: string;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
  asterism?: { manual?: string[] };
}

export function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, "utf8")) as T;
}

export function packageName(request: string): string {
  const match = /^(@[\w.-]+\/[\w.-]+|[\w.-]+)(?:\/|$)/u.exec(request);
  if (!match || match[1] === "." || match[1] === "..") throw new Error(`Invalid runtime package request: ${request}`);
  return match[1]!;
}

export function dependencyManifest(root: string, name: string): string | undefined {
  return createRequire(join(resolve(root), "package.json")).resolve.paths(`${name}/`)
    ?.map(directory => join(directory, name, "package.json")).find(existsSync);
}

export interface RuntimeRoots { directory: string; imports: readonly string[] }

/** Walk the installed lockfile resolution, preserving transitive, optional, and peer dependencies.
 * Return names because electron-builder chooses the final hoisted placement of each version. */
export function runtimeDependencyNames(roots: readonly RuntimeRoots[]): Set<string> {
  return walkRuntimeDependencies(roots, (directory, name) => {
    const file = dependencyManifest(directory, name);
    return file && realpathSync(file);
  }, readJson<DistributionManifest>);
}

export function walkRuntimeDependencies(roots: readonly RuntimeRoots[],
  locate: (directory: string, name: string) => string | undefined,
  manifest: (file: string) => DistributionManifest, verifyInstalledPeers = true): Set<string> {
  const names = new Set<string>();
  const visited = new Set<string>();
  function visit(directory: string, name: string, optional: boolean) {
    const found = locate(directory, name);
    // Keep platform optional names even if this build host has not installed them.
    names.add(name);
    if (!found) {
      if (optional) return;
      throw new Error(`Runtime dependency ${name} is not installed from ${directory}.`);
    }
    if (visited.has(found)) return;
    visited.add(found);
    const { dependencies, optionalDependencies, peerDependencies, peerDependenciesMeta } = manifest(found);
    const root = dirname(found);
    for (const dependency of Object.keys(dependencies ?? {})) visit(root, dependency, Object.hasOwn(optionalDependencies ?? {}, dependency));
    for (const dependency of Object.keys(optionalDependencies ?? {})) visit(root, dependency, true);
    for (const peer of Object.keys(peerDependencies ?? {})) visit(root, peer, !verifyInstalledPeers || peerDependenciesMeta?.[peer]?.optional === true);
  }
  for (const root of roots) for (const specifier of root.imports) visit(root.directory, packageName(specifier), false);
  return names;
}

/** The root workspace is for development. Filter its installed npm graph by the compiled release roots. */
export function dependencyExclusions(lockFile: string, used: ReadonlySet<string>): string[] {
  const lock = readJson<{ packages: Record<string, object> }>(lockFile);
  const installed = new Set(Object.keys(lock.packages).flatMap(path => {
    const name = /(?:^|\/)node_modules\/(@[^/]+\/[^/]+|[^/]+)$/u.exec(path)?.[1];
    return name && !used.has(name) ? [name] : [];
  }));
  return [...installed].sort().map(name => `!**/node_modules/${name}{,/**}`);
}
