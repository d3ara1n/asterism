import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { sessionNodeSchema, type NewNode, type SessionNode } from "../shared/session.ts";
import { SessionError, sessionPath } from "../shared/session-path.ts";
export { SessionError } from "../shared/session-path.ts";

export type CursorSelection = {
  seq: number;
  fromId: string | null;
  requestedId: string | null;
  selectedId: string | null;
  reason: "user";
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
    return (this.db.prepare("SELECT payload FROM session_nodes WHERE session_id = ? ORDER BY seq").all(sessionId) as { payload: string }[])
      .map(r => sessionNodeSchema.parse(JSON.parse(r.payload)));
  }

  /** 在当前游标后追加通用记录并推进游标；宿主不解释载荷。 */
  append(sessionId: string, node: NewNode): SessionNode {
    const parentId = this.cursor(sessionId);
    const full = sessionNodeSchema.parse({ ...node, id: randomUUID(), sessionId, parentId, createdAt: new Date().toISOString() });
    // savepoint 可嵌在应用事务中；节点与游标要么同时保存，要么同时回退。
    this.db.exec("SAVEPOINT append_session_node");
    try {
      this.db.prepare("INSERT INTO session_nodes (id, session_id, parent_id, payload) VALUES (?, ?, ?, ?)")
        .run(full.id, sessionId, parentId, JSON.stringify(full));
      this.db.prepare("UPDATE sessions SET cursor = ? WHERE id = ?").run(full.id, sessionId);
      this.db.exec("RELEASE append_session_node");
    } catch (error) {
      this.db.exec("ROLLBACK TO append_session_node; RELEASE append_session_node");
      throw error;
    }
    return full;
  }

  /** 选择历史位置；调用方须保证会话 settled。所有节点都可作为位置，不吸附。 */
  select(sessionId: string, nodeId: string | null): string | null {
    const from = this.cursor(sessionId);
    const target = nodeId === null ? null : sessionPath(this.nodes(sessionId), nodeId).at(-1)!;
    this.db.exec("SAVEPOINT select_session_cursor");
    try {
      this.db.prepare(`INSERT INTO cursor_selections (session_id, from_id, requested_id, selected_id, reason, recorded_at)
        VALUES (?, ?, ?, ?, ?, ?)`).run(sessionId, from, nodeId, target?.id ?? null, "user", new Date().toISOString());
      this.db.prepare("UPDATE sessions SET cursor = ? WHERE id = ?").run(target?.id ?? null, sessionId);
      this.db.exec("RELEASE select_session_cursor");
    } catch (error) {
      this.db.exec("ROLLBACK TO select_session_cursor; RELEASE select_session_cursor");
      throw error;
    }
    return target?.id ?? null;
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
  /** 序号大于 seq 的已提交节点；提交后通知据此取本批记录。 */
  since(sessionId: string, seq: number): SessionNode[] {
    return (this.db.prepare("SELECT payload FROM session_nodes WHERE session_id = ? AND seq > ? ORDER BY seq").all(sessionId, seq) as { payload: string }[])
      .map(row => sessionNodeSchema.parse(JSON.parse(row.payload)));
  }
  /** 覆盖会话标题；不追加节点。 */
  setTitle(sessionId: string, text: string): void {
    this.db.prepare("UPDATE sessions SET title = ? WHERE id = ?").run(text, sessionId);
  }
  /** 执行游标；会话尚未创建时为 undefined，供提交前后比较。 */
  position(sessionId: string): string | null | undefined {
    return (this.db.prepare("SELECT cursor FROM sessions WHERE id = ?").get(sessionId) as { cursor: string | null } | undefined)?.cursor;
  }
  title(sessionId: string): string {
    const row = this.db.prepare("SELECT title FROM sessions WHERE id = ?").get(sessionId) as { title: string } | undefined;
    if (!row) throw new SessionError("not_found", "Session not found.");
    return row.title;
  }
  path(sessionId: string, at: string | null = this.cursor(sessionId)): SessionNode[] { return sessionPath(this.nodes(sessionId), at); }
}
