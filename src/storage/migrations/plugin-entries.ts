import type { PluginStorageDeclaration } from "@asterism-app/sdk/runtime";
import { importEntry, loadPackageEntries, PluginPackageError, type BuiltPackage } from "../../plugins/packages.ts";
import type { CurrentPluginStorage } from "../../plugins/storage-declaration.ts";

interface StoragePackage extends BuiltPackage { storage?: readonly PluginStorageDeclaration[] }

/** Storage declarations check structural shape only; migration chains and plugins own format contents. */
function storageDeclarations(id: string, value: unknown): readonly PluginStorageDeclaration[] {
  if (!Array.isArray(value) || value.some(item => !item || typeof item !== "object" || (!["json", "sqlite", "records"].includes(item.kind))
    || (item.kind === "records"
      ? typeof item.id !== "string" || !Array.isArray(item.contracts) || item.contracts.some((contract: unknown) => typeof contract !== "string")
      : typeof item.path !== "string") || !Number.isSafeInteger(item.version) || item.version < 1 || !item.migrations || typeof item.migrations !== "object"))
    throw new PluginPackageError("invalid_entry", `Storage entry of ${id} must default-export defineStorage([...]).`);
  return value as readonly PluginStorageDeclaration[];
}

export function importStorageEntries(packages: readonly BuiltPackage[], hostModules: Readonly<Record<string, string>>): Promise<StoragePackage[]> {
  return loadPackageEntries<StoragePackage>(packages, hostModules, "storage", async (item, id) => {
    if (item.storageEntry) item.storage = storageDeclarations(id, await importEntry(id, item.storageEntry, "storage"));
  });
}

export function currentStorage(declarations: readonly PluginStorageDeclaration[]): CurrentPluginStorage[] {
  return declarations.map(item => item.kind === "records"
    ? { kind: item.kind, id: item.id, version: item.version, contracts: [...item.contracts] }
    : { kind: item.kind, path: item.path, version: item.version });
}
