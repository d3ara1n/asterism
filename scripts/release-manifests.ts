import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PackagePlan } from "./release-packages.ts";

interface ExampleManifest {
  devDependencies?: Record<string, string>;
  [field: string]: unknown;
}

/** Pair maintained examples with the release APIs without changing their compatibility peer ranges. */
export function releasedExample(manifest: ExampleManifest, versions: ReadonlyMap<string, string>): ExampleManifest {
  if (!manifest.devDependencies) return manifest;
  return { ...manifest, devDependencies: Object.fromEntries(Object.entries(manifest.devDependencies)
    .map(([name, version]) => [name, versions.get(name) ?? version])) };
}

/** Version writing is confined to disposable release checkouts; the planner owns every chosen version. */
export function writeReleaseVersions(root: string, plans: readonly PackagePlan[]): void {
  const versions = new Map(plans.map(plan => [plan.name, plan.version]));
  for (const plan of plans) {
    const file = join(root, plan.directory, "package.json");
    const metadata = JSON.parse(readFileSync(file, "utf8"));
    if (metadata.name !== plan.name) throw new Error(`Release package identity differs at ${plan.directory}.`);
    writeFileSync(file, `${JSON.stringify({ ...metadata, version: plan.version }, null, 2)}\n`);
    for (const example of plan.examples ?? []) {
      const target = join(root, example);
      writeFileSync(target, `${JSON.stringify(releasedExample(JSON.parse(readFileSync(target, "utf8")), versions), null, 2)}\n`);
    }
    console.log(`${plan.name} version ${plan.version}`);
  }
}
