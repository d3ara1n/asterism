import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { applicationStorage } from "../shared/application.ts";

const installationId = z.string().uuid();
const files = ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml"] as const;
const receiptFile = "asterism-installation.json";
const receiptSchema = z.object({ pluginId: z.string().nullable().optional(), package: z.object({ name: z.string(), version: z.string() }) });
const recordDirectory = (root: string, id: string) => join(root, applicationStorage.pluginInstallationRecordsDirectory, installationId.parse(id));

/** Recovery retains exact dependency selection and approvals, not downloaded code or user registry credentials. */
export function saveManagedRecord(npmRoot: string, installation: string, directory: string): void {
  const destination = recordDirectory(npmRoot, installation);
  mkdirSync(destination, { recursive: true });
  for (const file of [...files, receiptFile]) copyFileSync(join(directory, file), join(destination, file));
}

/** An explicit reinstall of the same package version can reuse its recovered lockfile. */
export function restoreManagedRecord(npmRoot: string, installation: string, directory: string, name: string, version: string): boolean {
  const source = recordDirectory(npmRoot, installation);
  if (!existsSync(source)) return false;
  const receipt = receiptSchema.parse(JSON.parse(readFileSync(join(source, receiptFile), "utf8")));
  if (receipt.package.name !== name || receipt.package.version !== version) return false;
  for (const file of files) copyFileSync(join(source, file), join(directory, file));
  return true;
}

/** A recovered selection retains identity even when its downloaded installation is missing. */
export function readManagedPluginId(npmRoot: string, installation: string): string | null {
  const file = join(recordDirectory(npmRoot, installation), receiptFile);
  if (!existsSync(file)) return null;
  return receiptSchema.parse(JSON.parse(readFileSync(file, "utf8"))).pluginId ?? null;
}
