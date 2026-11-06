import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import type { ResourceRegistry } from "../resources/registry.ts";
import { SessionTree } from "../session/tree.ts";
import { created, event, removed } from "../session/test-nodes.ts";
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
/** Remove lifecycle columns when constructing fixtures for formats preceding version 34. */
function revertSleeping(db: DatabaseSync) {
  db.exec(`ALTER TABLE sessions DROP COLUMN sleeping_at;
    ALTER TABLE sessions DROP COLUMN last_opened_at;
    ALTER TABLE sessions DROP COLUMN keep_awake;`);
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
/** Rebuild the format-32 shape: the single focus table instead of the island arrangement. */
function revertIslands(db: DatabaseSync) {
  db.exec(`DROP TABLE workbench_islands;
    CREATE TABLE workbench_focus (session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE, object_id TEXT,
      width REAL CHECK (width IS NULL OR width > 0)) STRICT;`);
}
const count = (db: DatabaseSync, table: string, sessionId: string) =>
  Number((db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE session_id = ?`).get(sessionId) as { n: number }).n);

it("migrates format 33 with a fresh inactivity baseline and preserves saved history and catalog metadata", () => {
  const { root, db, tree } = setup();
  const folders = new FolderStore(db);
  folders.create("work", "Work", "blue");
  const session = tree.create("Existing", "existing", "work"), archived = tree.create("Archived");
  const original = tree.appendToTimeline(session, event("example/final", { text: "Saved response" }));
  tree.setCompleted(session, true);
  tree.archive(archived, "2020-01-01T00:00:00.000Z");
  db.prepare("UPDATE sessions SET created_at = ?").run("2019-01-01T00:00:00.000Z");
  revertSleeping(db);
  db.exec("PRAGMA user_version = 33;");
  db.close(); databases.splice(databases.indexOf(db), 1);
  workspaceStorage(root).inspect()!.apply();
  const reopened = openDatabase(root); databases.push(reopened);
  const next = new SessionTree(reopened), catalog = next.list()[0]!;
  expect(catalog).toMatchObject({ id: session, title: "Existing", createdAt: "2019-01-01T00:00:00.000Z", completed: true, sleeping: false, keepAwake: false });
  expect(catalog.lastOpenedAt).not.toBe("2019-01-01T00:00:00.000Z");
  expect(next.nodes(session)).toEqual([original]);
  expect(next.cursor(session)).toBe(original.id);
  expect(new FolderStore(reopened).sessionFolders().get(session)).toBe("work");
  expect(next.archived()).toMatchObject([{ id: archived, archivedAt: "2020-01-01T00:00:00.000Z" }]);
  expect(reopened.prepare("SELECT last_opened_at FROM sessions WHERE id = ?").get(archived)).toEqual({ last_opened_at: catalog.lastOpenedAt });
});

it("migrates existing sessions to uncompleted without changing history", () => {
  const { root, db, tree } = setup(), sessionId = tree.create("Existing");
  const original = tree.appendToTimeline(sessionId, event("example/final", { text: "Saved response" }));
  revertSleeping(db); revertIslands(db);
  db.exec("ALTER TABLE sessions DROP COLUMN completed; PRAGMA user_version = 31;");
  db.close(); databases.splice(databases.indexOf(db), 1);
  workspaceStorage(root).inspect()!.apply();
  const reopened = openDatabase(root); databases.push(reopened);
  const next = new SessionTree(reopened);
  expect(next.list().find(session => session.id === sessionId)?.completed).toBe(false);
  expect(next.nodes(sessionId)).toEqual([original]);
});

it("keeps completion independent of history selection, new records, and archival", () => {
  const { tree } = setup(), sessionId = tree.create("Task"), otherId = tree.create("Other");
  const original = tree.appendToTimeline(sessionId, event("example/final", { text: "Saved" }));
  const before = tree.list();
  tree.setCompleted(sessionId, true);
  expect(tree.list()).toEqual(before.map(session => ({ ...session, completed: session.id === sessionId })));
  expect(tree.cursor(sessionId)).toBe(original.id);
  expect(tree.nodes(sessionId)).toEqual([original]);
  tree.select(sessionId, null);
  tree.appendToTimeline(sessionId, event("example/final", { text: "Continued" }));
  tree.archive(sessionId);
  tree.restore(sessionId);
  expect(tree.list().find(session => session.id === sessionId)?.completed).toBe(true);
  tree.setCompleted(sessionId, false);
  expect(tree.list().filter(session => session.completed)).toEqual([]);
  tree.archive(otherId);
  expect(() => tree.setCompleted(otherId, true)).toThrow("Session not found.");
  expect(() => tree.setCompleted("missing", true)).toThrow("Session not found.");
});

// The pending-record index upgrade preserves existing finalized payloads and allows publication in the same database.
it("upgrades the preceding workspace format without rewriting existing history", () => {
  const { root, db, tree } = setup(), sessionId = tree.create("Existing");
  const original = tree.appendToTimeline(sessionId, event("example/final", { text: "Saved response" }));
  revertSleeping(db); revertIslands(db); revertFolders(db);
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
  revertSleeping(db); revertIslands(db); revertFolders(db);
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
  it("honors never retention and computes configurable boundaries without deleting sleeping or available sessions", () => {
    const { tree, db } = setup(), now = Date.parse("2026-10-24T00:00:00Z");
    const boundary = tree.create("Boundary"), recent = tree.create("Recent"), sleeping = tree.create("Sleeping");
    tree.archive(boundary, "2026-10-17T00:00:00.000Z");
    tree.archive(recent, "2026-10-17T00:00:00.001Z");
    tree.sleep(sleeping, "2020-01-01T00:00:00.000Z");
    expect(collectExpiredSessions(db, now, null)).toBe(0);
    expect(tree.archived()).toHaveLength(2);
    expect(collectExpiredSessions(db, now, 7)).toBe(1);
    expect(tree.archived().map(s => s.id)).toEqual([recent]);
    expect(tree.list()).toMatchObject([{ id: sleeping, sleeping: true }]);
  });

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
    tree.archive(expired, "2026-09-23T00:00:00.000Z");
    tree.archive(recent, "2026-09-25T00:00:00.000Z");

    expect(collectExpiredSessions(db, now, 30)).toBe(1);
    for (const table of ["session_nodes", "cursor_selections", "content_roots"]) expect(count(db, table, expired)).toBe(0);
    expect(db.prepare("SELECT id FROM sessions ORDER BY title").all().map(row => (row as { id: string }).id).sort())
      .toEqual([active, recent].sort());
    // Content entries themselves remain for unreferenced-content reclamation by the content store.
    expect(db.prepare("SELECT id FROM contents").all()).toEqual([{ id: "c1" }]);
  });
});

describe("Sleeping session storage", () => {
  it("gates runtime content and resource identities while keeping catalog metadata writable", () => {
    const { tree } = setup();
    const session = tree.create("Session");
    tree.appendToTimeline(session, created("cached", "Cached"));
    tree.appendToTimeline(session, created("uncached", "Uncached"));
    const history = tree.nodes(session);
    expect(tree.resourceRef("cached")).toMatchObject({ sessionId: session });
    tree.sleep(session, "2026-10-24T00:00:00.000Z");
    expect(tree.active()).toEqual([]);
    expect(() => tree.view(session)).toThrow("Session not found.");
    expect(() => tree.appendToTimeline(session, event("example/event", {}))).toThrow("Session not found.");
    expect(tree.resourceRef("cached")).toBeNull();
    expect(tree.resourceRef("uncached")).toBeNull();
    tree.setTitle(session, "Renamed while sleeping");
    tree.setKeepAwake(session, true);
    expect(tree.sleeping()).toMatchObject([{ id: session, title: "Renamed while sleeping", keepAwake: true }]);
    expect(tree.open(session, "2026-10-25T00:00:00.000Z")).toBe(true);
    expect(tree.nodes(session)).toEqual(history);
    expect(tree.resourceRef("cached")).toMatchObject({ sessionId: session });
    expect(tree.open(session, "2026-10-26T00:00:00.000Z")).toBe(false);
    expect(tree.active()).toMatchObject([{ id: session, lastOpenedAt: "2026-10-26T00:00:00.000Z" }]);
  });

  it("archives sleeping sessions without cursor access and restores awake with a refreshed baseline", () => {
    const { tree } = setup();
    const session = tree.create("Session");
    const original = tree.appendToTimeline(session, event("example/final", { text: "Saved" }));
    tree.setKeepAwake(session, true);
    tree.sleep(session, "2026-10-24T00:00:00.000Z");
    tree.archive(session, "2026-10-25T00:00:00.000Z");
    expect(tree.list()).toEqual([]);
    expect(() => tree.open(session)).toThrow("Session not found.");
    tree.restore(session, "2026-10-26T00:00:00.000Z");
    expect(tree.active()).toMatchObject([{ id: session, sleeping: false, keepAwake: true, lastOpenedAt: "2026-10-26T00:00:00.000Z" }]);
    expect(tree.nodes(session)).toEqual([original]);
    expect(tree.cursorSelections(session)).toEqual([]);
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

const islandWorkbench = (db: DatabaseSync, tree: SessionTree) =>
  new SessionWorkbench(db, tree, {} as ResourceRegistry);

// Island arrangement contract: stored as written; projection drops islands whose content left the current projection and the islands they opened.
describe("Session island layout", () => {
  it("keeps order, owners, and sizes, and drops islands of removed objects transitively", () => {
    const { db, tree } = setup();
    const s = tree.create("S");
    tree.appendToTimeline(s, created("a1", "Agent"));
    tree.appendToTimeline(s, created("d1", "Directory"));
    const workbench = islandWorkbench(db, tree);
    expect(workbench.layout(s).islands).toEqual([]);

    const islands = [
      { id: "object:d1", owner: "main-view", size: null, view: { kind: "object" as const, objectId: "d1" } },
      { id: "object:a1", owner: "main-view", size: 900, view: { kind: "object" as const, objectId: "a1" } },
      // Opened from the directory island but naming the agent: removing the directory still closes it.
      { id: "file:a", owner: "object:d1", size: null, view: { kind: "resource" as const, resourceId: "a1", location: "a.md" } },
      { id: "file:b", owner: "file:a", size: null, view: { kind: "resource" as const, resourceId: "a1", location: "b.md" } },
    ];
    workbench.mutate({ type: "islands.set", sessionId: s, islands });
    expect(workbench.layout(s).islands).toEqual(islands);

    tree.appendToTimeline(s, removed("d1"));
    expect(workbench.layout(s).islands.map(island => island.id)).toEqual(["object:a1"]);
  });
});
