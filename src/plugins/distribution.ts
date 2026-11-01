import { join } from "node:path";
import { applicationDirectory as directory } from "./package-modules.ts";
import { PackageList, type PackageEntry } from "./packages.ts";
import type { ManualSource } from "@asterism-app/sdk/runtime";

/** Shipped packages remain discoverable independently of the user's loading list. */
export const bundledPackages = [{ source: { kind: "bundled", name: "builtin" }, enabled: true }] satisfies readonly PackageEntry[];

/** Distribution defaults use the ordinary package list and remain editable by the user. */
export function applicationPackages(root: string): PackageList {
  return new PackageList(join(root, "plugins.json"), bundledPackages);
}
export const applicationManuals: readonly ManualSource[] = [
  { path: "app", directory: directory("docs/manual") },
  ...["docs", "examples"].map(path => ({ path: `sdk/${path}`, directory: directory(`packages/sdk/${path}`) })),
];
