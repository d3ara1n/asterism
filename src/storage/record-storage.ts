import type { DatabaseSync } from "node:sqlite";
import { belongsTo } from "@asterism-app/sdk/contracts";
import type { CurrentPluginStorage, CurrentRecordStorage } from "../plugins/storage-declaration.ts";

export const recordStorageSchemaSql = `CREATE TABLE plugin_record_versions (
  plugin_id TEXT NOT NULL,
  storage_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  PRIMARY KEY (plugin_id, storage_id)
) STRICT;`;

/** A contract must have a single migration owner; the host also matches stamped provenance when selecting rows. */
export function recordStorages<T extends CurrentPluginStorage>(pluginId: string, declarations: readonly T[]): Extract<T, CurrentRecordStorage>[] {
  const ids = new Set<string>();
  const contracts = new Set<string>();
  return declarations.filter((declaration): declaration is Extract<T, CurrentRecordStorage> => {
    if (declaration.kind !== "records") return false;
    const { id, version } = declaration;
    if (!/^[a-z0-9][a-z0-9._-]*$/.test(id) || ids.has(id) || !Number.isSafeInteger(version) || version < 1 || !declaration.contracts.length)
      throw new Error(`Invalid record storage declaration for ${pluginId}: ${id}.`);
    ids.add(id);
    for (const contract of declaration.contracts) {
      if (!belongsTo(pluginId, contract) || contracts.has(contract))
        throw new Error(`Record storage ${pluginId}/${id} requires a unique owned contract: ${contract}.`);
      contracts.add(contract);
    }
    return true;
  });
}

export const matches = `contract IN (SELECT value FROM json_each(?)) AND json_extract(payload, '$.source.plugin') = ?`;
export function versionOf(db: DatabaseSync, pluginId: string, storageId: string): number | undefined {
  return (db.prepare("SELECT version FROM plugin_record_versions WHERE plugin_id = ? AND storage_id = ?")
    .get(pluginId, storageId) as { version: number } | undefined)?.version;
}
export function writeVersion(db: DatabaseSync, pluginId: string, storageId: string, version: number): void {
  db.prepare(`INSERT INTO plugin_record_versions VALUES (?, ?, ?)
    ON CONFLICT(plugin_id, storage_id) DO UPDATE SET version = excluded.version`).run(pluginId, storageId, version);
}
export function hasRows(db: DatabaseSync, pluginId: string, scope: string): boolean {
  return !!db.prepare(`SELECT 1 FROM session_nodes WHERE ${matches} LIMIT 1`).get(scope, pluginId);
}
export function transaction<T>(db: DatabaseSync, run: () => T): T {
  db.exec("BEGIN IMMEDIATE;");
  try {
    const result = run();
    db.exec("COMMIT;");
    return result;
  } catch (error) {
    if (db.isTransaction) db.exec("ROLLBACK;");
    throw error;
  }
}

/** Seed a record store before the first write. Empty stores need no migration or recovery point. */
export function initializePluginRecordStorage(db: DatabaseSync, prepared: {
  declarations: ReadonlyMap<string, readonly CurrentPluginStorage[]>;
  failures: ReadonlyMap<string, string>;
}): void {
  const missing = [...prepared.declarations].flatMap(([pluginId, declarations]) => prepared.failures.has(pluginId) ? []
    : recordStorages(pluginId, declarations).flatMap(declaration => {
      const found = versionOf(db, pluginId, declaration.id);
      if (found === undefined) return [{ pluginId, declaration }];
      if (found !== declaration.version) throw new Error(`Record storage ${pluginId}/${declaration.id} was not prepared.`);
      return [];
    }));
  if (!missing.length) return;
  transaction(db, () => {
    for (const { pluginId, declaration } of missing) {
      if (declaration.version !== 1 && hasRows(db, pluginId, JSON.stringify(declaration.contracts)))
        throw new Error(`Record storage ${pluginId}/${declaration.id} was not prepared.`);
      writeVersion(db, pluginId, declaration.id, declaration.version);
    }
  });
}
