import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { applicationStorage } from "../shared/application.ts";
import { sqliteStorage } from "../storage/migrations.ts";

/** Ledger format; increment on changes and append an n → n+1 step to `telemetryStorage`. */
export const telemetryDatabaseVersion = 1;

/**
 * Usage ledger: one row per model request, per tool call made by an execution request, and per plugin-reported external use.
 * Rows hold identifiers, counts, timings, cost estimates, and display-name snapshots for later deletion of sessions, folders, or plugins;
 * never prompts, responses, or tool payloads.
 */
const schemaSql = `
  CREATE TABLE model_usage_events (
    id TEXT PRIMARY KEY,
    started_at INTEGER NOT NULL,
    duration_ms INTEGER,
    first_output_ms INTEGER,
    plugin_id TEXT NOT NULL,
    purpose_id TEXT,
    purpose_label_snapshot TEXT,
    session_id TEXT,
    session_title_snapshot TEXT,
    folder_id_snapshot TEXT,
    folder_name_snapshot TEXT,
    folder_color_snapshot TEXT,
    provider_id TEXT NOT NULL,
    provider_name_snapshot TEXT NOT NULL,
    model_id TEXT NOT NULL,
    thinking TEXT,
    input_tokens INTEGER,
    output_tokens INTEGER,
    total_tokens INTEGER,
    reasoning_tokens INTEGER,
    cache_read_tokens INTEGER,
    cache_write_tokens INTEGER,
    tool_calls INTEGER NOT NULL,
    cost_usd REAL,
    cost_status TEXT NOT NULL,
    cost_input_usd REAL,
    cost_cache_read_usd REAL,
    cost_cache_write_usd REAL,
    cost_output_usd REAL,
    cost_reasoning_usd REAL,
    cache_saved_usd REAL,
    tier_from_input_tokens INTEGER,
    outcome TEXT NOT NULL CHECK (outcome IN ('completed', 'failed', 'cancelled')),
    error_origin TEXT,
    error_code TEXT
  ) STRICT;
  CREATE INDEX model_usage_started ON model_usage_events(started_at);
  CREATE INDEX model_usage_session ON model_usage_events(session_id, started_at);
  CREATE INDEX model_usage_model ON model_usage_events(provider_id, model_id, started_at);
  CREATE INDEX model_usage_plugin ON model_usage_events(plugin_id, purpose_id, started_at);

  CREATE TABLE tool_usage_events (
    id TEXT PRIMARY KEY,
    model_event_id TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    duration_ms INTEGER,
    tool_name TEXT NOT NULL,
    implementation_id TEXT,
    resource_kind TEXT,
    outcome TEXT NOT NULL,
    error_code TEXT
  ) STRICT;
  CREATE INDEX tool_usage_model_event ON tool_usage_events(model_event_id);
  CREATE INDEX tool_usage_started ON tool_usage_events(started_at);

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
  CREATE INDEX external_usage_recorded ON external_usage_events(recorded_at);
`;

export function telemetryDatabasePath(root: string): string {
  return join(root, applicationStorage.telemetryDirectory, applicationStorage.telemetryDatabaseFile);
}

/** Pre-window preparation migrates the ledger with host storage; the ledger stays outside recovery points. */
export function telemetryStorage(root: string) {
  return sqliteStorage({ id: "telemetry", file: telemetryDatabasePath(root), version: telemetryDatabaseVersion, migrations: {} });
}

export class TelemetryVersionError extends Error {
  constructor(found: number) {
    super(`Usage ledger format ${found} does not match this build (${telemetryDatabaseVersion}). Prepare the data before opening the ledger.`);
  }
}

/** Create the ledger on first use; existing ledgers must already have the current format. */
export function openTelemetryDatabase(root: string): DatabaseSync {
  mkdirSync(join(root, applicationStorage.telemetryDirectory), { recursive: true });
  const db = new DatabaseSync(telemetryDatabasePath(root));
  try {
    db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;");
    const version = (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
    if (version === 0 && !db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").get()) {
      db.exec("BEGIN IMMEDIATE;");
      db.exec(schemaSql);
      db.exec(`PRAGMA user_version = ${telemetryDatabaseVersion}; COMMIT;`);
    } else if (version !== telemetryDatabaseVersion) throw new TelemetryVersionError(version);
    // Per-connection mirror of live session folders, rewritten before each read so folder grouping follows the workspace.
    db.exec("CREATE TEMP TABLE live_sessions (id TEXT PRIMARY KEY, folder_id TEXT) STRICT;");
    return db;
  } catch (error) {
    if (db.isTransaction) db.exec("ROLLBACK;");
    db.close();
    throw error;
  }
}
