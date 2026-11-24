import { existsSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { belongsTo, jsonSchema, type Json } from "@asterism-app/sdk/contracts";
import type { PluginRecordStorageDeclaration, PluginStorageDeclaration } from "@asterism-app/sdk/runtime";
import { contentReferences } from "../runtime/content-store.ts";
import { applicationStorage } from "../shared/application.ts";
import { migrationPath, type StorageDefinition } from "./migrations.ts";

export const recordStorageSchemaSql = `CREATE TABLE plugin_record_versions (
  plugin_id TEXT NOT NULL,
  storage_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  PRIMARY KEY (plugin_id, storage_id)
) STRICT;`;

/** A contract must have a single migration owner; the host also matches stamped provenance when selecting rows. */
export function recordStorages(pluginId: string, declarations: readonly PluginStorageDeclaration[]): PluginRecordStorageDeclaration[] {
  const ids = new Set<string>();
  const contracts = new Set<string>();
  return declarations.filter((declaration): declaration is PluginRecordStorageDeclaration => {
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

const workspaceFile = (root: string) => join(root, applicationStorage.databaseDirectory, applicationStorage.databaseFile);
function inspectWorkspace<T>(file: string, read: (db: DatabaseSync) => T): T | undefined {
  if (!existsSync(file)) return undefined;
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    if ((db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version === 0
      && !db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' LIMIT 1").get()) return undefined;
    return read(db);
  } finally { db.close(); }
}

/** A downgraded package without its previous declarations must not append old-format records to migrated history. */
export function requireRegisteredRecordStorages(root: string, pluginId: string, declarations: readonly PluginRecordStorageDeclaration[]): void {
  inspectWorkspace(workspaceFile(root), db => {
    const declared = new Set(declarations.map(item => item.id));
    const registered = db.prepare("SELECT storage_id FROM plugin_record_versions WHERE plugin_id = ?")
      .all(pluginId) as { storage_id: string }[];
    const missing = registered.find(item => !declared.has(item.storage_id));
    if (missing) throw new Error(`Plugin ${pluginId} does not declare record storage ${missing.storage_id}. Install a compatible version.`);
  });
}

const matches = `contract IN (SELECT value FROM json_each(?)) AND json_extract(payload, '$.source.plugin') = ?`;
function versionOf(db: DatabaseSync, pluginId: string, storageId: string): number | undefined {
  return (db.prepare("SELECT version FROM plugin_record_versions WHERE plugin_id = ? AND storage_id = ?")
    .get(pluginId, storageId) as { version: number } | undefined)?.version;
}
function writeVersion(db: DatabaseSync, pluginId: string, storageId: string, version: number): void {
  db.prepare(`INSERT INTO plugin_record_versions VALUES (?, ?, ?)
    ON CONFLICT(plugin_id, storage_id) DO UPDATE SET version = excluded.version`).run(pluginId, storageId, version);
}
function hasRows(db: DatabaseSync, pluginId: string, scope: string): boolean {
  return !!db.prepare(`SELECT 1 FROM session_nodes WHERE ${matches} LIMIT 1`).get(scope, pluginId);
}
function transaction<T>(db: DatabaseSync, run: () => T): T {
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

/** A logical storage unit in the workspace file, with its own version instead of SQLite's user_version. */
export function pluginRecordStorage(root: string, pluginId: string, declaration: PluginRecordStorageDeclaration): StorageDefinition {
  const file = workspaceFile(root);
  const { id: storageId, version } = declaration;
  const id = `records:${pluginId}/${storageId}`;
  const scope = JSON.stringify(declaration.contracts);
  return { id, file, inspect() {
    const from = inspectWorkspace(file, db => versionOf(db, pluginId, storageId) ?? (hasRows(db, pluginId, scope) ? 1 : undefined));
    if (from === undefined || from === version) return null;
    const steps = migrationPath(id, from, version, declaration.migrations);
    if (steps.some(step => typeof step !== "function")) throw new Error(`Invalid migration step for ${id}.`);
    return { change: { id, from, to: version }, apply() {
      const db = new DatabaseSync(file);
      try {
        transaction(db, () => {
          // Keyset batches keep memory bounded without iterating a live cursor over the table being updated.
          const select = db.prepare(`SELECT seq, id, contract, payload FROM session_nodes WHERE seq > ? AND ${matches} ORDER BY seq LIMIT 128`);
          const update = db.prepare("UPDATE session_nodes SET payload = ? WHERE seq = ?");
          let after = 0;
          while (true) {
            const rows = select.all(after, scope, pluginId) as { seq: number; id: string; contract: string; payload: string }[];
            if (!rows.length) break;
            for (const row of rows) {
              after = row.seq;
              const payload = JSON.parse(row.payload) as { data: Json };
              const oldData = JSON.stringify(payload.data);
              const refs = referenceIds(payload.data);
              let data = payload.data;
              try {
                for (const step of steps) data = jsonSchema.parse(step(row.contract, data));
                if (refs !== referenceIds(data)) throw new Error("Record migrations must preserve content references.");
                if (JSON.stringify(data) !== oldData) update.run(JSON.stringify({ ...payload, data }), row.seq);
              } catch (error) {
                throw new Error(`Could not migrate record ${row.id} in ${id}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
              }
            }
          }
          writeVersion(db, pluginId, storageId, version);
        });
      } finally { db.close(); }
    } };
  } };
}

function referenceIds(data: Json): string {
  return JSON.stringify(contentReferences(data).map(ref => ref["$asterism.content"]).sort());
}

/** Seed a record store before the first write. Empty stores need no migration or recovery point. */
export function initializePluginRecordStorage(db: DatabaseSync, prepared: {
  declarations: ReadonlyMap<string, readonly PluginStorageDeclaration[]>;
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
