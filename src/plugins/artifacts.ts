import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { builtPackageSchema, type BuiltPackage } from "./packages.ts";

const buildSchema = z.array(builtPackageSchema);
/** Preparation captures paths/descriptors once; completed build directories remain owned by the package author/installer. */
export function savePluginBuild(directory: string, packages: readonly BuiltPackage[]): string {
  mkdirSync(directory, { recursive: true });
  const file = join(directory, "startup.json");
  writeFileSync(file, JSON.stringify(packages));
  return file;
}
/** Runtime consumes the exact preparation selection, never follows a newer published pointer. */
export function readPluginBuild(file: string): BuiltPackage[] {
  return buildSchema.parse(JSON.parse(readFileSync(file, "utf8")));
}
