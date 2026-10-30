import { randomUUID } from "node:crypto";
import { nanoid } from "nanoid";
import type { DatabaseSync } from "node:sqlite";
import { sessionNodeSchema, type NewNode, type SessionNode } from "../shared/session.ts";
import { SessionError } from "../shared/session-timeline.ts";
import type { NodeQuery, NodeView, SequencedNode } from "./view.ts";
import { foldWorkbench, type FoldedState } from "./fold.ts";
import { SessionStructure, type StructuralNode } from "./structure.ts";
import { deepFreeze } from "../shared/immutable.ts";
import { SessionTitleAssigned, type ResourceRef, type Json } from "@asterism-app/sdk/contracts";
export { SessionError } from "../shared/session-timeline.ts";

export type CursorSelection = {
  seq: number;
  fromId: string | null;
  requestedId: string | null;
  selectedId: string | null;
  reason: "user";
  recordedAt: string;
};

/** Session tree storage: fixed node identity and ancestry, with one-time completion of explicitly pending operations. */
export class SessionTree {
  constructor(private readonly db: DatabaseSync) {}
  private readonly workbenches = new Map<string, { cursor: string | null; state: FoldedState }>();
  private readonly identities = new Map<string, ResourceRef>();
  private readonly structures = new Map<string, SessionStructure>();

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
    this.db.prepare("INSERT INTO sessions (id, title, initial_title, created_at, cursor) VALUES (?, ?, ?, ?, NULL)").run(id, title, title, new Date().toISOString());
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
    this.structures.delete(sessionId);
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

  /** Capture unresolved bodies only; completed nodes stay immutable and can be read lazily at fixed endpoints. */
  view(sessionId: string): NodeView {
    const row = this.db.prepare("SELECT title, cursor FROM sessions WHERE id = ? AND archived_at IS NULL").get(sessionId) as
      { title: string; cursor: string | null } | undefined;
    if (!row) throw new SessionError("not_found", "Session not found.");
    const upperSeq = this.head(sessionId);
    const pending = new Map((this.db.prepare("SELECT payload FROM session_nodes WHERE session_id = ? AND json_extract(payload, '$.pending') = 1")
      .all(sessionId) as { payload: string }[]).map(({ payload }) => {
        const node = sessionNodeSchema.parse(JSON.parse(payload));
        return [node.id, node] as const;
      }));
    return { id: sessionId, title: row.title, nodeId: row.cursor,
      timelineIds: () => this.pathNodes(sessionId, row.cursor).map(node => node.id),
      read: query => this.readView(sessionId, row.cursor, upperSeq, query, pending) };
  }

  /** Committed structure index; rows enter only outside transactions, so rollback and reused positions cannot leave stale entries. */
  private structure(sessionId: string): SessionStructure {
    let structure = this.structures.get(sessionId);
    if (!structure) { structure = new SessionStructure(); this.structures.set(sessionId, structure); }
    if (!this.db.isTransaction) {
      const rows = this.db.prepare("SELECT id, parent_id AS parentId, seq, contract FROM session_nodes WHERE session_id = ? AND seq > ? ORDER BY seq")
        .iterate(sessionId, structure.head) as Iterable<StructuralNode>;
      for (const row of rows) structure.add({ ...row });
    }
    return structure;
  }

  /** Root-to-node path: committed ancestry from the index and any uncommitted tail from storage. */
  private path(sessionId: string, nodeId: string | null) {
    const structure = this.structure(sessionId), tail: StructuralNode[] = [];
    let read: ReturnType<DatabaseSync["prepare"]> | undefined;
    let id = nodeId;
    while (id !== null && !structure.get(id)) {
      read ??= this.db.prepare("SELECT id, parent_id AS parentId, seq, contract FROM session_nodes WHERE session_id = ? AND id = ?");
      const row = read.get(sessionId, id) as StructuralNode | undefined;
      if (!row) throw new SessionError("not_found", "Session node not found.");
      if (tail.length && row.seq >= tail.at(-1)!.seq) throw new SessionError("conflict", "Session ancestry is outside its append order.");
      tail.push({ ...row });
      id = row.parentId;
    }
    if (tail.length && id !== null && structure.get(id)!.seq >= tail.at(-1)!.seq)
      throw new SessionError("conflict", "Session ancestry is outside its append order.");
    return { structure, length: structure.locate(id), tail: tail.reverse() };
  }
  private pathNodes(sessionId: string, nodeId: string | null): StructuralNode[] {
    const { structure, length, tail } = this.path(sessionId, nodeId);
    return [...structure.select(length), ...tail];
  }

