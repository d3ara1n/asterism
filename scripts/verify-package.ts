import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

interface PackageMetadata {
  name: string;
  asterism?: {
    runtime?: string;
    renderer?: string;
    storage?: string;
    manual?: string[];
    publicPackages?: string[];
  };
}

function verifyPackage(root: string): PackageMetadata {
  const metadata: PackageMetadata = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const declaration = metadata.asterism;
  for (const entry of [declaration?.runtime, declaration?.renderer, declaration?.storage]) {
    if (entry && !statSync(join(root, entry), { throwIfNoEntry: false })?.isFile())
      throw new Error(`Packaged entry is missing: ${metadata.name} -> ${join(root, entry)}`);
  }
  for (const directory of declaration?.manual ?? []) {
    if (!statSync(join(root, directory), { throwIfNoEntry: false })?.isDirectory())
      throw new Error(`Packaged manual directory is missing: ${metadata.name} -> ${join(root, directory)}`);
  }
  return metadata;
}

/** Inspect the packaged filesystem through the same package lookup used at startup; no plugin code runs. */
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
