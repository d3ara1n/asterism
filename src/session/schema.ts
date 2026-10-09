/** 会话存储结构由运行时建库和独立契约测试共用。 */
export const sessionSchemaSql = `
  CREATE TABLE sessions (id TEXT PRIMARY KEY, title TEXT NOT NULL, created_at TEXT NOT NULL, cursor TEXT);
  CREATE TABLE session_nodes (
    seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    parent_id TEXT, kind TEXT NOT NULL, payload TEXT NOT NULL,
    response_id TEXT GENERATED ALWAYS AS (json_extract(payload, '$.responseId')) VIRTUAL,
    ordinal INTEGER GENERATED ALWAYS AS (json_extract(payload, '$.ordinal')) VIRTUAL,
    UNIQUE(id, session_id, response_id));
  CREATE INDEX session_nodes_session ON session_nodes(session_id, seq);
  CREATE UNIQUE INDEX session_block_ordinal ON session_nodes(session_id, response_id, ordinal)
    WHERE response_id IS NOT NULL;
  CREATE TABLE block_completions (
    block_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    response_id TEXT NOT NULL,
    recorded_at TEXT NOT NULL,
    payload TEXT NOT NULL,
    UNIQUE(session_id, response_id),
    FOREIGN KEY(block_id, session_id, response_id) REFERENCES session_nodes(id, session_id, response_id));
  CREATE VIEW session_blocks AS
    SELECT n.id, n.session_id, n.parent_id, n.seq, n.kind, n.response_id, n.ordinal,
      json_extract(n.payload, '$.agentId') AS agent_id,
      json_extract(n.payload, '$.requestParentId') AS request_parent_id,
      json_extract(n.payload, '$.model') AS model,
      json_extract(c.payload, '$.usage') AS usage,
      json_extract(c.payload, '$.finishReason') AS finish_reason,
      json_extract(c.payload, '$.rawFinishReason') AS raw_finish_reason,
      json_extract(c.payload, '$.providerResponseId') AS provider_response_id
    FROM session_nodes n LEFT JOIN block_completions c ON c.block_id = n.id
    WHERE n.response_id IS NOT NULL;
  CREATE VIEW session_usage AS
    SELECT id, session_id, agent_id, response_id, model, usage FROM session_blocks WHERE usage IS NOT NULL
    UNION ALL
    SELECT id, session_id, json_extract(payload, '$.agentId'),
      json_extract(payload, '$.response.responseId'), json_extract(payload, '$.response.model'),
      json_extract(payload, '$.response.usage')
    FROM session_nodes WHERE kind = 'notice' AND json_type(payload, '$.response.usage') = 'object';
  CREATE TABLE cursor_selections (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES sessions(id),
    from_id TEXT REFERENCES session_nodes(id),
    requested_id TEXT REFERENCES session_nodes(id),
    selected_id TEXT REFERENCES session_nodes(id),
    reason TEXT NOT NULL CHECK(reason IN ('user', 'continuation')),
    recorded_at TEXT NOT NULL);
  CREATE INDEX cursor_selections_session ON cursor_selections(session_id, seq);
`;
