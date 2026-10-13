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

// 预期来自时间线契约：所有记录沿当前游标追加，节点与游标修改原子提交。
describe("会话级扁平树", () => {
  it("未知领域载荷原样保存并可重开读取", () => {
    const { db, tree, s } = setup();
    const payload = { custom: { values: [1, null, "opaque"] }, format: "plugin-owned" };
    const saved = tree.appendToTimeline(s, event("example.plugin/unknown", payload));
    expect(tree.cursor(s)).toBe(saved.id);
    expect(new SessionTree(db).nodes(s)).toMatchObject([{ id: saved.id, data: payload }]);
  });

  it("读取不写选择日志；显式选择保存原位置和实际位置，历史保持不变", () => {
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

  it("游标或选择日志任一写入失败时，两者一起回退；可嵌入外层事务", () => {
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

  it("分叉保留旧后代，新路径只沿选中位置追加", () => {
    const { tree, s } = setup();
    const first = tree.appendToTimeline(s, record("first"));
    const old = tree.appendToTimeline(s, record("old branch"));
    tree.select(s, first.id);
    const next = tree.appendToTimeline(s, record("new branch"));
    expect(tree.nodes(s).map(node => node.id)).toEqual([first.id, old.id, next.id]);
    expect(tree.timeline(s).map(node => node.id)).toEqual([first.id, next.id]);
    expect(next.parentId).toBe(first.id);
  });

  it("带审计信息的记录与后续记录连续追加，每条记录都可选并推进游标", () => {
    const { tree, s } = setup();
    const input = tree.appendToTimeline(s, record("first"));
    const partial = tree.appendToTimeline(s, event("example.plugin/partial", { complete: false, usage: { total: 7 } }));
    expect(tree.cursor(s)).toBe(partial.id);
    const next = tree.appendToTimeline(s, record("next"));
    expect(next.parentId).toBe(partial.id);
    expect(tree.timeline(s).map(node => node.id)).toEqual([input.id, partial.id, next.id]);
    expect(tree.select(s, partial.id)).toBe(partial.id);
  });

  it("游标更新失败时节点追加也回退", () => {
    const { db, tree, s } = setup();
    db.exec("CREATE TRIGGER fail_cursor BEFORE UPDATE ON sessions BEGIN SELECT RAISE(ABORT, 'Cursor failed'); END;");
    expect(() => tree.appendToTimeline(s, record("hello"))).toThrow("Cursor failed");
    expect(tree.nodes(s)).toEqual([]);
    expect(tree.cursor(s)).toBeNull();
  });

  // 工作台契约：追加、回溯、旁支选择与重开都从执行路径重建存在性和关系。
  it("工作台随游标重建，不带入旁支对象或链接", () => {
    const { db, tree, s } = setup();
    tree.appendToTimeline(s, created("agent-a", "A"));
    tree.appendToTimeline(s, created("agent-b", "B"));
    const linked = tree.appendToTimeline(s, attached("agent-a", "agent-b"));
    expect(tree.workbench(s).links).toEqual([{ agentId: "agent-a", resourceId: "agent-b" }]);
    const removedNode = tree.appendToTimeline(s, removed("agent-b"));
    expect(tree.workbench(s).objects.map(object => object.id)).toEqual(["agent-a"]);
    expect(tree.workbench(s).links).toEqual([]);
    tree.select(s, linked.id);
    expect(tree.workbench(s).objects.map(object => object.id)).toEqual(["agent-a", "agent-b"]);
    tree.appendToTimeline(s, event("resource_detached", { id: "agent-b", agentId: "agent-a" }));
    const branch = tree.appendToTimeline(s, created("branch-only", "Branch"));
    expect(tree.workbench(s).links).toEqual([]);
    tree.select(s, removedNode.id);
    expect(tree.workbench(s).objects.map(object => object.id)).toEqual(["agent-a"]);
    tree.select(s, branch.id);
    expect(new SessionTree(db).workbench(s).objects.map(object => object.id)).toEqual(["agent-a", "agent-b", "branch-only"]);
  });

  // 提交内读到的派生状态不能越过回滚边界，否则会错误放行资源或沿用失效授权。
  it("事务内重建后回滚，下一次读取恢复真实游标的存在性和链接", () => {
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
    expect(before.links).toEqual([{ agentId: "a", resourceId: "b" }]);
  });
});
