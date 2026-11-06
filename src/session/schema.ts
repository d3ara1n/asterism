/** Index only unresolved operation records; fixed snapshots capture those bodies without copying completed history. */
export const pendingRecordsIndexSql = `CREATE INDEX session_nodes_pending ON session_nodes(session_id)
  WHERE json_extract(payload, '$.pending') = 1;`;

export const keepAwakeColumnSql = "keep_awake INTEGER NOT NULL DEFAULT 0 CHECK (keep_awake IN (0, 1))";

/** Folders group sessions and templates; color is a palette token. Deleting a folder leaves its members without a folder. */
export const folderSchemaSql = `
  CREATE TABLE folders (id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL, created_at TEXT NOT NULL) STRICT;
`;
/** Membership column shared by new schemas and the format migration; null means the row belongs to no folder. */
export const folderColumnSql = "folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL";

export const completedColumnSql = "completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1))";

export const sleepingColumnSql = "sleeping_at TEXT";
export const lastOpenedColumnSql = "last_opened_at TEXT NOT NULL";

/** Runtime database creation and independent contract tests share the session storage structure. */
export const sessionSchemaSql = `
  ${folderSchemaSql}
  -- archived_at is null for nonarchived sessions; otherwise it is the archive time, with startup cleanup deleting sessions past the retention period.
  CREATE TABLE sessions (id TEXT PRIMARY KEY, title TEXT NOT NULL, initial_title TEXT NOT NULL, created_at TEXT NOT NULL, cursor TEXT, archived_at TEXT, ${folderColumnSql}, ${completedColumnSql}, ${sleepingColumnSql}, ${lastOpenedColumnSql}, ${keepAwakeColumnSql});
  CREATE TABLE session_nodes (
    seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    parent_id TEXT, payload TEXT NOT NULL,
    contract TEXT GENERATED ALWAYS AS (json_extract(payload, '$.contract')) VIRTUAL);
  CREATE INDEX session_nodes_session ON session_nodes(session_id, seq);
  ${pendingRecordsIndexSql}
  CREATE TABLE cursor_selections (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    from_id TEXT REFERENCES session_nodes(id),
    requested_id TEXT REFERENCES session_nodes(id),
    selected_id TEXT REFERENCES session_nodes(id),
    reason TEXT NOT NULL CHECK(reason = 'user'),
    recorded_at TEXT NOT NULL);
  CREATE INDEX cursor_selections_session ON cursor_selections(session_id, seq);
`;
