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
import { FolderStore } from "../session/folders.ts";
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
/** Rebuild the format-30 shape: no folders table, and sessions and templates without membership columns. */
function revertFolders(db: DatabaseSync) {
  db.exec(`PRAGMA foreign_keys = OFF;
    CREATE TABLE sessions_v30 (id TEXT PRIMARY KEY, title TEXT NOT NULL, initial_title TEXT NOT NULL, created_at TEXT NOT NULL, cursor TEXT, archived_at TEXT);
    INSERT INTO sessions_v30 SELECT id, title, initial_title, created_at, cursor, archived_at FROM sessions;
    DROP TABLE sessions; ALTER TABLE sessions_v30 RENAME TO sessions;
    CREATE TABLE templates_v30 (id TEXT PRIMARY KEY, title TEXT NOT NULL, created_at TEXT NOT NULL, data_json TEXT NOT NULL) STRICT;
    INSERT INTO templates_v30 SELECT id, title, created_at, data_json FROM templates;
    DROP TABLE templates; ALTER TABLE templates_v30 RENAME TO templates;
    DROP TABLE folders; PRAGMA foreign_keys = ON;`);
}
const count = (db: DatabaseSync, table: string, sessionId: string) =>
  Number((db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE session_id = ?`).get(sessionId) as { n: number }).n);

// The pending-record index upgrade preserves existing finalized payloads and allows publication in the same database.
it("upgrades the preceding workspace format without rewriting existing history", () => {
  const { root, db, tree } = setup(), sessionId = tree.create("Existing");
  const original = tree.appendToTimeline(sessionId, event("example/final", { text: "Saved response" }));
  revertFolders(db);
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

// Membership columns added by ALTER must keep the delete contract: removing a folder releases its members instead of failing or deleting them.
it("adds folder membership without assigning existing rows, and deleting a folder releases its members", () => {
  const { root, db, tree } = setup(), sessionId = tree.create("Existing");
  const templateId = "7a1f2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d", folderId = "0b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e";
  db.prepare("INSERT INTO templates (id, title, created_at, data_json) VALUES (?, ?, ?, ?)")
    .run(templateId, "Template", new Date().toISOString(), JSON.stringify({ objects: [], links: [], views: [] }));
  revertFolders(db);
  db.exec("PRAGMA user_version = 30;");
  db.close(); databases.splice(databases.indexOf(db), 1);
  workspaceStorage(root).inspect()!.apply();
  const reopened = openDatabase(root); databases.push(reopened);
  const folders = new FolderStore(reopened);
  const templateFolder = () => (reopened.prepare("SELECT folder_id FROM templates WHERE id = ?").get(templateId) as { folder_id: string | null }).folder_id;
  expect(folders.sessionFolders().get(sessionId)).toBeNull();
  expect(templateFolder()).toBeNull();
  folders.create(folderId, "Work", "blue");
  folders.moveSession(sessionId, folderId); folders.moveTemplate(templateId, folderId);
  expect(folders.sessionFolders().get(sessionId)).toBe(folderId);
  folders.delete(folderId);
  expect(folders.sessionFolders().get(sessionId)).toBeNull();
  expect(templateFolder()).toBeNull();
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
