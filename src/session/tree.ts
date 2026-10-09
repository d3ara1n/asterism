import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { completionSchema, sessionNodeSchema, type BlockCompletion, type NewNode, type SessionNode } from "../shared/session.ts";
import { SessionError, isBlockNode, selectable, sessionPath, snap } from "../shared/session-path.ts";
export { SessionError } from "../shared/session-path.ts";

export type CursorSelection = {
  seq: number;
  fromId: string | null;
  requestedId: string | null;
  selectedId: string | null;
  reason: "user" | "continuation";
  recordedAt: string;
};

/** 会话级扁平事件树：节点只追加，sessions.cursor 保存当前路径的末端。 */
export class SessionTree {
  constructor(private readonly db: DatabaseSync) {}

  create(title: string, id: string = randomUUID()): string {
    this.db.prepare("INSERT INTO sessions (id, title, created_at, cursor) VALUES (?, ?, ?, NULL)").run(id, title, new Date().toISOString());
    return id;
  }
  list(): { id: string; title: string; createdAt: string }[] {
    return (this.db.prepare("SELECT id, title, created_at FROM sessions ORDER BY created_at DESC, rowid DESC").all() as
      { id: string; title: string; created_at: string }[]).map(r => ({ id: r.id, title: r.title, createdAt: r.created_at }));
  }
  cursor(sessionId: string): string | null {
    const row = this.db.prepare("SELECT cursor FROM sessions WHERE id = ?").get(sessionId) as { cursor: string | null } | undefined;
    if (!row) throw new SessionError("not_found", "Session not found.");
    return row.cursor;
  }
  nodes(sessionId: string): SessionNode[] {
    this.cursor(sessionId);
    return (this.db.prepare(`SELECT n.payload, c.payload AS completion FROM session_nodes n
      LEFT JOIN block_completions c ON c.block_id = n.id WHERE n.session_id = ? ORDER BY n.seq`)
      .all(sessionId) as { payload: string; completion: string | null }[])
      .map(r => sessionNodeSchema.parse({ ...JSON.parse(r.payload), ...(r.completion ? JSON.parse(r.completion) : {}) }));
  }

  /** 在游标后追加；不完整 block 不移动游标，它不是可续接位置。 */
  append(sessionId: string, node: NewNode): SessionNode {
    const parentId = this.cursor(sessionId);
    const full = sessionNodeSchema.parse({ ...node, id: randomUUID(), sessionId, parentId, createdAt: new Date().toISOString() });
    if (isBlockNode(full)) {
      if (full.finishReason !== null || full.usage !== null || full.rawFinishReason !== null || full.providerResponseId !== null) {
        throw new SessionError("invalid_request", "Terminal metadata must be appended through completeBlock.");
      }
      const previous = this.db.prepare("SELECT payload FROM session_nodes WHERE session_id = ? AND response_id = ? LIMIT 1")
        .get(sessionId, full.responseId) as { payload: string } | undefined;
      if (previous) {
        const first = sessionNodeSchema.parse(JSON.parse(previous.payload));
        if (!isBlockNode(first) || first.agentId !== full.agentId || first.requestParentId !== full.requestParentId
          || first.model !== full.model || first.scope !== full.scope || first.adapter !== full.adapter) {
          throw new SessionError("invalid_request", "Response blocks must share the same request identity.");
        }
      } else if (full.requestParentId !== null && !this.path(sessionId).some(item => item.id === full.requestParentId)) {
        throw new SessionError("invalid_request", "The request origin must be on the current session path.");
      }
      if (this.db.prepare("SELECT 1 FROM block_completions WHERE session_id = ? AND response_id = ?").get(sessionId, full.responseId)) {
        throw new SessionError("conflict", "The response is already finalized.");
      }
    }
    // savepoint 可嵌在应用事务中；节点与游标要么同时保存，要么同时回退。
    this.db.exec("SAVEPOINT append_session_node");
    try {
      this.db.prepare("INSERT INTO session_nodes (id, session_id, parent_id, kind, payload) VALUES (?, ?, ?, ?, ?)")
        .run(full.id, sessionId, parentId, full.kind, JSON.stringify(full));
      if (selectable(full)) this.db.prepare("UPDATE sessions SET cursor = ? WHERE id = ?").run(full.id, sessionId);
      this.db.exec("RELEASE append_session_node");
    } catch (error) {
      this.db.exec("ROLLBACK TO append_session_node; RELEASE append_session_node");
      throw error;
    }
    return full;
  }

