import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { SessionTree } from "./tree.ts";
import { sessionSchemaSql } from "./schema.ts";
import { attached, created, event, removed } from "./test-nodes.ts";

const databases: DatabaseSync[] = [];
afterEach(() => { for (const db of databases.splice(0)) db.close(); });
function setup() {
  const db = new DatabaseSync(":memory:");
  databases.push(db);
  db.exec(sessionSchemaSql);
  const tree = new SessionTree(db);
  return { db, tree, s: tree.create("S") };
}
const record = (value: string) => event("example.plugin/opaque", { value });

// Timeline contract: all records append along the current cursor and node/cursor changes commit atomically.
describe("Session-level flat tree", () => {
  it("unknown domain payloads persist unchanged and remain readable after reopen", () => {
    const { db, tree, s } = setup();
    const payload = { custom: { values: [1, null, "opaque"] }, format: "plugin-owned" };
    const saved = tree.appendToTimeline(s, event("example.plugin/unknown", payload));
    expect(tree.cursor(s)).toBe(saved.id);
    expect(new SessionTree(db).nodes(s)).toMatchObject([{ id: saved.id, data: payload }]);
  });

  it("reads do not write selection logs; explicit selection saves original and actual positions without changing history", () => {
    const { tree, s } = setup();
    const first = tree.appendToTimeline(s, record("first"));
    const last = tree.appendToTimeline(s, record("last"));
    const original = tree.nodes(s);
    tree.timeline(s, first.id);
    expect(tree.cursorSelections(s)).toEqual([]);
    expect(tree.select(s, first.id)).toBe(first.id);
    expect(tree.cursorSelections(s)).toEqual([expect.objectContaining({
      fromId: last.id, requestedId: first.id, selectedId: first.id, reason: "user",
    })]);
    tree.select(s, null);
    expect(tree.cursorSelections(s).at(-1)).toMatchObject({ fromId: first.id, requestedId: null, selectedId: null });
    expect(tree.nodes(s)).toEqual(original);
  });

  it("cursor or selection-log write failure rolls back both and can nest within outer transactions", () => {
    const { db, tree, s } = setup();
    const input = tree.appendToTimeline(s, record("go"));
    db.exec("CREATE TRIGGER fail_cursor BEFORE UPDATE ON sessions BEGIN SELECT RAISE(ABORT, 'Cursor failed'); END;");
    expect(() => tree.select(s, null)).toThrow("Cursor failed");
    expect(tree.cursorSelections(s)).toEqual([]);
    expect(tree.cursor(s)).toBe(input.id);
    db.exec("DROP TRIGGER fail_cursor");
    db.exec("CREATE TRIGGER fail_selection BEFORE INSERT ON cursor_selections BEGIN SELECT RAISE(ABORT, 'Audit failed'); END;");
    expect(() => tree.select(s, null)).toThrow("Audit failed");
    expect(tree.cursor(s)).toBe(input.id);
    db.exec("DROP TRIGGER fail_selection");
    db.exec("BEGIN"); tree.select(s, null); db.exec("ROLLBACK");
    expect(tree.cursorSelections(s)).toEqual([]);
    expect(tree.cursor(s)).toBe(input.id);
  });

  it("forks preserve old descendants and new paths append only from selected positions", () => {
    const { tree, s } = setup();
    const first = tree.appendToTimeline(s, record("first"));
    const old = tree.appendToTimeline(s, record("old branch"));
    tree.select(s, first.id);
    const next = tree.appendToTimeline(s, record("new branch"));
    expect(tree.nodes(s).map(node => node.id)).toEqual([first.id, old.id, next.id]);
    expect(tree.timeline(s).map(node => node.id)).toEqual([first.id, next.id]);
    expect(next.parentId).toBe(first.id);
  });

  it("records with audit metadata append consecutively with later records and every record is selectable and advances the cursor", () => {
    const { tree, s } = setup();
    const input = tree.appendToTimeline(s, record("first"));
    const partial = tree.appendToTimeline(s, event("example.plugin/partial", { complete: false, usage: { total: 7 } }));
    expect(tree.cursor(s)).toBe(partial.id);
    const next = tree.appendToTimeline(s, record("next"));
    expect(next.parentId).toBe(partial.id);
    expect(tree.timeline(s).map(node => node.id)).toEqual([input.id, partial.id, next.id]);
    expect(tree.select(s, partial.id)).toBe(partial.id);
  });

  it("cursor update failures also roll back appended nodes", () => {
    const { db, tree, s } = setup();
    db.exec("CREATE TRIGGER fail_cursor BEFORE UPDATE ON sessions BEGIN SELECT RAISE(ABORT, 'Cursor failed'); END;");
    expect(() => tree.appendToTimeline(s, record("hello"))).toThrow("Cursor failed");
    expect(tree.nodes(s)).toEqual([]);
    expect(tree.cursor(s)).toBeNull();
  });

  // Workbench contract: appends, backtracking, side-branch selection, and reopen reconstruct presence and relationships from execution paths.
  it("workbenches rebuild with cursors without including side-branch objects or links", () => {
    const { db, tree, s } = setup();
    tree.appendToTimeline(s, created("agent-a", "A"));
    tree.appendToTimeline(s, created("agent-b", "B"));
    const linked = tree.appendToTimeline(s, attached("agent-a", "agent-b"));
    expect(tree.workbench(s).links).toEqual([{ receiverId: "agent-a", resourceId: "agent-b" }]);
    const removedNode = tree.appendToTimeline(s, removed("agent-b"));
    expect(tree.workbench(s).objects.map(object => object.id)).toEqual(["agent-a"]);
    expect(tree.workbench(s).links).toEqual([]);
    tree.select(s, linked.id);
    expect(tree.workbench(s).objects.map(object => object.id)).toEqual(["agent-a", "agent-b"]);
    tree.appendToTimeline(s, event("resource_detached", { id: "agent-b", receiverId: "agent-a" }));
    const branch = tree.appendToTimeline(s, created("branch-only", "Branch"));
    expect(tree.workbench(s).links).toEqual([]);
    tree.select(s, removedNode.id);
    expect(tree.workbench(s).objects.map(object => object.id)).toEqual(["agent-a"]);
    tree.select(s, branch.id);
    expect(new SessionTree(db).workbench(s).objects.map(object => object.id)).toEqual(["agent-a", "agent-b", "branch-only"]);
  });

  // Derived state read within commits cannot cross rollback boundaries, which could wrongly allow resources or reuse invalid authorization.
  it("after rebuilding within a rolled-back transaction, the next read restores presence and links from the actual cursor", () => {
    const { db, tree, s } = setup();
    tree.appendToTimeline(s, created("a", "A"));
    tree.appendToTimeline(s, created("b", "B"));
    tree.appendToTimeline(s, attached("a", "b"));
    const before = tree.workbench(s);
    db.exec("BEGIN");
    tree.appendToTimeline(s, removed("b"));
    expect(tree.workbench(s).links).toEqual([]);
    expect(tree.workbench(s).objects.map(object => object.id)).toEqual(["a"]);
    db.exec("ROLLBACK");
    expect(tree.workbench(s)).toEqual(before);
    expect(before.links).toEqual([{ receiverId: "a", resourceId: "b" }]);
  });
});

