import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { applicationStorage } from "../shared/application.ts";

export const telemetryDatabaseVersion = 1;

export const telemetrySchemaSql = `
  CREATE TABLE model_usage_events (
    id TEXT PRIMARY KEY,
    started_at INTEGER NOT NULL,
    ended_at INTEGER NOT NULL,
    duration_ms INTEGER,
    first_output_ms INTEGER,
    first_text_ms INTEGER,
    first_reasoning_ms INTEGER,
    output_chunks INTEGER,
    plugin_id TEXT NOT NULL,
    entry_kind TEXT NOT NULL,
    resource_id TEXT,
    resource_kind TEXT,
    session_id TEXT,
    session_title_snapshot TEXT,
    folder_id_snapshot TEXT,
    folder_name_snapshot TEXT,
    folder_color_snapshot TEXT,
    purpose_id TEXT,
    purpose_label_snapshot TEXT,
    provider_id TEXT NOT NULL,
    provider_name_snapshot TEXT NOT NULL,
    model_id TEXT NOT NULL,
    protocol TEXT,
    thinking TEXT,
    input_tokens INTEGER,
    output_tokens INTEGER,
    total_tokens INTEGER,
    reasoning_tokens INTEGER,
    cache_read_tokens INTEGER,
    cache_write_tokens INTEGER,
    has_files INTEGER NOT NULL DEFAULT 0,
    tool_call_count INTEGER NOT NULL DEFAULT 0,
    cost_usd REAL,
    cost_status TEXT NOT NULL,
    uncached_input_cost_usd REAL,
    cache_read_cost_usd REAL,
    cache_write_cost_usd REAL,
    text_output_cost_usd REAL,
    reasoning_cost_usd REAL,
    tier_from_input_tokens INTEGER,
    cache_saved_usd REAL,
    outcome TEXT NOT NULL,
    finish_reason TEXT,
    error_origin TEXT,
    error_code TEXT
  ) STRICT;
  CREATE INDEX idx_model_usage_started ON model_usage_events(started_at);
  CREATE INDEX idx_model_usage_session ON model_usage_events(session_id, started_at);
  CREATE INDEX idx_model_usage_model ON model_usage_events(provider_id, model_id, started_at);
  CREATE INDEX idx_model_usage_plugin ON model_usage_events(plugin_id, purpose_id, started_at);

  CREATE TABLE tool_usage_events (
    id TEXT PRIMARY KEY,
    model_event_id TEXT,
    started_at INTEGER NOT NULL,
    duration_ms INTEGER,
    session_id TEXT,
    plugin_id TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    implementation_id TEXT,
    target_resource_kind TEXT,
    outcome_kind TEXT NOT NULL,
    error_code TEXT
  ) STRICT;
  CREATE INDEX idx_tool_usage_started ON tool_usage_events(started_at);
  CREATE INDEX idx_tool_usage_name ON tool_usage_events(tool_name, started_at);
  CREATE INDEX idx_tool_usage_resource ON tool_usage_events(target_resource_kind, started_at);

  CREATE TABLE external_usage_events (
    id TEXT PRIMARY KEY,
    recorded_at INTEGER NOT NULL,
    plugin_id TEXT NOT NULL,
    session_id TEXT,
    folder_id_snapshot TEXT,
    category TEXT NOT NULL,
    provider_label TEXT,
    quantity REAL,
    unit TEXT,
    currency TEXT,
    amount REAL,
    outcome TEXT NOT NULL,
    duration_ms INTEGER
  ) STRICT;
  CREATE INDEX idx_external_usage_recorded ON external_usage_events(recorded_at);
  CREATE INDEX idx_external_usage_plugin ON external_usage_events(plugin_id, category, recorded_at);
`;

/** Consecutive n -> n+1 schema migrations for telemetry.sqlite. */
export const telemetryMigrations: Readonly<Record<number, (db: DatabaseSync) => void>> = {};

function initializeTelemetry(db: DatabaseSync): void {
  db.exec("BEGIN IMMEDIATE;");
  try {
    db.exec(telemetrySchemaSql);
    db.exec(`PRAGMA user_version = ${telemetryDatabaseVersion};`);
    db.exec("COMMIT;");
  } catch (error) {
    try { db.exec("ROLLBACK;"); } catch { /* ignore */ }
    throw error;
  }
}

function migrateTelemetry(db: DatabaseSync, fromVersion: number): void {
  for (let v = fromVersion; v < telemetryDatabaseVersion; v++) {
    if (!telemetryMigrations[v]) throw new Error(`Missing telemetry migration from version ${v} to ${v + 1}.`);
  }
  db.exec("BEGIN IMMEDIATE;");
  try {
    for (let v = fromVersion; v < telemetryDatabaseVersion; v++) {
      telemetryMigrations[v]!(db);
    }
    db.exec(`PRAGMA user_version = ${telemetryDatabaseVersion};`);
    db.exec("COMMIT;");
  } catch (error) {
    try { db.exec("ROLLBACK;"); } catch { /* ignore */ }
    throw error;
  }
}

function openAndPrepare(file: string): DatabaseSync {
  const db = new DatabaseSync(file);
  try {
    db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;");
    const version = (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
    const hasTables = !!db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").get();
    if (version === 0 && !hasTables) {
      initializeTelemetry(db);
    } else if (version === telemetryDatabaseVersion) {
      // Quick integrity check on table existence.
      const table = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'model_usage_events'").get();
      if (!table) throw new Error("Telemetry database schema is incomplete.");
    } else if (version > 0 && version < telemetryDatabaseVersion) {
      migrateTelemetry(db, version);
    } else {
      throw new Error(`Unsupported telemetry database version: ${version} (expected ${telemetryDatabaseVersion}).`);
    }
    return db;
  } catch (error) {
    try { db.close(); } catch { /* ignore */ }
    throw error;
  }
}

function quarantineCorruptFile(file: string): void {
  const suffix = `.corrupt-${Date.now()}`;
  try {
    if (existsSync(file)) renameSync(file, `${file}${suffix}`);
  } catch {
    try { rmSync(file, { force: true }); } catch { /* ignore */ }
  }
  for (const extra of ["-wal", "-shm"]) {
    try { rmSync(`${file}${extra}`, { force: true }); } catch { /* ignore */ }
  }
}

export function telemetryDatabasePath(root: string): string {
  return join(root, applicationStorage.telemetryDirectory, applicationStorage.telemetryDatabaseFile);
}

/**
 * Open the independent telemetry SQLite database outside recovery points.
 * Migration or corruption failures quarantine the old file and initialize a fresh ledger rather than blocking startup.
 */
export function openTelemetryDatabase(root: string): DatabaseSync {
  const dir = join(root, applicationStorage.telemetryDirectory);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, applicationStorage.telemetryDatabaseFile);
  try {
    return openAndPrepare(file);
  } catch (error) {
    console.error("Telemetry database could not be opened or migrated; recreating a fresh database.", error);
    quarantineCorruptFile(file);
    return openAndPrepare(file);
  }
}
