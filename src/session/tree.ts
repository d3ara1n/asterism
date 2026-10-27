import { randomUUID } from "node:crypto";
import { nanoid } from "nanoid";
import type { DatabaseSync } from "node:sqlite";
import { sessionNodeSchema, type NewNode, type SessionNode } from "../shared/session.ts";
import { SessionError } from "../shared/session-timeline.ts";
import type { NodeQuery, NodeView, SequencedNode } from "./view.ts";
import { foldWorkbench, type FoldedState } from "./fold.ts";
import { deepFreeze } from "../shared/immutable.ts";
import type { ResourceRef } from "@asterism-app/sdk/contracts";
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

/** Session tree storage and current timeline execution; nodes are immutable and sessions.cursor determines the current timeline end. */
export class SessionTree {
  constructor(private readonly db: DatabaseSync) {}
  private readonly workbenches = new Map<string, { cursor: string | null; state: FoldedState }>();
  private readonly identities = new Map<string, ResourceRef>();

  /** Creation record identity is immutable; reuse after the first ID lookup without rereading historical bodies. */
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

  /** Sole current-workbench reconstruction entry; replay fully on cursor changes and use the actual cursor again after rollback. */
  workbench(sessionId: string): FoldedState {
    const cursor = this.cursor(sessionId);
    const previous = this.workbenches.get(sessionId);
    if (previous?.cursor === cursor) return previous.state;
    const state = deepFreeze(foldWorkbench(this.view(sessionId).read({
      scope: "timeline", contracts: ["resource_created", "resource_renamed", "object_removed", "resource_attached", "resource_detached"],
    }).map(({ node }) => node)));
    this.workbenches.set(sessionId, { cursor, state });
    return state;
  }

  create(title: string, id: string = randomUUID()): string {
    this.db.prepare("INSERT INTO sessions (id, title, created_at, cursor) VALUES (?, ?, ?, NULL)").run(id, title, new Date().toISOString());
    return id;
  }
  /** Active session catalog; archived sessions are read only through archived. */
  list(): { id: string; title: string; createdAt: string }[] {
    return (this.db.prepare("SELECT id, title, created_at FROM sessions WHERE archived_at IS NULL ORDER BY created_at DESC, rowid DESC").all() as
      { id: string; title: string; created_at: string }[]).map(r => ({ id: r.id, title: r.title, createdAt: r.created_at }));
  }
  /** Trash catalog: lists sessions themselves without reading their contents. */
  archived(): { id: string; title: string; createdAt: string; archivedAt: string }[] {
    return (this.db.prepare("SELECT id, title, created_at, archived_at FROM sessions WHERE archived_at IS NOT NULL ORDER BY archived_at DESC, rowid DESC").all() as
      { id: string; title: string; created_at: string; archived_at: string }[])
      .map(r => ({ id: r.id, title: r.title, createdAt: r.created_at, archivedAt: r.archived_at }));
  }
  /** Mark archived; subsequent reads, writes, and object identity resolution treat the session as absent. */
  archive(sessionId: string, at = new Date().toISOString()): void {
    if (!this.db.prepare("UPDATE sessions SET archived_at = ? WHERE id = ? AND archived_at IS NULL").run(at, sessionId).changes)
      throw new SessionError("not_found", "Session not found.");
    this.workbenches.delete(sessionId);
    for (const [id, ref] of this.identities) if (ref.sessionId === sessionId) this.identities.delete(id);
  }
  /** Unarchive by clearing the field only, without reading session contents. */
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

  /** Immutable nodes allow deferred reads with fixed endpoints and append bounds, without holding transactions or copying history. */
  view(sessionId: string): NodeView {
    const row = this.db.prepare("SELECT title, cursor FROM sessions WHERE id = ? AND archived_at IS NULL").get(sessionId) as
      { title: string; cursor: string | null } | undefined;
    if (!row) throw new SessionError("not_found", "Session not found.");
    const upperSeq = this.head(sessionId);
    return { id: sessionId, title: row.title, nodeId: row.cursor,
      timelineIds: () => Array.from(this.ancestors(sessionId, row.cursor, upperSeq), entry => entry.id).reverse(),
      read: query => this.readView(sessionId, row.cursor, upperSeq, query) };
  }

