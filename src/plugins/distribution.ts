import { join } from "node:path";
import { applicationStorage } from "../shared/application.ts";
import { applicationManualLayout } from "./distribution-layout.ts";
import { applicationDirectory as directory, unpackedArchivePath } from "./package-modules.ts";
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
export const applicationManuals: readonly ManualSource[] = applicationManualLayout.map(({ path, to }) => {
  const logical = directory(to);
  return { path, directory: unpackedArchivePath(logical) ?? logical };
});
