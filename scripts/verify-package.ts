import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { artifactSchema, pointerSchema } from "@asterism-app/plugin-build/artifact";
import { pathWithin } from "../src/storage/paths.ts";

interface PackageMetadata {
  name: string;
  asterism?: {
    id?: string;
    artifact?: string;
    manual?: string[];
    publicPackages?: string[];
    i18n?: { catalogs: Record<string, string> };
  };
}

function packagePath(root: string, path: string): string {
  const target = resolve(root, path);
  if (pathWithin(root, target) === null) throw new Error(`Packaged path escapes its package: ${path}`);
  return target;
}

function verifyPackage(root: string): PackageMetadata {
  const metadata: PackageMetadata = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const declaration = metadata.asterism;
  if (declaration?.id) {
    if (!declaration.artifact) throw new Error(`Packaged plugin has no built artifact: ${metadata.name}`);
    const pointerFile = packagePath(root, declaration.artifact);
    const pointer = pointerSchema.parse(JSON.parse(readFileSync(pointerFile, "utf8")));
    const directory = packagePath(root, resolve(dirname(pointerFile), pointer.build));
    const artifact = artifactSchema.parse(JSON.parse(readFileSync(join(directory, "artifact.json"), "utf8")));
    if (artifact.id !== declaration.id) throw new Error(`Packaged artifact identity differs: ${metadata.name}`);
    const entries = [artifact.runtime, artifact.storage, artifact.renderer, ...artifact.stylesheets,
      ...Object.values(artifact.public.runtime), ...Object.values(artifact.public.renderer)];
    for (const entry of entries) {
      if (entry && !statSync(join(directory, entry), { throwIfNoEntry: false })?.isFile())
        throw new Error(`Packaged entry is missing: ${metadata.name} -> ${join(directory, entry)}`);
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
  return metadata;
}

/** Inspect distributed artifact entries and manuals without importing any plugin code. */
export function verifyPackagedPlugins(unpacked: string): void {
  const packages = join(unpacked, "packages");
  for (const entry of readdirSync(packages, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const root = join(packages, entry.name);
    const metadata = verifyPackage(root);
    const require = createRequire(join(root, "package.json"));
    for (const name of metadata.asterism?.publicPackages ?? []) {
      const library = require.resolve.paths(name)?.map(path => join(path, name))
        .find(path => existsSync(join(path, "package.json")));
      if (!library) throw new Error(`Packaged public library is missing: ${metadata.name} -> ${name}`);
      verifyPackage(library);
    }
  }
}
