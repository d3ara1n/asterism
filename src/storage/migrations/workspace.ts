import { workspaceDatabasePath, workspaceDatabaseVersion } from "../formats.ts";
import { sqliteStorage } from "./engine.ts";

export function workspaceStorage(root: string) {
  return sqliteStorage({ id: "workspace", file: workspaceDatabasePath(root), version: workspaceDatabaseVersion, migrations: {
    29: db => { db.exec(`CREATE INDEX session_nodes_pending ON session_nodes(session_id) WHERE json_extract(payload, '$.pending') = 1;`); },
    // Existing sessions and templates start without a folder; no membership is invented for them.
    30: db => { db.exec(`CREATE TABLE folders (id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL, created_at TEXT NOT NULL) STRICT;
      ALTER TABLE sessions ADD COLUMN folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL;
      ALTER TABLE templates ADD COLUMN folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL;`); },
    31: db => { db.exec("ALTER TABLE sessions ADD COLUMN completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1));"); },
    // The single focus island became an island arrangement; a focused object is not carried over as an island.
    32: db => { db.exec(`DROP TABLE workbench_focus;
      CREATE TABLE workbench_islands (
        session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
        islands_json TEXT NOT NULL
      ) STRICT;`); },
    // Existing sessions get a fresh inactivity baseline instead of inheriting their historical creation time.
    33: db => {
      db.exec(`ALTER TABLE sessions ADD COLUMN sleeping_at TEXT;
        ALTER TABLE sessions ADD COLUMN last_opened_at TEXT NOT NULL DEFAULT '';
        ALTER TABLE sessions ADD COLUMN keep_awake INTEGER NOT NULL DEFAULT 0 CHECK (keep_awake IN (0, 1));`);
      db.prepare("UPDATE sessions SET last_opened_at = ?").run(new Date().toISOString());
    },
    // Earlier starts were not recorded; existing templates begin without a use time.
    34: db => { db.exec("ALTER TABLE templates ADD COLUMN last_used_at TEXT;"); },
    35: db => { db.exec(`CREATE TABLE plugin_record_versions (
      plugin_id TEXT NOT NULL,
      storage_id TEXT NOT NULL,
      version INTEGER NOT NULL CHECK (version > 0),
      PRIMARY KEY (plugin_id, storage_id)
    ) STRICT;`); },
  } });
}
