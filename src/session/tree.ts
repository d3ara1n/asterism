import { randomUUID } from "node:crypto";
import { nanoid } from "nanoid";
import type { DatabaseSync } from "node:sqlite";
import { sessionNodeSchema, type NewNode, type SessionNode } from "../shared/session.ts";
import { SessionError } from "../shared/session-timeline.ts";
import type { NodeQuery, NodeView, SequencedNode } from "./view.ts";
import { foldWorkbench, type FoldedState } from "./fold.ts";
import { deepFreeze } from "../shared/immutable.ts";
import type { ResourceRef } from "@atelier/sdk/contracts";
export { SessionError } from "../shared/session-timeline.ts";

export type CursorSelection = {
  seq: number;
  fromId: string | null;
  requestedId: string | null;
  selectedId: string | null;
  reason: "user";
  recordedAt: string;
};

type NodeIndex = { id: string; seq: number; contract: string };

/** 会话树存储与当前时间线执行；节点不可改写，sessions.cursor 确定当前时间线末端。 */
export class SessionTree {
  constructor(private readonly db: DatabaseSync) {}
  private readonly workbenches = new Map<string, { cursor: string | null; state: FoldedState }>();
  private readonly identities = new Map<string, ResourceRef>();

  /** 创建记录的身份不可变；首次按 ID 查找后直接复用，不重复读取历史正文。 */
  resourceRef(id: string): ResourceRef | null {
    const known = this.identities.get(id);
    if (known) return known;
    const row = this.db.prepare(`SELECT session_id AS sessionId, json_extract(payload, '$.data.type') AS kind
      FROM session_nodes WHERE json_extract(payload, '$.contract') = 'resource_created'
      AND json_extract(payload, '$.data.id') = ?
      AND EXISTS (SELECT 1 FROM sessions s WHERE s.id = session_nodes.session_id AND s.archived_at IS NULL) LIMIT 1`).get(id) as { sessionId: string; kind: string } | undefined;
    if (!row) return null;
    const ref = { ...row, id };
    if (!this.db.isTransaction) this.identities.set(id, ref);
    return ref;
  }

  /** 当前工作台的唯一重建入口；游标变化全量重放，回滚后按实际游标重新取用。 */
  workbench(sessionId: string): FoldedState {
    const cursor = this.cursor(sessionId);
    const previous = this.workbenches.get(sessionId);
    if (previous?.cursor === cursor) return previous.state;
    const state = deepFreeze(foldWorkbench(this.view(sessionId).read({
      scope: "timeline", contracts: ["resource_created", "object_removed", "resource_attached", "resource_detached"],
    }).map(({ node }) => node)));
    this.workbenches.set(sessionId, { cursor, state });
    return state;
  }

