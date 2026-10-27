import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { SessionTree } from "../session/tree.ts";
import { created, event } from "../session/test-nodes.ts";
import { sessionRetentionMs } from "../shared/application.ts";
import { collectExpiredSessions, openDatabase } from "./storage.ts";

const roots: string[] = [], databases: DatabaseSync[] = [];
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function setup() {
  const root = mkdtempSync(join(tmpdir(), "asterism-storage-")); roots.push(root);
  const db = openDatabase(root); databases.push(db);
  return { db, tree: new SessionTree(db) };
}
const count = (db: DatabaseSync, table: string, sessionId: string) =>
  Number((db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE session_id = ?`).get(sessionId) as { n: number }).n);

// Retention contract: delete only sessions archived before the retention period; associated data disappears with the session.
describe("Startup cleanup of expired archived sessions", () => {
  it("cascades deletion through session rows, history, cursor selection logs, and content roots while retaining unexpired and active sessions", () => {
    const { db, tree } = setup();
    const now = Date.parse("2026-10-24T00:00:00Z");
    const expired = tree.create("expired"), recent = tree.create("recent"), active = tree.create("active");
    // Cursor selection logs reference historical nodes; both cascade only on session deletion, and FK failures reject the whole deletion.
    const first = tree.appendToTimeline(expired, created("a1", "Agent"));
    tree.appendToTimeline(expired, event("example.plugin/opaque", {}));
    tree.select(expired, first.id);
    db.prepare("INSERT INTO contents VALUES (?, ?, ?)").run("c1", "digest", 1);
    db.prepare("INSERT INTO content_roots VALUES (?, ?, ?, ?, ?)").run(expired, "a1", "data", "root", "c1");
    tree.archive(expired, new Date(now - sessionRetentionMs - 1).toISOString());
    tree.archive(recent, new Date(now - sessionRetentionMs + 60_000).toISOString());

    expect(collectExpiredSessions(db, now)).toBe(1);
    for (const table of ["session_nodes", "cursor_selections", "content_roots"]) expect(count(db, table, expired)).toBe(0);
    expect(db.prepare("SELECT id FROM sessions ORDER BY title").all().map(row => (row as { id: string }).id).sort())
      .toEqual([active, recent].sort());
    // Content entries themselves remain for unreferenced-content reclamation by the content store.
    expect(db.prepare("SELECT id FROM contents").all()).toEqual([{ id: "c1" }]);
  });
});

// Presence gate contract: archived sessions do not exist for business reads/writes or object identity resolution; the trash catalog lists them separately.
describe("Archived session presence gate", () => {
  it("archival removes sessions from active catalogs, cursor reads, and object identity resolution; restoration makes them visible again", () => {
    const { tree } = setup();
    const s = tree.create("S");
    tree.appendToTimeline(s, created("a1", "Agent"));
    expect(tree.resourceRef("a1")).toMatchObject({ sessionId: s });

    tree.archive(s, "2026-10-24T00:00:00.000Z");
    expect(tree.list()).toEqual([]);
    expect(tree.archived()).toMatchObject([{ id: s, archivedAt: "2026-10-24T00:00:00.000Z" }]);
    expect(() => tree.cursor(s)).toThrow("Session not found.");
    expect(() => tree.view(s)).toThrow("Session not found.");
    // Identities cached before archival must no longer resolve either.
    expect(tree.resourceRef("a1")).toBeNull();

    tree.restore(s);
    expect(tree.list().map(item => item.id)).toEqual([s]);
    expect(tree.archived()).toEqual([]);
    expect(tree.resourceRef("a1")).toMatchObject({ sessionId: s });
  });
});
