import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { sessionSchemaSql } from "../session/schema.ts";
import { applicationStorage, sessionRetentionMs } from "../shared/application.ts";
import { contentSchemaSql } from "./content-store.ts";
import { templateSchemaSql } from "./templates.ts";
import { sqliteStorage } from "../storage/migrations.ts";

export const workspaceDatabaseVersion = 26;

/** Business database opening consumes prepared formats only; pre-window data preparation handles upgrades. */
export class DatabaseVersionError extends Error {
  constructor(readonly directory: string, found: number) {
    super(`Workspace database format ${found} does not match this build (${workspaceDatabaseVersion}). Prepare the data before opening the workspace.`);
  }
}

export function openDatabase(root: string): DatabaseSync {
  mkdirSync(join(root, applicationStorage.databaseDirectory), { recursive: true });
  const db = new DatabaseSync(join(root, applicationStorage.databaseDirectory, applicationStorage.databaseFile));
  try {
    db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
    // New databases are created and stamped only here; pre-window preparation upgrades existing databases.
    const version = (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
    if (version === 0 && !db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").get()) {
      db.exec("BEGIN IMMEDIATE;");
      initializeWorkspace(db);
      db.exec(`PRAGMA user_version = ${workspaceDatabaseVersion}; COMMIT;`);
    }
    else if (version !== workspaceDatabaseVersion) throw new DatabaseVersionError(join(root, applicationStorage.databaseDirectory), version);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

function initializeWorkspace(db: DatabaseSync): void {
  db.exec(`
      CREATE TABLE workspace (id TEXT PRIMARY KEY, title TEXT NOT NULL);
      ${sessionSchemaSql}
      CREATE TABLE object_views (
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE, object_id TEXT NOT NULL,
        x REAL NOT NULL, y REAL NOT NULL, hidden INTEGER NOT NULL DEFAULT 0,
        collapsed INTEGER NOT NULL DEFAULT 0,
        width REAL, height REAL,
        CHECK ((width IS NULL AND height IS NULL) OR (width > 0 AND height > 0 AND width IS NOT NULL AND height IS NOT NULL)),
        PRIMARY KEY(session_id, object_id)
      );
      CREATE TABLE viewports (session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE, x REAL NOT NULL, y REAL NOT NULL, zoom REAL NOT NULL);
      -- Session-level submission deduplication for home sends; agent-internal submission deduplication belongs to agent resource state.
      CREATE TABLE session_submissions (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE
      ) STRICT;
      -- Current session data; an empty object_id denotes session scope, with typed contracts independent of the timeline.
      CREATE TABLE session_data (
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        object_id TEXT NOT NULL, contract_id TEXT NOT NULL,
        data_json TEXT NOT NULL,
        PRIMARY KEY(session_id, object_id, contract_id)
      ) STRICT;
      ${templateSchemaSql}
      ${contentSchemaSql}`);
  db.prepare("INSERT INTO workspace VALUES (?, ?)").run(randomUUID(), "Personal workspace");
}

/** Retain every released migration step permanently; key 25 means 25 → 26. Only `openDatabase` creates new databases. */
export function workspaceStorage(root: string) {
  return sqliteStorage({ id: "workspace", file: join(root, applicationStorage.databaseDirectory, applicationStorage.databaseFile),
    version: workspaceDatabaseVersion, migrations: {} });
}
/** Startup cleanup hard-deletes archived sessions past retention, cascades associated rows through foreign keys, and leaves orphan content for the subsequently constructed store. */
export function collectExpiredSessions(db: DatabaseSync, now = Date.now()): number {
  const cutoff = new Date(now - sessionRetentionMs).toISOString();
  return Number(db.prepare("DELETE FROM sessions WHERE archived_at IS NOT NULL AND archived_at <= ?").run(cutoff).changes);
}