  create(title: string, id: string = randomUUID()): string {
    this.db.prepare("INSERT INTO sessions (id, title, created_at, cursor) VALUES (?, ?, ?, NULL)").run(id, title, new Date().toISOString());
    return id;
  }
  /** 活跃会话目录；归档会话只经 archived 读取。 */
  list(): { id: string; title: string; createdAt: string }[] {
    return (this.db.prepare("SELECT id, title, created_at FROM sessions WHERE archived_at IS NULL ORDER BY created_at DESC, rowid DESC").all() as
      { id: string; title: string; created_at: string }[]).map(r => ({ id: r.id, title: r.title, createdAt: r.created_at }));
  }
  /** 回收站目录：只列会话本身，不读取会话内容。 */
  archived(): { id: string; title: string; createdAt: string; archivedAt: string }[] {
    return (this.db.prepare("SELECT id, title, created_at, archived_at FROM sessions WHERE archived_at IS NOT NULL ORDER BY archived_at DESC, rowid DESC").all() as
      { id: string; title: string; created_at: string; archived_at: string }[])
      .map(r => ({ id: r.id, title: r.title, createdAt: r.created_at, archivedAt: r.archived_at }));
  }
  /** 标记归档；此后该会话的读取、写入与对象身份解析一律视为不存在。 */
  archive(sessionId: string, at = new Date().toISOString()): void {
    if (!this.db.prepare("UPDATE sessions SET archived_at = ? WHERE id = ? AND archived_at IS NULL").run(at, sessionId).changes)
      throw new SessionError("not_found", "Session not found.");
    this.workbenches.delete(sessionId);
    for (const [id, ref] of this.identities) if (ref.sessionId === sessionId) this.identities.delete(id);
  }
  /** 取消归档；只清除字段，不读取会话内容。 */
  restore(sessionId: string): void {
    if (!this.db.prepare("UPDATE sessions SET archived_at = NULL WHERE id = ? AND archived_at IS NOT NULL").run(sessionId).changes)
      throw new SessionError("not_found", "Archived session not found.");
  }
  cursor(sessionId: string): string | null {
    const row = this.db.prepare("SELECT cursor FROM sessions WHERE id = ? AND archived_at IS NULL").get(sessionId) as { cursor: string | null } | undefined;
    if (!row) throw new SessionError("not_found", "Session not found.");
    return row.cursor;
  }
  nodes(sessionId: string): SessionNode[] {
    this.cursor(sessionId);
    return (this.db.prepare("SELECT payload FROM session_nodes WHERE session_id = ? ORDER BY seq").all(sessionId) as { payload: string }[])
      .map(r => sessionNodeSchema.parse(JSON.parse(r.payload)));
  }

  /** 节点不可变：固定末端与追加上界即可延后读取，无需持有事务或复制历史。 */
  view(sessionId: string): NodeView {
    const row = this.db.prepare("SELECT title, cursor FROM sessions WHERE id = ? AND archived_at IS NULL").get(sessionId) as
      { title: string; cursor: string | null } | undefined;
    if (!row) throw new SessionError("not_found", "Session not found.");
    const upperSeq = this.head(sessionId);
    return { id: sessionId, title: row.title, nodeId: row.cursor,
      timelineIds: () => Array.from(this.ancestors(sessionId, row.cursor, upperSeq), entry => entry.id).reverse(),
      read: query => this.readView(sessionId, row.cursor, upperSeq, query) };
  }

  /** 沿父指针逐个交付结构字段；last 命中即可停止，不搬运无关正文。 */
  private *ancestors(sessionId: string, nodeId: string | null, upperSeq: number): Iterable<NodeIndex> {
    const read = this.db.prepare("SELECT id, parent_id, seq, contract FROM session_nodes WHERE session_id = ? AND id = ?");
    let before = upperSeq + 1;
    for (let id = nodeId; id !== null;) {
      const entry = read.get(sessionId, id) as (NodeIndex & { parent_id: string | null }) | undefined;
      if (!entry) throw new SessionError("not_found", "Session node not found.");
      if (entry.seq >= before) throw new SessionError("conflict", "Session ancestry is outside its append order.");
      yield entry;
      id = entry.parent_id;
      before = entry.seq;
    }
  }

  private readNodes(entries: Iterable<{ id: string }>): SessionNode[] {
    const read = this.db.prepare("SELECT payload FROM session_nodes WHERE id = ?");
    return Array.from(entries, ({ id }) => {
      const row = read.get(id) as { payload: string } | undefined;
      if (!row) throw new SessionError("not_found", "Session node not found.");
      return sessionNodeSchema.parse(JSON.parse(row.payload));
    });
  }

