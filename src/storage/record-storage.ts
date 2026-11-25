import { existsSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { belongsTo, jsonSchema, type Json } from "@asterism-app/sdk/contracts";
import type { PluginRecordMigration, PluginRecordStorageDeclaration, PluginStorageDeclaration, RecordMigrationEntry } from "@asterism-app/sdk/runtime";
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

type RecordRow = { seq: number; id: string; session_id: string; contract: string; payload: string };

/** Keyset batches do not hold an open cursor over the table whose records may be rewritten. */
function* ownedRows(db: DatabaseSync, pluginId: string, scope: string) {
  const select = db.prepare(`SELECT seq, id, session_id, contract, payload FROM session_nodes WHERE seq > ? AND ${matches} ORDER BY seq LIMIT 128`);
  let after = 0;
  for (;;) {
    const rows = select.all(after, scope, pluginId) as RecordRow[];
    if (!rows.length) return;
    yield* rows;
    after = rows.at(-1)!.seq;
  }
}
function readRow(row: RecordRow) {
  const payload = JSON.parse(row.payload) as { data: Json };
  return { row, payload, previous: JSON.stringify(payload.data), refs: referenceIds(payload.data) };
}
function migrationError(id: string, target: string, error: unknown): Error {
  return new Error(`Could not migrate ${target} in ${id}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
}

function migrateRecords(db: DatabaseSync, pluginId: string, scope: string, id: string, step: PluginRecordMigration): void {
  const update = db.prepare("UPDATE session_nodes SET payload = ? WHERE seq = ?");
  function write({ row, payload, previous, refs }: ReturnType<typeof readRow>, converted: Json): void {
    try {
      const data = jsonSchema.parse(converted);
      if (refs !== referenceIds(data)) throw new Error("Record migrations must preserve content references.");
      if (JSON.stringify(data) !== previous) update.run(JSON.stringify({ ...payload, data }), row.seq);
    } catch (error) { throw migrationError(id, `record ${row.id}`, error); }
  }
  if (typeof step === "function") {
    for (const row of ownedRows(db, pluginId, scope)) {
      const record = readRow(row);
      let data: Json;
      try { data = step(row.contract, record.payload.data); }
      catch (error) { throw migrationError(id, `record ${row.id}`, error); }
      write(record, data);
    }
    return;
  }

  // Index only membership, not payloads. Read one complete group at a time, even when its records interleave with others.
  db.exec(`CREATE TEMP TABLE record_migration_groups (
    session_id TEXT NOT NULL, group_key TEXT NOT NULL, seq INTEGER NOT NULL,
    PRIMARY KEY (session_id, group_key, seq)
  ) WITHOUT ROWID`);
  const add = db.prepare("INSERT INTO record_migration_groups VALUES (?, ?, ?)");
  for (const row of ownedRows(db, pluginId, scope)) {
    try {
      const key = step.groupBy({ contract: row.contract, data: (JSON.parse(row.payload) as { data: Json }).data });
      if (key !== null) {
        if (typeof key !== "string") throw new Error("A migration group key must be a string or null.");
        add.run(row.session_id, key, row.seq);
      }
    } catch (error) { throw migrationError(id, `record ${row.id}`, error); }
  }
  const groupRows = db.prepare(`SELECT n.seq, n.id, n.session_id, n.contract, n.payload
    FROM record_migration_groups g JOIN session_nodes n ON n.seq = g.seq
    WHERE g.session_id = ? AND g.group_key = ? ORDER BY g.seq`);
  // This cursor reads only the temporary index, never the table being updated.
  const groups = db.prepare("SELECT DISTINCT session_id, group_key FROM record_migration_groups ORDER BY session_id, group_key");
  for (const { session_id, group_key } of groups.iterate() as Iterable<{ session_id: string; group_key: string }>) {
    const records = (groupRows.all(session_id, group_key) as RecordRow[]).map(readRow);
    const input: RecordMigrationEntry[] = records.map(({ row, payload }) => ({ contract: row.contract, data: payload.data }));
    let output: readonly Json[];
    try {
      output = step.migrate(input);
      if (!Array.isArray(output) || output.length !== records.length)
        throw new Error("A group migration must return one payload per record, in order.");
    } catch (error) { throw migrationError(id, `group ${JSON.stringify(group_key)} in session ${session_id}`, error); }
    for (const [index, record] of records.entries()) write(record, output[index]!);
  }
  db.exec("DROP TABLE record_migration_groups");
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
    if (steps.some(step => typeof step !== "function" && (!step || typeof step.groupBy !== "function" || typeof step.migrate !== "function")))
      throw new Error(`Invalid migration step for ${id}.`);
    return { change: { id, from, to: version }, apply() {
      const db = new DatabaseSync(file);
      try {
        transaction(db, () => {
          for (const step of steps) migrateRecords(db, pluginId, scope, id, step);
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
