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