// The structural index serves timeline reads; it must not retain rolled-back rows or confuse branches sharing a prefix.
describe("Timeline structure index", () => {
  const read = (tree: SessionTree, s: string, query: Parameters<ReturnType<SessionTree["view"]>["read"]>[0]) =>
    tree.view(s).read(query).map(({ node, sequence }) => [node.data, sequence]);

  it("reads uncommitted tail rows inside a transaction and forgets them after rollback reuses their position", () => {
    const { db, tree, s } = setup();
    tree.appendToTimeline(s, record("a"));
    tree.appendToTimeline(s, record("b"));
    expect(read(tree, s, { scope: "timeline" })).toEqual([[{ value: "a" }, 1], [{ value: "b" }, 2]]);
    db.exec("BEGIN");
    tree.appendToTimeline(s, record("rolled back"));
    expect(read(tree, s, { scope: "timeline", edge: "last" })).toEqual([[{ value: "rolled back" }, 3]]);
    expect(read(tree, s, { scope: "session" })).toHaveLength(3);
    db.exec("ROLLBACK");
    tree.appendToTimeline(s, record("c"));
    expect(read(tree, s, { scope: "timeline" })).toEqual([[{ value: "a" }, 1], [{ value: "b" }, 2], [{ value: "c" }, 3]]);
    expect(read(tree, s, { scope: "session" })).toEqual([[{ value: "a" }, 1], [{ value: "b" }, 2], [{ value: "c" }, 3]]);
  });

  it("filters contracts per branch after the cursor moves between branches with a shared prefix", () => {
    const { tree, s } = setup();
    const root = tree.appendToTimeline(s, event("example/marker", { value: "root" }));
    tree.appendToTimeline(s, event("example/other", { value: "left" }));
    const left = tree.appendToTimeline(s, event("example/marker", { value: "left" }));
    expect(read(tree, s, { scope: "timeline", contracts: ["example/marker"] })).toEqual([[{ value: "root" }, 1], [{ value: "left" }, 3]]);
    tree.select(s, root.id);
    tree.appendToTimeline(s, event("example/marker", { value: "right" }));
    expect(read(tree, s, { scope: "timeline", contracts: ["example/marker"] })).toEqual([[{ value: "root" }, 1], [{ value: "right" }, 4]]);
    expect(read(tree, s, { scope: "timeline", contracts: ["example/other"] })).toEqual([]);
    tree.select(s, left.id);
    expect(read(tree, s, { scope: "timeline", contracts: ["example/marker", "example/other"], edge: "last" })).toEqual([[{ value: "left" }, 3]]);
    expect(read(tree, s, { scope: "timeline", contracts: ["example/other", "example/marker"] }))
      .toEqual([[{ value: "root" }, 1], [{ value: "left" }, 2], [{ value: "left" }, 3]]);
    expect(read(tree, s, { scope: "session", contracts: ["example/marker"], edge: "last" })).toEqual([[{ value: "right" }, 4]]);
  });
});
