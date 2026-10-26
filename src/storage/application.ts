import { isAbsolute, join, relative, resolve } from "node:path";
import { builtin } from "@asterism/builtin-api/contracts";
import builtinStorage from "@asterism/builtin/storage";
import type { PluginStorageDeclaration } from "@asterism/sdk/runtime";
import { configurationStorage } from "../configuration/store.ts";
import { workspaceStorage } from "../runtime/storage.ts";
import { loadPackages, PackageList, packageListStorage } from "../plugins/packages.ts";
import { builtinPublicProvider } from "../builtin-public.ts";
import { builtinRuntimePublicModules } from "../builtin-runtime-public.ts";
import { bindPublicProvider } from "../shared/public-modules.ts";
import { applicationStorage, preferenceVersion } from "../shared/application.ts";
import { jsonStorage, sqliteStorage, type StorageDefinition } from "./migrations.ts";
import { prepareData, restorePoint, startFresh, type DataPath, type PluginStorageGroup } from "./preparation.ts";
import type { PreparationProgress } from "../shared/recovery.ts";

/**
 * 恢复点覆盖的应用数据；缓存（`ui-state.json`、插件构建缓存、Chromium、日志）不迁移也不备份。
 * 新增宿主持久文件时在此登记，并在 `hostStorages` 声明格式。
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

/** 主进程偏好为 electron-store 平铺文档，`version` 写在默认值中。 */
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
    const file = resolve(directory, declaration.path), inside = relative(directory, file);
    if (!inside || inside === ".." || inside.startsWith("../") || inside.startsWith("..\\") || isAbsolute(inside))
      throw new Error(`Storage path is outside plugin ${id}: ${declaration.path}.`);
    const identity = `${id}/${declaration.path}`;
    return declaration.kind === "json"
      ? jsonStorage({ id: identity, file, version: declaration.version, migrations: declaration.migrations, envelope: true })
      : sqliteStorage({ id: identity, file, version: declaration.version, migrations: declaration.migrations });
  });
}

/** 只构建并导入存储入口；插件运行时与 setup 留给任务进程。 */
async function discoverPluginStorage(root: string, onProgress?: (progress: PreparationProgress) => void): Promise<PluginStorageGroup[]> {
  const packages = await loadPackages(new PackageList(join(root, "plugins.json")), join(root, "plugins"), join(root, "plugins", ".cache"),
    [builtin.id], [builtinPublicProvider], id => onProgress?.({ stage: "dataPlugins", detail: id }), { runtime: false });
  const groups: PluginStorageGroup[] = [{ id: builtin.id, stores: pluginStorages(root, builtin.id, builtinStorage) }];
  for (const item of packages) {
    if (!item.manifest?.storage || item.status === "disabled") continue;
    const id = item.manifest.id;
    if (item.status === "loaded" && item.storage) {
      try { groups.push({ id, stores: pluginStorages(root, id, item.storage) }); }
      catch (error) { groups.push({ id, stores: [], error: error instanceof Error ? error.message : String(error) }); }
    } else groups.push({ id, stores: [], error: item.error ?? "The storage entry could not be loaded." });
  }
  return groups;
}

export async function prepareApplicationData(root: string, version: string, onHost?: (status: "migrating" | "ready") => void,
  onProgress?: (progress: PreparationProgress) => void) {
  const release = bindPublicProvider("runtime", builtinPublicProvider, builtinRuntimePublicModules);
  try {
    return await prepareData(root, { version, paths: applicationDataPaths, stores: hostStorages(root), onHost, onProgress,
      discover: () => discoverPluginStorage(root, onProgress) });
  } finally { release(); }
}
export function restoreApplicationData(root: string, point: string, version: string): void {
  restorePoint(root, applicationDataPaths, point, version);
}
export function startFreshApplicationData(root: string, version: string): void {
  startFresh(root, applicationDataPaths, version);
}
