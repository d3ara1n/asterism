import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { builtPackageSchema, type BuiltPackage } from "./packages.ts";

const buildSchema = z.array(builtPackageSchema);

/** Capture one startup's package graph. The preparation process owns this directory before the runtime starts. */
export function savePluginBuild(directory: string, packages: readonly BuiltPackage[]): string {
  mkdirSync(directory, { recursive: true });
  const file = join(directory, "startup.json");
  writeFileSync(file, JSON.stringify(packages));
  const retained = new Set(packages.flatMap(item => [item.runtime, item.storageEntry, item.renderer, item.stylesheet])
    .flatMap(path => path ? [path.split("/")[0]!] : []));
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && /^modules-[a-f0-9]{32}$/u.test(entry.name) && !retained.has(entry.name))
      rmSync(join(directory, entry.name), { recursive: true });
  }
  rmSync(join(directory, "build-index.json"), { force: true });
  return file;
}

/** Reads only artifacts explicitly handed off by the current preparation process; previous startups are never cache hits. */
export function readPluginBuild(file: string): BuiltPackage[] {
  return buildSchema.parse(JSON.parse(readFileSync(file, "utf8")));
}