  private readNodes(entries: Iterable<{ id: string }>, pending?: ReadonlyMap<string, SessionNode>): SessionNode[] {
    const read = this.db.prepare("SELECT payload FROM session_nodes WHERE id = ?");
    return Array.from(entries, ({ id }) => {
      const captured = pending?.get(id);
      if (captured) return structuredClone(captured);
      const row = read.get(id) as { payload: string } | undefined;
      if (!row) throw new SessionError("not_found", "Session node not found.");
      return sessionNodeSchema.parse(JSON.parse(row.payload));
    });
  }

  private readView(sessionId: string, nodeId: string | null, upperSeq: number, query: NodeQuery, pending: ReadonlyMap<string, SessionNode>): SequencedNode[] {
    const matches = (node: StructuralNode) => !query.contracts || query.contracts.includes(node.contract);
    let structure: SessionStructure, selected: StructuralNode[];
    if (query.scope === "timeline") {
      const path = this.path(sessionId, nodeId);
      structure = path.structure;
      // Read the indexed prefix immediately: locating another node repositions the shared spine.
      const indexed = structure.select(path.length, query.contracts, query.edge), extra = path.tail.filter(matches);
      selected = !query.edge ? [...indexed, ...extra]
        : query.edge === "first" ? (indexed.length ? indexed : extra.slice(0, 1))
          : (extra.length ? extra.slice(-1) : indexed);
    } else {
      structure = this.structure(sessionId);
      const extra = upperSeq > structure.head
        ? (this.db.prepare("SELECT id, parent_id AS parentId, seq, contract FROM session_nodes WHERE session_id = ? AND seq > ? AND seq <= ? ORDER BY seq")
          .all(sessionId, structure.head, upperSeq) as unknown as StructuralNode[]).filter(matches)
        : [];
      const all = [...structure.range(upperSeq, query.contracts), ...extra];
      selected = !query.edge ? all : query.edge === "first" ? all.slice(0, 1) : all.slice(-1);
    }
    if (!selected.length) return [];
    return this.readNodes(selected, pending).map((node, index) => ({ node, sequence: this.sequenceOf(sessionId, selected[index]!.seq, structure) }));
  }

  /** One-based session order of an append position; positions above the index count only the unindexed rows from storage. */
  private sequenceOf(sessionId: string, seq: number, structure: SessionStructure): number {
    const indexed = structure.rank(seq);
    if (seq <= structure.head) return indexed;
    return indexed + Number((this.db.prepare("SELECT COUNT(*) AS count FROM session_nodes WHERE session_id = ? AND seq > ? AND seq <= ?")
      .get(sessionId, structure.head, seq) as { count: number }).count);
  }

  /** Records committed in this batch already have bodies; fill in their session order only. */
  sequences(sessionId: string, nodes: readonly SessionNode[]): number[] {
    if (!nodes.length) return [];
    const structure = this.structure(sessionId);
    let position: ReturnType<DatabaseSync["prepare"]> | undefined;
    return nodes.map(node => {
      let seq = structure.get(node.id)?.seq;
      if (seq === undefined) {
        position ??= this.db.prepare("SELECT seq FROM session_nodes WHERE session_id = ? AND id = ?");
        seq = (position.get(sessionId, node.id) as { seq: number } | undefined)?.seq;
      }
      if (seq === undefined) throw new SessionError("not_found", "Session node not found.");
      return this.sequenceOf(sessionId, seq, structure);
    });
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

  node(sessionId: string, id: string): SessionNode {
    this.cursor(sessionId);
    const row = this.db.prepare("SELECT payload FROM session_nodes WHERE session_id = ? AND id = ?").get(sessionId, id) as { payload: string } | undefined;
    if (!row) throw new SessionError("not_found", "Session record not found.");
    return sessionNodeSchema.parse(JSON.parse(row.payload));
  }

  /** Fill a pending record once; its original position, identity, and source remain unchanged. */
  complete(sessionId: string, id: string, finish: (record: SessionNode) => Json): SessionNode {
    const node = this.node(sessionId, id);
    if (node.pending !== true) throw new SessionError("conflict", "The record is not pending.");
    const completed = sessionNodeSchema.parse({ ...node, data: finish(structuredClone(node)), pending: false });
    this.db.prepare("UPDATE session_nodes SET payload = ? WHERE session_id = ? AND id = ?")
      .run(JSON.stringify(completed), sessionId, id);
    return completed;
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
      const assignment = this.view(sessionId).read({ scope: "timeline", contracts: [SessionTitleAssigned.id], edge: "last" })[0];
      const title = assignment ? SessionTitleAssigned.schema.parse(assignment.node.data).title
        : (this.db.prepare("SELECT initial_title AS title FROM sessions WHERE id = ?").get(sessionId) as { title: string }).title;
      this.setTitle(sessionId, title);
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
    return this.readNodes(this.pathNodes(sessionId, at === undefined ? cursor : at));
  }
}
