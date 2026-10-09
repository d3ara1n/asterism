import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { sessionNodeSchema, type BlockNode, type NewNode, type SessionNode } from "../shared/session.ts";

export class SessionError extends Error {
  constructor(readonly code: "not_found" | "conflict" | "invalid_request" | "unavailable" | "unavailable" | "unavailable" | "unavailable", message: string) { super(message); }
}

/** 会话级扁平事件树：节点只追加，游标移动也是追加（cursor 表只保存当前值）。 */
export class SessionTree {
  constructor(private readonly db: DatabaseSync) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, title TEXT NOT NULL, created_at TEXT NOT NULL, cursor TEXT);
      CREATE TABLE IF NOT EXISTS session_nodes (
        seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        parent_id TEXT, kind TEXT NOT NULL, payload TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS session_nodes_session ON session_nodes(session_id, seq);`);
  }

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

  /** 在游标后追加；不完整 block 不移动游标，它不是可续接位置。 */
  append(sessionId: string, node: NewNode): SessionNode {
    const parentId = this.cursor(sessionId);
    const full = sessionNodeSchema.parse({ ...node, id: randomUUID(), sessionId, parentId, createdAt: new Date().toISOString() });
    this.db.prepare("INSERT INTO session_nodes (id, session_id, parent_id, kind, payload) VALUES (?, ?, ?, ?, ?)")
      .run(full.id, sessionId, parentId, full.kind, JSON.stringify(full));
    if (selectable(full)) this.db.prepare("UPDATE sessions SET cursor = ? WHERE id = ?").run(full.id, sessionId);
    return full;
  }

  /** 选择历史位置；调用方须保证会话 settled。位置会吸附到合法续接点。 */
  select(sessionId: string, nodeId: string | null): string | null {
    const nodes = this.nodes(sessionId);
    const target = nodeId === null ? null : snap(nodes, nodeId);
    this.db.prepare("UPDATE sessions SET cursor = ? WHERE id = ?").run(target, sessionId);
    return target;
  }

  /** 已提交的最大序号，供通知与查询比较新旧。 */
  seq(sessionId: string): number {
    const row = this.db.prepare("SELECT MAX(seq) AS seq FROM session_nodes WHERE session_id = ?").get(sessionId) as { seq: number | null };
    return row.seq ?? 0;
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
  path(sessionId: string, at: string | null = this.cursor(sessionId)): SessionNode[] { return pathTo(this.nodes(sessionId), at); }
}

export function selectable(node: SessionNode): boolean { return !isBlock(node) || node.complete; }
export function isBlock(node: SessionNode): node is BlockNode { return node.kind === "thinking" || node.kind === "text" || node.kind === "toolcall"; }

/** 根到 at 的祖先路径。不完整 block 不在任何路径上（它从不成为父节点）。 */
export function pathTo(nodes: readonly SessionNode[], at: string | null): SessionNode[] {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const out: SessionNode[] = [];
  for (let cursor = at; cursor !== null;) {
    const node = byId.get(cursor);
    if (!node) throw new SessionError("not_found", "Session node not found.");
    out.push(node); cursor = node.parentId;
    if (out.length > byId.size) throw new SessionError("conflict", "Session tree contains a cycle.");
  }
  return out.reverse();
}

/** 吸附：不完整节点不可选；若某代理最后一个已收束前的 block 是 thinking，则向前退。 */
export function snap(nodes: readonly SessionNode[], nodeId: string): string | null {
  const node = nodes.find(n => n.id === nodeId);
  if (!node) throw new SessionError("not_found", "Session node not found.");
  if (!selectable(node)) throw new SessionError("invalid_request", "Incomplete blocks cannot be selected.");
  let path = pathTo(nodes, nodeId);
  while (path.length && !continuable(path)) path = path.slice(0, -1);
  return path.at(-1)?.id ?? null;
}

/** 每个代理在路径上的最后一个 block 不能是 thinking（除非其响应已收束且后续还有 block，这里即末尾检查）。 */
export function continuable(path: readonly SessionNode[]): boolean {
  const last = new Map<string, SessionNode>();
  for (const node of path) if (isBlock(node) || node.kind === "response_end") last.set(node.agentId, node);
  return [...last.values()].every(n => n.kind !== "thinking");
}
