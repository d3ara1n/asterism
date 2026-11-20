import { readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { artifactDirectory, artifactFile, artifactSchema } from "@asterism-app/plugin-build/artifact";
import { pathWithin } from "../src/storage/paths.ts";
import { packageName, walkRuntimeDependencies, type DistributionManifest, type RuntimeRoots } from "./release-dependencies.ts";

interface PackageMetadata extends DistributionManifest {
  asterism?: {
    id?: string;
    manual?: string[];
    i18n?: { catalogs: Record<string, string> };
  };
}

interface PackageTree {
  read(path: string): string;
  list(path: string): string[];
  kind(path: string): "file" | "directory" | undefined;
}

function packageTree(root: string): PackageTree {
  if (!root.endsWith(".asar")) return {
    read: path => readFileSync(join(root, path), "utf8"),
    list: path => readdirSync(join(root, path)),
    kind: path => {
      const stat = statSync(join(root, path), { throwIfNoEntry: false });
      return stat?.isFile() ? "file" : stat?.isDirectory() ? "directory" : undefined;
    },
  };
  // Use the same ASAR implementation as the pinned packager.
  const require = createRequire(import.meta.url);
  const asar = createRequire(require.resolve("app-builder-lib/package.json"))("@electron/asar") as typeof import("@electron/asar");
  function entry(path: string) {
    try { return asar.statFile(root, path); }
    catch (error) {
      if (error instanceof Error && error.message.includes("was not found in this archive")) return undefined;
      throw error;
    }
  }
  return {
    read: path => asar.extractFile(root, path).toString("utf8"),
    list: path => {
      const item = entry(path);
      if (!item || !("files" in item)) throw new Error(`Packaged directory is missing: ${path}`);
      return Object.keys(item.files);
    },
    kind: path => {
      const item = entry(path);
      return !item ? undefined : "files" in item ? "directory" : "file";
    },
  };
}

function packagePath(root: string, path: string): string {
  const target = resolve(root, path);
  if (pathWithin(resolve(root), target) === null) throw new Error(`Packaged path escapes its package: ${path}`);
  return join(root, path);
}

function installedPackage(tree: PackageTree, root: string, name: string): string | undefined {
  for (let directory = root || "."; ; directory = dirname(directory)) {
    const candidate = join(directory, "node_modules", name);
    if (tree.kind(join(candidate, "package.json")) === "file") return candidate;
    if (directory === ".") return undefined;
  }
}

/** Inspect shipped relative paths and Node dependency roots without importing plugin code. */
export function verifyPackagedPlugins(root: string, runtimeRoots?: readonly RuntimeRoots[]): void {
  const tree = packageTree(root);
  // A peer declaration can be for authoring (for example type packages), not a desktop runtime requirement.
  if (runtimeRoots) walkRuntimeDependencies(runtimeRoots, (directory, name) => {
    const found = installedPackage(tree, directory, name);
    return found && join(found, "package.json");
  }, file => JSON.parse(tree.read(file)), false);
  function verifyPackage(directory: string): string[] {
    const metadata: PackageMetadata = JSON.parse(tree.read(join(directory, "package.json")));
    const declaration = metadata.asterism;
    const publicPackages = new Set<string>();
    if (declaration?.id) {
      const artifacts = join(directory, artifactDirectory);
      const artifact = artifactSchema.parse(JSON.parse(tree.read(join(artifacts, artifactFile))));
      if (artifact.id !== declaration.id) throw new Error(`Packaged artifact identity differs: ${metadata.name}`);
      const entries = [artifact.runtime, artifact.storage, artifact.renderer, ...artifact.stylesheets,
        ...Object.values(artifact.public.runtime), ...Object.values(artifact.public.renderer)];
      for (const entry of entries) {
        if (entry && tree.kind(join(artifacts, entry)) !== "file")
          throw new Error(`Packaged entry is missing: ${metadata.name} -> ${join(artifacts, entry)}`);
      }
      for (const name of runtimeRoots ? [] : Object.keys(metadata.dependencies ?? {}))
        if (!installedPackage(tree, directory, name)) throw new Error(`Packaged dependency is missing: ${metadata.name} -> ${name}`);
      for (const specifier of [...Object.keys(artifact.public.runtime), ...Object.keys(artifact.public.renderer)]) {
        const name = packageName(specifier);
        if (name !== metadata.name) publicPackages.add(name);
      }
    }
    for (const path of declaration?.manual ?? []) {
      if (tree.kind(packagePath(directory, path)) !== "directory")
        throw new Error(`Packaged manual directory is missing: ${metadata.name} -> ${path}`);
    }
    for (const path of Object.values(declaration?.i18n?.catalogs ?? {})) {
      if (tree.kind(packagePath(directory, path)) !== "file")
        throw new Error(`Packaged translation catalog is missing: ${metadata.name} -> ${path}`);
    }
    return [...publicPackages];
  }
  for (const entry of tree.list("packages")) {
    const directory = join("packages", entry);
    if (tree.kind(join(directory, "package.json")) !== "file") continue;
    for (const name of verifyPackage(directory)) {
      const library = installedPackage(tree, directory, name);
      if (!library) throw new Error(`Packaged public library is missing: ${entry} -> ${name}`);
      verifyPackage(library);
    }
  }
}
