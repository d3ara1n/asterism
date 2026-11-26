import { telemetryDatabasePath, telemetryDatabaseVersion } from "../formats.ts";
import { sqliteStorage } from "./engine.ts";

export function telemetryStorage(root: string) {
  return sqliteStorage({ id: "telemetry", file: telemetryDatabasePath(root), version: telemetryDatabaseVersion, migrations: {
    // Declared subjects start with this format; earlier requests have none.
    1: db => { db.exec(`
  CREATE TABLE usage_subjects (
    id TEXT PRIMARY KEY,
    model_event_id TEXT NOT NULL,
    tool_event_id TEXT,
    declared_by TEXT NOT NULL,
    kind TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    source_id TEXT,
    relation TEXT NOT NULL,
    part TEXT,
    quantity REAL
  ) STRICT;
  CREATE INDEX usage_subjects_model_event ON usage_subjects(model_event_id);
  CREATE INDEX usage_subjects_subject ON usage_subjects(kind, subject_id);
`); },
    2: db => { db.exec(`
  ALTER TABLE model_usage_events ADD COLUMN model_kind TEXT NOT NULL DEFAULT 'language' CHECK (model_kind IN ('language', 'decision'));
  DROP INDEX model_usage_model;
  CREATE INDEX model_usage_model ON model_usage_events(model_kind, provider_id, model_id, started_at);
`); },
  } });
}
