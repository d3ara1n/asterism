import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { artifactDirectory, artifactFile, artifactSchema } from "@asterism-app/plugin-build/artifact";
import { pathWithin } from "../src/storage/paths.ts";

interface PackageMetadata {
  name: string;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  asterism?: {
    id?: string;
    manual?: string[];
    i18n?: { catalogs: Record<string, string> };
  };
}

function packagePath(root: string, path: string): string {
  const target = resolve(root, path);
  if (pathWithin(root, target) === null) throw new Error(`Packaged path escapes its package: ${path}`);
  return target;
}

function verifyPackage(root: string): string[] {
  const metadata: PackageMetadata = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const declaration = metadata.asterism;
  const publicPackages = new Set<string>();
  if (declaration?.id) {
    const directory = join(root, artifactDirectory);
    const file = join(directory, artifactFile);
    if (!existsSync(file)) throw new Error(`Packaged plugin has no built artifact: ${metadata.name}`);
    const artifact = artifactSchema.parse(JSON.parse(readFileSync(file, "utf8")));
    if (artifact.id !== declaration.id) throw new Error(`Packaged artifact identity differs: ${metadata.name}`);
    const entries = [artifact.runtime, artifact.storage, artifact.renderer, ...artifact.stylesheets,
      ...Object.values(artifact.public.runtime), ...Object.values(artifact.public.renderer)];
    for (const entry of entries) {
      if (entry && !statSync(join(directory, entry), { throwIfNoEntry: false })?.isFile())
        throw new Error(`Packaged entry is missing: ${metadata.name} -> ${join(directory, entry)}`);
    }
    // Backend output keeps installed packages external, so they must resolve from the packaged plugin root.
    for (const name of Object.keys(metadata.dependencies ?? {}))
      if (!installedPackage(root, name)) throw new Error(`Packaged dependency is missing: ${metadata.name} -> ${name}`);
    for (const specifier of [...Object.keys(artifact.public.runtime), ...Object.keys(artifact.public.renderer)]) {
      const name = /^(?:@[^/]+\/)?[^/]+/u.exec(specifier)![0];
      if (name !== metadata.name) publicPackages.add(name);
    }
  }
  for (const directory of declaration?.manual ?? []) {
    if (!statSync(packagePath(root, directory), { throwIfNoEntry: false })?.isDirectory())
      throw new Error(`Packaged manual directory is missing: ${metadata.name} -> ${join(root, directory)}`);
  }
  for (const file of Object.values(declaration?.i18n?.catalogs ?? {})) {
    if (!statSync(packagePath(root, file), { throwIfNoEntry: false })?.isFile())
      throw new Error(`Packaged translation catalog is missing: ${metadata.name} -> ${file}`);
  }
  return [...publicPackages];
}
function installedPackage(root: string, name: string): string | undefined {
  return createRequire(join(root, "package.json")).resolve.paths(name)?.map(path => join(path, name))
    .find(path => existsSync(join(path, "package.json")));
}

/** Inspect distributed artifact entries, dependencies, and manuals without importing any plugin code. */
export function verifyPackagedPlugins(unpacked: string): void {
  const packages = join(unpacked, "packages");
  for (const entry of readdirSync(packages, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const root = join(packages, entry.name);
    for (const name of verifyPackage(root)) {
      const library = installedPackage(root, name);
      if (!library) throw new Error(`Packaged public library is missing: ${entry.name} -> ${name}`);
      verifyPackage(library);
    }
  }
}
