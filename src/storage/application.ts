import { isAbsolute, join, relative, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { prerelease } from "semver";
import { builtin } from "@atelier/builtin-api/contracts";
import { builtinStorage } from "@atelier/builtin/runtime";
import type { PluginStorageDeclaration } from "@atelier/sdk/runtime";
import { configurationStorage } from "../configuration/store.ts";
import { workspaceStorage } from "../runtime/storage.ts";
import { loadPackages, PackageList, packageListStorage } from "../plugins/packages.ts";
import { builtinPublicProvider } from "../builtin-public.ts";
import { builtinRuntimePublicModules } from "../builtin-runtime-public.ts";
import { bindPublicProvider } from "../shared/public-modules.ts";
import { applicationStorage } from "../shared/application.ts";
import { jsonStorage, sqliteStorage, type StorageDefinition } from "./migrations.ts";
import { preferenceStorages } from "./preferences.ts";
import { existingContentFiles, prepareData } from "./preparation.ts";

export function pluginStorages(root: string, id: string, declarations: readonly PluginStorageDeclaration[]): StorageDefinition[] {
  const directory = resolve(root, "extensions", id);
  return declarations.map(declaration => {
    const file = resolve(directory, declaration.path), inside = relative(directory, file);
    if (!inside || inside === ".." || inside.startsWith("../") || inside.startsWith("..\\") || isAbsolute(inside))
      throw new Error(`Storage path is outside plugin ${id}: ${declaration.path}.`);
    const identity = `${id}/${declaration.path}`;
    return declaration.kind === "json"
      ? jsonStorage({ ...declaration, id: identity, file, envelope: true })
      : sqliteStorage({ ...declaration, id: identity, file });
  });
}
export async function prepareApplicationData(root: string, version: string, retry = false) {
  const release = bindPublicProvider("runtime", builtinPublicProvider, builtinRuntimePublicModules);
  try {
    return await prepareData(root, { version, retry,
      stores: [packageListStorage(root), configurationStorage(root), workspaceStorage(root), ...preferenceStorages(root, process.platform, prerelease(version) !== null)],
      async discover() {
        // 导入声明与业务 setup 分开；缓存可重建，领域存储尚未交给插件。
        const packages = await loadPackages(new PackageList(join(root, "plugins.json")), join(root, "plugins"), join(root, "plugins", ".cache"), [builtin.id], [builtinPublicProvider]);
        return [
          ...pluginStorages(root, builtin.id, builtinStorage),
          ...packages.flatMap(item => item.definition ? pluginStorages(root, item.definition.namespace.id, item.definition.storage ?? []) : []),
        ];
      },
      validate() {
        const db = new DatabaseSync(join(root, applicationStorage.databaseDirectory, applicationStorage.databaseFile), { readOnly: true });
        try {
          const files = existingContentFiles(root);
          for (const row of db.prepare(`SELECT id FROM contents WHERE
            EXISTS (SELECT 1 FROM content_roots r WHERE r.content_id = contents.id)
            OR EXISTS (SELECT 1 FROM template_content_roots r WHERE r.content_id = contents.id)`).all()) if (!files.has(String(row.id)))
            throw new Error(`Stored content ${row.id} is missing. Restore the matching database and content backup.`);
        } finally { db.close(); }
      },
    });
  } finally { release(); }
}