  /** 选择历史位置；调用方须保证会话 settled。位置会吸附到合法续接点。 */
  select(sessionId: string, nodeId: string | null, reason: "user" | "continuation" = "user"): string | null {
    const nodes = this.nodes(sessionId);
    const from = this.cursor(sessionId);
    const target = nodeId === null ? null : snap(nodes, nodeId);
    this.db.exec("SAVEPOINT select_session_cursor");
    try {
      this.db.prepare(`INSERT INTO cursor_selections (session_id, from_id, requested_id, selected_id, reason, recorded_at)
        VALUES (?, ?, ?, ?, ?, ?)`).run(sessionId, from, nodeId, target, reason, new Date().toISOString());
      this.db.prepare("UPDATE sessions SET cursor = ? WHERE id = ?").run(target, sessionId);
      this.db.exec("RELEASE select_session_cursor");
    } catch (error) {
      this.db.exec("ROLLBACK TO select_session_cursor; RELEASE select_session_cursor");
      throw error;
    }
    return target;
  }

  /** 终态元数据只追加一次；不更新原始块，不改变父指针或游标。 */
  completeBlock(sessionId: string, blockId: string, raw: BlockCompletion): void {
    const completion = completionSchema.parse(raw);
    const row = this.db.prepare("SELECT payload FROM session_nodes WHERE session_id = ? AND id = ?")
      .get(sessionId, blockId) as { payload: string } | undefined;
    const node = row ? sessionNodeSchema.parse(JSON.parse(row.payload)) : null;
    if (!node || !isBlockNode(node)) throw new SessionError("invalid_request", "Terminal metadata requires a saved response block.");
    const last = this.db.prepare("SELECT id FROM session_nodes WHERE session_id = ? AND response_id = ? ORDER BY ordinal DESC LIMIT 1")
      .get(sessionId, node.responseId) as { id: string };
    if (last.id !== blockId) throw new SessionError("invalid_request", "Terminal metadata belongs to the last response block.");
    this.db.prepare(`INSERT INTO block_completions (block_id, session_id, response_id, recorded_at, payload)
      VALUES (?, ?, ?, ?, ?)`).run(blockId, sessionId, node.responseId, new Date().toISOString(), JSON.stringify(completion));
  }

  cursorSelections(sessionId: string): CursorSelection[] {
    this.cursor(sessionId);
    return this.db.prepare(`SELECT seq, from_id AS fromId, requested_id AS requestedId, selected_id AS selectedId,
      reason, recorded_at AS recordedAt FROM cursor_selections WHERE session_id = ? ORDER BY seq`).all(sessionId) as CursorSelection[];
  }

  /** 已提交的最大节点序号；通知与查询据此判断新旧。 */
  head(sessionId: string): number {
    return Number((this.db.prepare("SELECT COALESCE(MAX(seq), 0) AS seq FROM session_nodes WHERE session_id = ?").get(sessionId) as { seq: number }).seq);
  }
  title(sessionId: string): string {
    const row = this.db.prepare("SELECT title FROM sessions WHERE id = ?").get(sessionId) as { title: string } | undefined;
    if (!row) throw new SessionError("not_found", "Session not found.");
    return row.title;
  }
  path(sessionId: string, at: string | null = this.cursor(sessionId)): SessionNode[] { return sessionPath(this.nodes(sessionId), at); }
}
