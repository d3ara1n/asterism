import { pathWithin } from "./paths.ts";
import { applicationPackages, applicationDistribution } from "../plugins/distribution.ts";
import { join, resolve } from "node:path";
import type { PluginStorageDeclaration } from "@asterism-app/sdk/runtime";
import { configurationStorage } from "./migrations/configuration.ts";
import { workspaceStorage } from "./migrations/workspace.ts";
import { telemetryStorage } from "./migrations/telemetry.ts";
import { buildPackages, type BuiltPackage } from "../plugins/packages.ts";
import { collectManagedInstallations } from "../plugins/npm-installation.ts";
import { currentStorage, importStorageEntries } from "./migrations/plugin-entries.ts";
import { savePluginBuild } from "../plugins/artifacts.ts";
import runtimeHostModules from "virtual:asterism/runtime-host-modules";
import { applicationStorage, preferenceVersion } from "../shared/application.ts";
import { recordStorages } from "./record-storage.ts";
import { pluginRecordStorage, requireRegisteredRecordStorages } from "./migrations/records.ts";
import { packageListVersion } from "./formats.ts";
import { jsonStorage, sqliteStorage, type StorageDefinition } from "./migrations/engine.ts";
import { prepareData, restorePoint, startFresh, type DataPath, type PluginStorageGroup } from "./preparation.ts";
import type { PreparationProgress, PreparationResult } from "../shared/recovery.ts";

/**
 * Application data covered by recovery points; caches (`ui-state.json`, plugin builds, Chromium, logs) are neither migrated nor backed up.
 * The usage ledger is migrated with host storage but stays outside recovery points, so restoring workspace state never rewinds usage history.
 * Register new host persistent files here and declare formats in `hostStorages`.
 */
export const applicationDataPaths: readonly DataPath[] = [
  { path: applicationStorage.databaseDirectory },
  { path: applicationStorage.configurationFile },
  { path: applicationStorage.pluginListFile },
  { path: join(applicationStorage.pluginPackagesDirectory, applicationStorage.pluginInstallationRecordsDirectory) },
  { path: `${applicationStorage.appearanceStore}.json` },
  { path: `${applicationStorage.languageStore}.json` },
  { path: `${applicationStorage.updatesStore}.json` },
  { path: `${applicationStorage.networkStore}.json` },
  { path: applicationStorage.credentialsDirectory },
  { path: applicationStorage.pluginDataDirectory },
  { path: join(applicationStorage.contentDirectory, applicationStorage.sealedContentDirectory), link: true },
];

/** Main-process preferences are flat electron-store documents with `version` in defaults. */
function preferenceStorage(root: string, name: string): StorageDefinition {
  return jsonStorage({ id: name, file: join(root, `${name}.json`), version: preferenceVersion, migrations: {} });
}
function packageListStorage(root: string): StorageDefinition {
  return jsonStorage({ id: "plugins", file: join(root, applicationStorage.pluginListFile), version: packageListVersion, migrations: {} });
}

export function hostStorages(root: string, decrypt?: (ciphertext: string) => Promise<string>): StorageDefinition[] {
  return [packageListStorage(root), configurationStorage(root, decrypt), workspaceStorage(root), telemetryStorage(root),
    ...[applicationStorage.appearanceStore, applicationStorage.languageStore, applicationStorage.updatesStore, applicationStorage.networkStore].map(name => preferenceStorage(root, name))];
}

export function pluginStorages(root: string, id: string, declarations: readonly PluginStorageDeclaration[]): StorageDefinition[] {
  const directory = resolve(root, applicationStorage.pluginDataDirectory, id);
  const records = recordStorages(id, declarations);
  requireRegisteredRecordStorages(root, id, records);
  return [...records.map(declaration => pluginRecordStorage(root, id, declaration)), ...declarations.flatMap(declaration => {
    if (declaration.kind === "records") return [];
    const file = resolve(directory, declaration.path);
    if (!pathWithin(directory, file))
      throw new Error(`Storage path is outside plugin ${id}: ${declaration.path}.`);
    const identity = `${id}/${declaration.path}`;
    return declaration.kind === "json"
      ? jsonStorage({ id: identity, file, version: declaration.version, migrations: declaration.migrations, envelope: true })
      : sqliteStorage({ id: identity, file, version: declaration.version, migrations: declaration.migrations });
  })];
}

export async function prepareApplicationData(root: string, version: string, onHost?: (status: "migrating" | "ready") => void,
  onProgress?: (progress: PreparationProgress) => void, decrypt?: (ciphertext: string) => Promise<string>, distribution = applicationDistribution): Promise<PreparationResult> {
  const cache = join(root, applicationStorage.pluginPackagesDirectory, applicationStorage.pluginCacheDirectory);
  let captured: BuiltPackage[] = [];
  const result = await prepareData(root, { version, paths: applicationDataPaths, stores: hostStorages(root, decrypt), onHost, onProgress,
    discover: async () => {
      const built = await buildPackages(applicationPackages(root, distribution), join(root, applicationStorage.pluginPackagesDirectory), [],
        id => onProgress?.({ stage: "dataPlugins", detail: id }));
      collectManagedInstallations(join(root, applicationStorage.pluginPackagesDirectory), new Set(built.flatMap(item =>
        item.entry.source.kind === "npm" && item.entry.source.installation ? [item.entry.source.installation] : [])));
      const packages = await importStorageEntries(built, runtimeHostModules);
      const groups: PluginStorageGroup[] = [];
      captured = built.map(({ storageEntry: _entry, ...item }, index) => {
        const loaded = packages[index]!;
        if (!loaded.manifest || loaded.status === "disabled") return item;
        const id = loaded.manifest.id;
        if (loaded.status === "ready") {
          try {
            const storage = loaded.storage ?? [];
            const stores = pluginStorages(root, id, storage);
            const preparedStorage = currentStorage(storage);
            groups.push({ id, stores });
            return { ...item, preparedStorage };
          } catch (error) { groups.push({ id, stores: [], error: error instanceof Error ? error.message : String(error) }); }
        } else if (loaded.storageEntry) groups.push({ id, stores: [], error: loaded.diagnostic?.message ?? "The storage entry could not be loaded." });
        return item;
      });
      return groups;
    } });
  return result.ok ? { ...result, pluginBuild: savePluginBuild(cache, captured) } : result;
}
export function restoreApplicationData(root: string, point: string, version: string): void {
  restorePoint(root, applicationDataPaths, point, version);
}
export function startFreshApplicationData(root: string, version: string): void {
  startFresh(root, applicationDataPaths, version);
}
