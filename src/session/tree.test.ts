import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { SessionTree } from "./tree.ts";
import { sessionSchemaSql } from "./schema.ts";
import { event } from "./test-nodes.ts";

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
    const saved = tree.append(s, event("example.plugin/unknown", payload));
    expect(tree.cursor(s)).toBe(saved.id);
    expect(new SessionTree(db).nodes(s)).toMatchObject([{ id: saved.id, data: payload }]);
  });

  it("查看不写选择日志；显式选择保存原位置和实际位置，历史保持不变", () => {
    const { tree, s } = setup();
    const first = tree.append(s, record("first"));
    const last = tree.append(s, record("last"));
    const original = tree.nodes(s);
    tree.path(s, first.id);
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
    const input = tree.append(s, record("go"));
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
    const first = tree.append(s, record("first"));
    const old = tree.append(s, record("old branch"));
    tree.select(s, first.id);
    const next = tree.append(s, record("new branch"));
    expect(tree.nodes(s).map(node => node.id)).toEqual([first.id, old.id, next.id]);
    expect(tree.path(s).map(node => node.id)).toEqual([first.id, next.id]);
    expect(next.parentId).toBe(first.id);
  });

  it("带审计信息的记录与后续记录连续追加，每条记录都可选并推进游标", () => {
    const { tree, s } = setup();
    const input = tree.append(s, record("first"));
    const partial = tree.append(s, event("example.plugin/partial", { complete: false, usage: { total: 7 } }));
    expect(tree.cursor(s)).toBe(partial.id);
    const next = tree.append(s, record("next"));
    expect(next.parentId).toBe(partial.id);
    expect(tree.path(s).map(node => node.id)).toEqual([input.id, partial.id, next.id]);
    expect(tree.select(s, partial.id)).toBe(partial.id);
  });

  it("游标更新失败时节点追加也回退", () => {
    const { db, tree, s } = setup();
    db.exec("CREATE TRIGGER fail_cursor BEFORE UPDATE ON sessions BEGIN SELECT RAISE(ABORT, 'Cursor failed'); END;");
    expect(() => tree.append(s, record("hello"))).toThrow("Cursor failed");
    expect(tree.nodes(s)).toEqual([]);
    expect(tree.cursor(s)).toBeNull();
  });
});
