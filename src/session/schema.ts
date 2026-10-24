/** 会话存储结构由运行时建库和独立契约测试共用。 */
export const sessionSchemaSql = `
  -- archived_at 为空表示活跃；非空为归档时间，超过冷静期后由启动清理删除。
  CREATE TABLE sessions (id TEXT PRIMARY KEY, title TEXT NOT NULL, created_at TEXT NOT NULL, cursor TEXT, archived_at TEXT);
  CREATE TABLE session_nodes (
    seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    parent_id TEXT, payload TEXT NOT NULL,
    contract TEXT GENERATED ALWAYS AS (json_extract(payload, '$.contract')) VIRTUAL);
  CREATE INDEX session_nodes_session ON session_nodes(session_id, seq);
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
