import { join } from "node:path";
import { applicationStorage } from "../shared/application.ts";
import { applicationDirectory as directory } from "./package-modules.ts";
import { PackageList, type Distribution, type PackageEntry } from "./packages.ts";
import type { ManualSource } from "@asterism-app/sdk/runtime";

/** Shipped packages remain discoverable independently of the user's loading list. */
export const applicationDistribution: Distribution = {
  packages: [{ source: { kind: "bundled", name: "builtin" }, enabled: true }] satisfies readonly PackageEntry[],
  directory: directory("packages"),
};

/** Distribution defaults use the ordinary package list and remain editable by the user. */
export function applicationPackages(root: string, distribution = applicationDistribution): PackageList {
  return new PackageList(join(root, applicationStorage.pluginListFile), distribution);
}
export const applicationManuals: readonly ManualSource[] = [
  { path: "app", directory: directory("docs/manual") },
  { path: "plugin-build", directory: directory("packages/plugin-build/docs") },
  ...["docs", "examples"].map(path => ({ path: `sdk/${path}`, directory: directory(`packages/sdk/${path}`) })),
];
