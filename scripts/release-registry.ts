// Uses only Node built-ins: release preflight and npm publication run without installed dependencies.
import type { PackagePlan } from "./release-packages.ts";

/** Public workspaces in publication order; built-in API declares the SDK as a peer. */
export const publicPackages = ["packages/sdk", "packages/builtin-api"] as const;

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