  /** Deliver structural fields one by one along parent pointers; stop at a last match without moving unrelated bodies. */
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

  /** Input follows append order; count only nonoverlapping index ranges without reading other record bodies. */
  private numberSequences(sessionId: string, positions: readonly number[]): number[] {
    const count = this.db.prepare("SELECT COUNT(*) AS count FROM session_nodes WHERE session_id = ? AND seq > ? AND seq <= ?");
    let previous = 0, sequence = 0;
    return positions.map(position => {
      sequence += Number((count.get(sessionId, previous, position) as { count: number }).count);
      previous = position;
      return sequence;
    });
  }

  /** Records committed in this batch already have bodies; fill in their session order only. */
  sequences(sessionId: string, nodes: readonly SessionNode[]): number[] {
    if (!nodes.length) return [];
    const position = this.db.prepare("SELECT seq FROM session_nodes WHERE session_id = ? AND id = ?");
    return this.numberSequences(sessionId, nodes.map(node => {
      const row = position.get(sessionId, node.id) as { seq: number } | undefined;
      if (!row) throw new SessionError("not_found", "Session node not found.");
      return row.seq;
    }));
  }

  /** Append at the current timeline end at commit time and advance the cursor; does not support writing to arbitrary tree nodes. */
  appendToTimeline(sessionId: string, node: NewNode): SessionNode {
    const parentId = this.cursor(sessionId);
    const full = sessionNodeSchema.parse({ ...node, id: nanoid(16), sessionId, parentId, createdAt: new Date().toISOString() });
    // savepoints can nest in application transactions; nodes and cursors save or roll back together.
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

  /** Select a historical position; callers must ensure sessions are settled. Every node is a valid position without snapping. */
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

  /** Maximum committed node sequence number; notifications and queries use it to determine freshness. */
  head(sessionId: string): number {
    return Number((this.db.prepare("SELECT COALESCE(MAX(seq), 0) AS seq FROM session_nodes WHERE session_id = ?").get(sessionId) as { seq: number }).seq);
  }
  /** Committed nodes with sequence numbers above seq; post-commit notifications use this to obtain batch records. */
  since(sessionId: string, seq: number): SessionNode[] {
    return (this.db.prepare("SELECT payload FROM session_nodes WHERE session_id = ? AND seq > ? ORDER BY seq").all(sessionId, seq) as { payload: string }[])
      .map(row => sessionNodeSchema.parse(JSON.parse(row.payload)));
  }
  /** Overwrite session titles without appending nodes. */
  setTitle(sessionId: string, text: string): void {
    this.db.prepare("UPDATE sessions SET title = ? WHERE id = ?").run(text, sessionId);
  }
  /** Execution cursor; undefined before session creation, for before/after commit comparisons. */
  position(sessionId: string): string | null | undefined {
    return (this.db.prepare("SELECT cursor FROM sessions WHERE id = ? AND archived_at IS NULL").get(sessionId) as { cursor: string | null } | undefined)?.cursor;
  }
  /** null before session creation, for before/after commit comparisons. */
  titleOf(sessionId: string): string | null {
    return (this.db.prepare("SELECT title FROM sessions WHERE id = ? AND archived_at IS NULL").get(sessionId) as { title: string } | undefined)?.title ?? null;
  }
  title(sessionId: string): string {
    const title = this.titleOf(sessionId);
    if (title === null) throw new SessionError("not_found", "Session not found.");
    return title;
  }
  /** Read root-to-end timelines; omitted at uses the execution cursor. Reading neither activates positions nor grants append capability. */
  timeline(sessionId: string, at?: string | null): SessionNode[] {
    const cursor = this.cursor(sessionId);
    return this.readNodes(this.ancestors(sessionId, at === undefined ? cursor : at, this.head(sessionId))).reverse();
  }
}
