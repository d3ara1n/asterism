import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { builtPackageSchema, type BuiltPackage } from "./packages.ts";

const buildSchema = z.array(builtPackageSchema);
/** Preparation captures paths and descriptors once; output directories remain owned by the package author or installer. */
export function savePluginBuild(directory: string, packages: readonly BuiltPackage[]): string {
  mkdirSync(directory, { recursive: true });
  const file = join(directory, "startup.json");
  writeFileSync(file, JSON.stringify(packages));
  return file;
}
/** Runtime consumes the exact preparation selection and does not rediscover packages. */
export function readPluginBuild(file: string): BuiltPackage[] {
  return buildSchema.parse(JSON.parse(readFileSync(file, "utf8")));
}
