import { pathWithin } from "./paths.ts";
import { applicationPackages } from "../plugins/distribution.ts";
import { join, resolve } from "node:path";
import type { PluginStorageDeclaration } from "@asterism-app/sdk/runtime";
import { configurationStorage } from "../configuration/store.ts";
import { workspaceStorage } from "../runtime/storage.ts";
import { buildPackages, importPackages, packageListStorage, type BuiltPackage } from "../plugins/packages.ts";
import { savePluginBuild } from "../plugins/artifacts.ts";
import { applicationStorage, preferenceVersion } from "../shared/application.ts";
import { jsonStorage, sqliteStorage, type StorageDefinition } from "./migrations.ts";
import { prepareData, restorePoint, startFresh, type DataPath, type PluginStorageGroup } from "./preparation.ts";
import type { PreparationProgress, PreparationResult } from "../shared/recovery.ts";

/**
 * Application data covered by recovery points; caches (`ui-state.json`, plugin builds, Chromium, logs) are neither migrated nor backed up.
 * Register new host persistent files here and declare formats in `hostStorages`.
 */
export const applicationDataPaths: readonly DataPath[] = [
  { path: applicationStorage.databaseDirectory },
  { path: applicationStorage.configurationFile },
  { path: "plugins.json" },
  { path: `${applicationStorage.appearanceStore}.json` },
  { path: `${applicationStorage.languageStore}.json` },
  { path: `${applicationStorage.updatesStore}.json` },
  { path: applicationStorage.credentialsDirectory },
  { path: "extensions" },
  { path: join(applicationStorage.contentDirectory, "sealed"), link: true },
];

/** Main-process preferences are flat electron-store documents with `version` in defaults. */
function preferenceStorage(root: string, name: string): StorageDefinition {
  return jsonStorage({ id: name, file: join(root, `${name}.json`), version: preferenceVersion, migrations: {} });
}
export function hostStorages(root: string): StorageDefinition[] {
  return [packageListStorage(root), configurationStorage(root), workspaceStorage(root),
    ...[applicationStorage.appearanceStore, applicationStorage.languageStore, applicationStorage.updatesStore].map(name => preferenceStorage(root, name))];
}

export function pluginStorages(root: string, id: string, declarations: readonly PluginStorageDeclaration[]): StorageDefinition[] {
  const directory = resolve(root, "extensions", id);
  return declarations.map(declaration => {
    const file = resolve(directory, declaration.path);
    if (!pathWithin(directory, file))
      throw new Error(`Storage path is outside plugin ${id}: ${declaration.path}.`);
    const identity = `${id}/${declaration.path}`;
    return declaration.kind === "json"
      ? jsonStorage({ id: identity, file, version: declaration.version, migrations: declaration.migrations, envelope: true })
      : sqliteStorage({ id: identity, file, version: declaration.version, migrations: declaration.migrations });
  });
}

/** Build and import storage entries only; task processes own plugin runtime and setup. */
async function discoverPluginStorage(root: string, built: readonly BuiltPackage[]): Promise<PluginStorageGroup[]> {
  const packages = await importPackages(built, join(root, "plugins", ".cache"), { runtime: false });
  const groups: PluginStorageGroup[] = [];
  for (const item of packages) {
    if (!item.manifest?.storage || item.status === "disabled") continue;
    const id = item.manifest.id;
    if (item.status === "ready" && item.storage) {
      try { groups.push({ id, stores: pluginStorages(root, id, item.storage) }); }
      catch (error) { groups.push({ id, stores: [], error: error instanceof Error ? error.message : String(error) }); }
    } else groups.push({ id, stores: [], error: item.diagnostic?.message ?? "The storage entry could not be loaded." });
  }
  return groups;
}

export async function prepareApplicationData(root: string, version: string, onHost?: (status: "migrating" | "ready") => void,
  onProgress?: (progress: PreparationProgress) => void): Promise<PreparationResult> {
  let pluginBuild: string | undefined;
  const result = await prepareData(root, { version, paths: applicationDataPaths, stores: hostStorages(root), onHost, onProgress,
    discover: async () => {
      const cache = join(root, "plugins", ".cache");
      const built = await buildPackages(applicationPackages(root), join(root, "plugins"), cache, [], [],
        id => onProgress?.({ stage: "dataPlugins", detail: id }));
      pluginBuild = savePluginBuild(cache, built);
      return discoverPluginStorage(root, built);
    } });
  return result.ok ? { ...result, pluginBuild } : result;
}
export function restoreApplicationData(root: string, point: string, version: string): void {
  restorePoint(root, applicationDataPaths, point, version);
}
export function startFreshApplicationData(root: string, version: string): void {
  startFresh(root, applicationDataPaths, version);
}
