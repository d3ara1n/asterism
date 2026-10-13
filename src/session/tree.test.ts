import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { projectForAgent } from "./projection.ts";
import { SessionTree } from "./tree.ts";
import { sessionSchemaSql } from "./schema.ts";
import { attached, call, created, event, message as msg, removed, text, thinking } from "./test-nodes.ts";

const databases: DatabaseSync[] = [];
afterEach(() => { for (const db of databases.splice(0)) db.close(); });
function setup() {
  const db = new DatabaseSync(":memory:");
  databases.push(db);
  db.exec(sessionSchemaSql);
  const tree = new SessionTree(db);
  return { db, tree, s: tree.create("S") };
}

describe("会话级扁平树", () => {
  it("通用记录原样保存并可重开读取，宿主不解释载荷", () => {
    const { db, tree, s } = setup();
    const input = tree.append(s, msg("a", "go"));
    const answer = tree.append(s, text("a", "r1", 0, "answer", { requestParentId: input.id }));
    expect(tree.cursor(s)).toBe(answer.id);
    expect(new SessionTree(db).nodes(s)).toEqual(tree.nodes(s));
  });

  it("选择日志保存原位置、请求位置与实际位置；任何完整节点可直接选中，不吸附", () => {
    const { tree, s } = setup();
    tree.append(s, msg("a", "go"));
    const thought = tree.append(s, thinking("a", "r1", 0));
    const answer = tree.append(s, text("a", "r1", 1, "answer"));
    const original = tree.nodes(s);
    tree.path(s, thought.id);
    expect(tree.cursorSelections(s)).toEqual([]);
    expect(tree.select(s, thought.id)).toBe(thought.id);
    expect(tree.cursorSelections(s)).toEqual([expect.objectContaining({
      fromId: answer.id, requestedId: thought.id, selectedId: thought.id, reason: "user",
    })]);
    tree.select(s, null);
    expect(tree.cursorSelections(s).at(-1)).toMatchObject({ fromId: thought.id, requestedId: null, selectedId: null });
    expect(tree.nodes(s)).toEqual(original);
    expect(projectForAgent(tree.path(s), "a")).toEqual([]);
  });

  it("游标或选择日志任一写入失败时，两者一起回退；可嵌入外层事务", () => {
    const { db, tree, s } = setup();
    const input = tree.append(s, msg("a", "go"));
    db.exec("CREATE TRIGGER fail_cursor BEFORE UPDATE ON sessions BEGIN SELECT RAISE(ABORT, 'Cursor failed'); END;");
    expect(() => tree.select(s, null)).toThrow("Cursor failed");
    expect(tree.cursorSelections(s)).toEqual([]);
    expect(tree.cursor(s)).toBe(input.id);
    db.exec("DROP TRIGGER fail_cursor");
    db.exec("CREATE TRIGGER fail_selection BEFORE INSERT ON cursor_selections BEGIN SELECT RAISE(ABORT, 'Audit failed'); END;");
    expect(() => tree.select(s, null)).toThrow("Audit failed");
    expect(tree.cursor(s)).toBe(input.id);
    db.exec("DROP TRIGGER fail_selection");
    db.exec("BEGIN");
    tree.select(s, null);
    db.exec("ROLLBACK");
    expect(tree.cursorSelections(s)).toEqual([]);
    expect(tree.cursor(s)).toBe(input.id);
  });

  it("首块前事件后置，每次请求投影保留已经发出的前缀；原始时序与历史分叉不变", () => {
    const { tree, s } = setup();
    tree.append(s, msg("a", "go"));
    const origin = tree.append(s, attached("a", "before"));
    const sent = projectForAgent(tree.path(s), "a");
    const during = tree.append(s, attached("a", "during"));
    const tool = tree.append(s, call("a", "r1", 0, "c1", { requestParentId: origin.id }));
    const next = projectForAgent(tree.path(s), "a");
    expect(next.slice(0, sent.length)).toEqual(sent);
    expect(next.slice(sent.length).map(item => item.kind)).toEqual(["output", "result", "context"]);
    const later = tree.append(s, attached("a", "later"));
    tree.append(s, text("a", "r2", 0, "answer", { requestParentId: tool.id }));
    const final = projectForAgent(tree.path(s), "a");
    expect(final.slice(0, next.length)).toEqual(next);
    expect(final.slice(next.length).map(item => item.kind)).toEqual(["output", "context"]);
    const ids = tree.path(s).map(node => node.id);
    expect(ids.indexOf(during.id)).toBeLessThan(ids.indexOf(tool.id));
    const viewed = projectForAgent(tree.path(s, during.id), "a");
    expect(viewed.at(-1)).toMatchObject({ kind: "context", parts: [{ kind: "text", text: "during attached" }] });
    tree.select(s, during.id);
    tree.append(s, text("a", "branch", 0, "new answer", { requestParentId: during.id }));
    expect(projectForAgent(tree.path(s), "a").slice(0, viewed.length)).toEqual(viewed);
    expect(projectForAgent(tree.path(s), "a").some(item => item.kind === "context"
      && item.parts.some(part => part.kind === "text" && part.text === "later attached"))).toBe(false);
    expect(tree.nodes(s).some(node => node.id === later.id)).toBe(true);
  });

  it("请求起点可以是其他代理的不可见节点，各代理独立归组同一段物理历史", () => {
    const { tree, s } = setup();
    tree.append(s, msg("a", "for A"));
    const origin = tree.append(s, msg("b", "for B"));
    tree.append(s, event("resource_attached", { id: "shared", agentId: "" }, { model: "shared attached", recipient: null }));
    tree.append(s, text("a", "ra", 0, "A", { requestParentId: origin.id }));
    tree.append(s, text("b", "rb", 0, "B", { requestParentId: origin.id }));
    for (const agent of ["a", "b"]) {
      expect(projectForAgent(tree.path(s), agent).map(item => item.kind)).toEqual(["input", "output", "context"]);
    }
  });

  it("分叉后旧分支保留，回溯到事件之前资源连接随路径消失", () => {
    const { tree, s } = setup();
    tree.append(s, msg("a", "hi"));
    const before = tree.cursor(s);
    tree.append(s, attached("a", "dir"));
    tree.select(s, before);
    tree.append(s, msg("a", "again"));
    expect(tree.nodes(s)).toHaveLength(3);
    expect(tree.path(s).every(node => node.contract !== "resource_attached")).toBe(true);
  });

  it("审计记录（不完整块）留档但不进路径、不可选、不发给模型", () => {
    const { tree, s } = setup();
    tree.append(s, msg("a", "hi"));
    const partial = tree.append(s, text("a", "r1", 0, "half", { complete: false }));
    expect(tree.path(s).some(n => n.id === partial.id)).toBe(false);
    expect(() => tree.select(s, partial.id)).toThrow("Audit-only");
    expect(projectForAgent(tree.path(s), "a")).toEqual([{ kind: "input", parts: [{ kind: "text", text: "hi" }] }]);
  });

  it("游标更新失败时节点追加也回退", () => {
    const { db, tree, s } = setup();
    db.exec("CREATE TRIGGER fail_cursor BEFORE UPDATE ON sessions BEGIN SELECT RAISE(ABORT, 'Cursor failed'); END;");
    expect(() => tree.append(s, msg("a", "hello"))).toThrow("Cursor failed");
    expect(tree.nodes(s)).toEqual([]);
    expect(tree.cursor(s)).toBeNull();
  });

  it("投影按 ordinal 重组响应、结果随后，响应期间的事件延后；其他代理不可见", () => {
    const { tree, s } = setup();
    const input = tree.append(s, msg("a", "go"));
    tree.append(s, call("a", "r1", 1, "c2", { requestParentId: input.id })); // 并行时 tc2 先完成
    tree.append(s, attached("a", "dir"));
    tree.append(s, text("b", "rb", 0, "other agent"));
    tree.append(s, call("a", "r1", 0, "c1", { requestParentId: input.id }));
    const items = projectForAgent(tree.path(s), "a");
    expect(items.map(i => i.kind === "output" ? i.parts.map(p => p.kind === "toolcall" ? p.callId : p.kind).join() : i.kind === "result" ? i.callId : i.kind))
      .toEqual(["input", "c1,c2", "c1", "c2", "context"]);
  });

  it("停在 tc1 与 tc2 之间时投影只截掉末尾调用，每个调用都有结果", () => {
    const { tree, s } = setup();
    tree.append(s, msg("a", "go"));
    const c1 = tree.append(s, call("a", "r1", 0, "c1"));
    tree.append(s, call("a", "r1", 1, "c2"));
    tree.select(s, c1.id);
    const items = projectForAgent(tree.path(s), "a");
    expect(items.filter(i => i.kind === "result").map(i => (i as { callId: string }).callId)).toEqual(["c1"]);
  });

  it("停在思考之后时投影截掉末尾思考，唯一续接规则只在投影内", () => {
    const { tree, s } = setup();
    tree.append(s, msg("a", "go"));
    tree.append(s, thinking("a", "r1", 0, "reasoning"));
    expect(projectForAgent(tree.path(s), "a").map(item => item.kind)).toEqual(["input"]);
  });
});

describe("工作台折叠", () => {
  it("移除对象连带清除链接；回溯到移除之前对象与链接恢复", async () => {
    const { foldWorkbench } = await import("./fold.ts");
    const { tree, s } = setup();
    tree.append(s, created("a", "A", "agent"));
    tree.append(s, event("resource_created", { id: "d", type: "directory", title: "d", path: "/x" }));
    const linkedAt = tree.append(s, attached("a", "d")).id;
    tree.append(s, removed("d"));
    expect(foldWorkbench(tree.path(s))).toMatchObject({ objects: [{ id: "a" }], links: [] });
    tree.select(s, linkedAt);
    expect(foldWorkbench(tree.path(s)).links).toEqual([{ agentId: "a", resourceId: "d" }]);
  });
});
