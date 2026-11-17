// Uses only Node built-ins: release preflight and npm publication run without installed dependencies.
import type { PackagePlan } from "./release-packages.ts";

/** Release input format: candidates before explicit plugin artifacts have no compatible catalogue. */
export function releaseCatalogue(metadata: { asterismRelease?: { format?: number; packages?: unknown } }): string[] {
  const declaration = metadata.asterismRelease;
  if (declaration?.format !== 1)
    throw new Error("This source predates or does not support the current release workflow. Select a candidate produced by the explicit plugin-artifact release flow.");
  const packages = declaration.packages;
  if (!Array.isArray(packages) || !packages.length || packages.some(path => typeof path !== "string" || !/^packages\/[a-z0-9-]+$/u.test(path))
    || new Set(packages).size !== packages.length) throw new Error("The release source must declare distinct public package directories.");
  return packages;
}

/** An interrupted publication can reuse only the artifact associated with its selected source. */
export function needsPackagePublication(name: string, version: string, published: Record<string, string | null>, sourceSha: string): boolean {
  if (!Object.hasOwn(published, version)) return true;
  if (published[version] !== sourceSha)
    throw new Error(`${name}@${version} is already published without matching source ${sourceSha}.`);
  return false;
}

/** Registry versions mapped to the source commit npm recorded for each publication; unpublished packages have none. */
export async function registryPublished(name: string): Promise<Record<string, string | null>> {
  const response = await fetch(`https://registry.npmjs.org/${name.replace("/", "%2f")}`);
  if (response.status === 404) return {};
  if (!response.ok) throw new Error(`npm registry returned ${response.status} for ${name}.`);
  const packument = await response.json() as { versions?: Record<string, { gitHead?: string }> };
  return Object.fromEntries(Object.entries(packument.versions ?? {}).map(([version, manifest]) => [version, manifest.gitHead ?? null]));
}

export function releasePackages(): PackagePlan[] {
  return JSON.parse(process.env.RELEASE_PACKAGES ?? "[]") as PackagePlan[];
}
