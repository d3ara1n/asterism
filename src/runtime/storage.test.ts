import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import type { ResourceRegistry } from "../resources/registry.ts";
import { SessionTree } from "../session/tree.ts";
import { created, event, removed } from "../session/test-nodes.ts";
import { sessionRetentionMs } from "../shared/application.ts";
import { collectExpiredSessions, openDatabase, workspaceStorage } from "./storage.ts";
import { SessionWorkbench } from "./workbench.ts";

const roots: string[] = [], databases: DatabaseSync[] = [];
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function setup() {
  const root = mkdtempSync(join(tmpdir(), "asterism-storage-")); roots.push(root);
  const db = openDatabase(root); databases.push(db);
  return { root, db, tree: new SessionTree(db) };
}
const count = (db: DatabaseSync, table: string, sessionId: string) =>
  Number((db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE session_id = ?`).get(sessionId) as { n: number }).n);

// The pending-record index upgrade preserves existing finalized payloads and allows publication in the same database.
it("upgrades the preceding workspace format without rewriting existing history", () => {
  const { root, db, tree } = setup(), sessionId = tree.create("Existing");
  const original = tree.appendToTimeline(sessionId, event("example/final", { text: "Saved response" }));
  db.exec("DROP INDEX session_nodes_pending; PRAGMA user_version = 29;");
  db.close(); databases.splice(databases.indexOf(db), 1);
  workspaceStorage(root).inspect()!.apply();
  const reopened = openDatabase(root); databases.push(reopened);
  const next = new SessionTree(reopened);
  expect(next.nodes(sessionId)).toEqual([original]);
  const pending = next.appendToTimeline(sessionId, { ...event("example/operation", { input: "task", output: null }), pending: true });
  const captured = next.view(sessionId);
  next.complete(sessionId, pending.id, () => ({ input: "task", output: "report" }));
  expect(captured.read({ scope: "timeline", edge: "last" })[0]!.node.pending).toBe(true);
  expect(next.nodes(sessionId)[0]).toEqual(original);
  expect(next.node(sessionId, pending.id)).toMatchObject({ pending: false, data: { output: "report" } });
});

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

const focusWorkbench = (db: DatabaseSync, tree: SessionTree) =>
  new SessionWorkbench(db, tree, {} as ResourceRegistry);

// Focus layout contract: the projection releases focus once the object leaves the current projection, while the fixed width persists.
describe("Session focus layout", () => {
  it("projects focus only for present objects and keeps the width across focus changes", () => {
    const { db, tree } = setup();
    const s = tree.create("S");
    tree.appendToTimeline(s, created("a1", "Agent"));
    const workbench = focusWorkbench(db, tree);
    expect(workbench.layout(s).focus).toEqual({ objectId: null, width: null });

    workbench.mutate({ type: "focus.set", sessionId: s, objectId: "a1" });
    workbench.mutate({ type: "focus.set", sessionId: s, width: 1080 });
    expect(workbench.layout(s).focus).toEqual({ objectId: "a1", width: 1080 });

    // Ending focus keeps the width for the next entry.
    workbench.mutate({ type: "focus.set", sessionId: s, objectId: null });
    expect(workbench.layout(s).focus).toEqual({ objectId: null, width: 1080 });

    workbench.mutate({ type: "focus.set", sessionId: s, objectId: "a1" });
    tree.appendToTimeline(s, removed("a1"));
    expect(workbench.layout(s).focus).toEqual({ objectId: null, width: 1080 });
    expect(() => workbench.mutate({ type: "focus.set", sessionId: s, objectId: "a1" })).toThrow("Object does not belong to this session.");
    // A null width restores the shared default; an omitted width keeps it.
    workbench.mutate({ type: "focus.set", sessionId: s, width: null });
    expect(workbench.layout(s).focus).toEqual({ objectId: null, width: null });
  });
});