  private readView(sessionId: string, nodeId: string | null, upperSeq: number, query: NodeQuery): SequencedNode[] {
    const backwards = query.scope === "timeline" || query.edge === "last";
    const entries = query.scope === "timeline" ? this.ancestors(sessionId, nodeId, upperSeq)
      : this.db.prepare(`SELECT id, seq, contract FROM session_nodes
          WHERE session_id = ? AND seq <= ? ORDER BY seq ${backwards ? "DESC" : "ASC"}`)
        .iterate(sessionId, upperSeq) as Iterable<NodeIndex>;
    const selected: NodeIndex[] = [];
    for (const entry of entries) {
      if (query.contracts && !query.contracts.includes(entry.contract)) continue;
      if (query.edge) {
        selected[0] = entry;
        if ((query.edge === "last") === backwards) break;
      } else selected.push(entry);
    }
    if (backwards) selected.reverse();
    if (!selected.length) return [];
    const sequences = this.numberSequences(sessionId, selected.map(entry => entry.seq));
    return this.readNodes(selected).map((node, index) => ({ node, sequence: sequences[index]! }));
  }

  /** 输入按追加顺序排列；只数互不重叠的索引区间，不读取其他记录的正文。 */
  private numberSequences(sessionId: string, positions: readonly number[]): number[] {
    const count = this.db.prepare("SELECT COUNT(*) AS count FROM session_nodes WHERE session_id = ? AND seq > ? AND seq <= ?");
    let previous = 0, sequence = 0;
    return positions.map(position => {
      sequence += Number((count.get(sessionId, previous, position) as { count: number }).count);
      previous = position;
      return sequence;
    });
  }

  /** 本批提交的记录已有正文，仅补齐会话内顺序。 */
  sequences(sessionId: string, nodes: readonly SessionNode[]): number[] {
    if (!nodes.length) return [];
    const position = this.db.prepare("SELECT seq FROM session_nodes WHERE session_id = ? AND id = ?");
    return this.numberSequences(sessionId, nodes.map(node => {
      const row = position.get(sessionId, node.id) as { seq: number } | undefined;
      if (!row) throw new SessionError("not_found", "Session node not found.");
      return row.seq;
    }));
  }

  /** 向提交时的当前时间线末端追加并推进游标；不提供向任意树节点写入的能力。 */
  appendToTimeline(sessionId: string, node: NewNode): SessionNode {
    const parentId = this.cursor(sessionId);
    const full = sessionNodeSchema.parse({ ...node, id: nanoid(16), sessionId, parentId, createdAt: new Date().toISOString() });
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
    if (nodeId !== null && !this.db.prepare("SELECT 1 FROM session_nodes WHERE session_id = ? AND id = ?").get(sessionId, nodeId))
      throw new SessionError("not_found", "Session node not found.");
    this.db.exec("SAVEPOINT select_session_cursor");
    try {
      this.db.prepare(`INSERT INTO cursor_selections (session_id, from_id, requested_id, selected_id, reason, recorded_at)
        VALUES (?, ?, ?, ?, ?, ?)`).run(sessionId, from, nodeId, nodeId, "user", new Date().toISOString());
      this.db.prepare("UPDATE sessions SET cursor = ? WHERE id = ?").run(nodeId, sessionId);
      this.db.exec("RELEASE select_session_cursor");
    } catch (error) {
      this.db.exec("ROLLBACK TO select_session_cursor; RELEASE select_session_cursor");
      throw error;
    }
    return nodeId;
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
    return (this.db.prepare("SELECT cursor FROM sessions WHERE id = ? AND archived_at IS NULL").get(sessionId) as { cursor: string | null } | undefined)?.cursor;
  }
  /** 会话尚未创建时为 null，供提交前后比较。 */
  titleOf(sessionId: string): string | null {
    return (this.db.prepare("SELECT title FROM sessions WHERE id = ? AND archived_at IS NULL").get(sessionId) as { title: string } | undefined)?.title ?? null;
  }
  title(sessionId: string): string {
    const title = this.titleOf(sessionId);
    if (title === null) throw new SessionError("not_found", "Session not found.");
    return title;
  }
  /** 读取根到末端的时间线；省略 at 时取执行游标，读取不激活该位置或授予追加能力。 */
  timeline(sessionId: string, at?: string | null): SessionNode[] {
    const cursor = this.cursor(sessionId);
    return this.readNodes(this.ancestors(sessionId, at === undefined ? cursor : at, this.head(sessionId))).reverse();
  }
}
