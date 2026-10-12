import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { emptyCompletion, type NewNode } from "../shared/session.ts";
import { projectForAgent } from "./projection.ts";
import { SessionTree } from "./tree.ts";
import { sessionSchemaSql } from "./schema.ts";

const blk = { ...emptyCompletion, requestParentId: null, model: "p/m", continuation: null, adapter: "test/1", scope: "s", complete: true };
const text = (agentId: string, responseId: string, ordinal: number, t: string, complete = true): Extract<NewNode, { kind: "text" }> =>
  ({ ...blk, kind: "text", agentId, responseId, ordinal, text: t, complete });
const thinking = (agentId: string, responseId: string, ordinal: number): Extract<NewNode, { kind: "thinking" }> =>
  ({ ...blk, kind: "thinking", agentId, responseId, ordinal, text: "…" });
const call = (agentId: string, responseId: string, ordinal: number, callId: string): Extract<NewNode, { kind: "toolcall" }> =>
  ({ ...blk, kind: "toolcall", agentId, responseId, ordinal, callId, name: "read", argumentsText: "{}", arguments: {},
    outcome: { kind: "succeeded", model: [{ kind: "text", text: callId }], data: null } });
const msg = (agentId: string, t: string): NewNode => ({ kind: "message", agentId, parts: [{ kind: "text", text: t }] });
const attached = (agentId: string | null, r: string): NewNode => ({ kind: "event", agentId, type: "resource_attached", data: { id: r }, model: `${r} attached` });
const completion = { usage: { input: 5, output: 3, total: 8, cacheRead: 2, cacheWrite: null, reasoning: 1 },
  finishReason: "stop", rawFinishReason: "end_turn", providerResponseId: "server-1" };

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
  it("迟到元数据只追加一次，不改原始块或游标；块视图可直接筛选汇总", () => {
    const { db, tree, s } = setup();
    const first = tree.append(s, text("a", "r1", 0, "first"));
    const last = tree.append(s, text("a", "r1", 1, "last"));
    const original = db.prepare("SELECT payload FROM session_nodes WHERE id = ?").get(last.id);
    const context = tree.append(s, attached("a", "dir"));
    expect(() => tree.completeBlock(s, first.id, completion)).toThrow("last response block");
    tree.completeBlock(s, last.id, completion);
    expect(db.prepare("SELECT payload FROM session_nodes WHERE id = ?").get(last.id)).toEqual(original);
    expect(tree.cursor(s)).toBe(context.id);
    expect(tree.nodes(s)).toHaveLength(3);
    expect(tree.nodes(s).find(node => node.id === first.id)).toMatchObject({ usage: null, finishReason: null });
    expect(tree.nodes(s).find(node => node.id === last.id)).toMatchObject(completion);
    expect(db.prepare("SELECT SUM(json_extract(usage, '$.total')) AS total FROM session_blocks WHERE session_id = ? AND model = ?")
      .get(s, "p/m")).toEqual({ total: 8 });
    expect(() => tree.completeBlock(s, last.id, completion)).toThrow("UNIQUE");
    expect(() => tree.append(s, text("a", "r1", 2, "too late"))).toThrow("finalized");
    tree.append(s, { kind: "notice", agentId: "a", level: "error", code: "empty_response", message: "No content blocks.",
      response: { ...completion, responseId: "empty", requestParentId: context.id, model: "p/m" } });
    expect(db.prepare("SELECT SUM(json_extract(usage, '$.total')) AS total FROM session_usage WHERE session_id = ?")
      .get(s)).toEqual({ total: 16 });
    expect(new SessionTree(db).nodes(s)).toEqual(tree.nodes(s));
  });

  it("块身份约束拒绝同响应不同来源、重复序号与旁支请求起点", () => {
    const { tree, s } = setup();
    const input = tree.append(s, msg("a", "go"));
    const first = tree.append(s, { ...text("a", "r1", 0, "ok"), requestParentId: input.id });
    expect(() => tree.append(s, { ...text("a", "r1", 1, "other"), requestParentId: first.id })).toThrow("request identity");
    expect(() => tree.append(s, { ...text("b", "r1", 1, "other"), requestParentId: input.id })).toThrow("request identity");
    expect(() => tree.append(s, { ...text("a", "r1", 0, "duplicate"), requestParentId: input.id })).toThrow("UNIQUE");
    tree.select(s, input.id);
    expect(() => tree.append(s, { ...text("a", "r2", 0, "branch"), requestParentId: first.id })).toThrow("current session path");
    expect(tree.cursor(s)).toBe(input.id);
  });

  it("选择日志保存原位置、请求位置、吸附结果；查看不写日志，返回起点也可审计", () => {
    const { tree, s } = setup();
    const input = tree.append(s, msg("a", "go"));
    const thought = tree.append(s, thinking("a", "r1", 0));
    const answer = tree.append(s, text("a", "r1", 1, "answer"));
    const original = tree.nodes(s);
    tree.path(s, thought.id);
    expect(tree.cursorSelections(s)).toEqual([]);
    expect(tree.select(s, thought.id)).toBe(input.id);
    expect(tree.cursorSelections(s)).toEqual([expect.objectContaining({
      fromId: answer.id, requestedId: thought.id, selectedId: input.id, reason: "user",
    })]);
    tree.select(s, null);
    expect(tree.cursorSelections(s).at(-1)).toMatchObject({ fromId: input.id, requestedId: null, selectedId: null });
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
    tree.select(s, null, "continuation");
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
    const tool = tree.append(s, { ...call("a", "r1", 0, "c1"), requestParentId: origin.id });
    const next = projectForAgent(tree.path(s), "a");
    expect(next.slice(0, sent.length)).toEqual(sent);
    expect(next.slice(sent.length).map(item => item.kind)).toEqual(["output", "result", "context"]);
    const later = tree.append(s, attached("a", "later"));
    tree.append(s, { ...text("a", "r2", 0, "answer"), requestParentId: tool.id });
    const final = projectForAgent(tree.path(s), "a");
    expect(final.slice(0, next.length)).toEqual(next);
    expect(final.slice(next.length).map(item => item.kind)).toEqual(["output", "context"]);
    expect(tree.path(s).map(node => node.id).indexOf(during.id)).toBeLessThan(tree.path(s).map(node => node.id).indexOf(tool.id));
    const viewed = projectForAgent(tree.path(s, during.id), "a");
    expect(viewed.at(-1)).toMatchObject({ kind: "context", parts: [{ kind: "text", text: "during attached" }] });
    tree.select(s, during.id);
    tree.append(s, { ...text("a", "branch", 0, "new answer"), requestParentId: during.id });
    expect(projectForAgent(tree.path(s), "a").slice(0, viewed.length)).toEqual(viewed);
    expect(projectForAgent(tree.path(s), "a").some(item => item.kind === "context" && item.parts.some(part => part.kind === "text" && part.text === "later attached"))).toBe(false);
    expect(tree.nodes(s).some(node => node.id === later.id)).toBe(true);
  });

  it("请求起点可以是其他代理的不可见节点，各代理独立归组同一段物理历史", () => {
    const { tree, s } = setup();
    tree.append(s, msg("a", "for A"));
    const origin = tree.append(s, msg("b", "for B"));
    tree.append(s, attached(null, "shared"));
    tree.append(s, { ...text("a", "ra", 0, "A"), requestParentId: origin.id });
    tree.append(s, { ...text("b", "rb", 0, "B"), requestParentId: origin.id });
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
    expect(tree.path(s).map(n => n.kind)).toEqual(["message", "message"]);
  });

  it("不完整 block 留档但不进路径、不可选、不发给模型", () => {
    const { tree, s } = setup();
    tree.append(s, msg("a", "hi"));
    const partial = tree.append(s, text("a", "r1", 0, "half", false));
    expect(tree.path(s).some(n => n.id === partial.id)).toBe(false);
    expect(() => tree.select(s, partial.id)).toThrow("Incomplete");
    expect(projectForAgent(tree.path(s), "a")).toEqual([{ kind: "input", parts: [{ kind: "text", text: "hi" }] }]);
  });

  it("停在 thinking 之后选择时吸附到其之前", () => {
    const { tree, s } = setup();
    const m = tree.append(s, msg("a", "hi"));
    const t = tree.append(s, thinking("a", "r1", 0));
    tree.append(s, text("a", "r1", 1, "ok"));
    expect(tree.select(s, t.id)).toBe(m.id);
  });

  it("块的终态元数据和 notice 不能掩盖 thinking 结尾", () => {
    const { tree, s } = setup();
    const message = tree.append(s, msg("a", "hi"));
    const block = tree.append(s, thinking("a", "r1", 0));
    tree.completeBlock(s, block.id, { usage: null, finishReason: "stop", rawFinishReason: "end_turn", providerResponseId: "provider-r1" });
    const notice = tree.append(s, { kind: "notice", agentId: "a", level: "error", code: "interrupted", message: "Interrupted." });
    expect(tree.select(s, notice.id)).toBe(message.id);
  });

  it("续接合法性按响应序号判断，不以并行完成顺序判断", () => {
    const { tree, s } = setup();
    tree.append(s, text("a", "r1", 1, "answer"));
    const last = tree.append(s, thinking("a", "r1", 0));
    expect(tree.select(s, last.id)).toBe(last.id);
  });

  it("无结果的完整调用被拒绝，且不会推进游标", () => {
    const { tree, s } = setup();
    expect(() => tree.append(s, { ...blk, kind: "toolcall", agentId: "a", responseId: "r1", ordinal: 0,
      callId: "c1", name: "read", argumentsText: "{}", arguments: {}, outcome: null })).toThrow();
    expect(tree.nodes(s)).toEqual([]);
    expect(tree.cursor(s)).toBeNull();
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
    tree.append(s, { ...call("a", "r1", 1, "c2"), requestParentId: input.id }); // 并行时 tc2 先完成
    tree.append(s, attached("a", "dir"));
    tree.append(s, text("b", "rb", 0, "other agent"));
    tree.append(s, { ...call("a", "r1", 0, "c1"), requestParentId: input.id });
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
});

describe("工作台折叠", () => {
  it("移除对象连带清除链接；回溯到移除之前对象与链接恢复", async () => {
    const { foldWorkbench } = await import("./fold.ts");
    const { tree, s } = setup();
    tree.append(s, { kind: "event", agentId: null, type: "resource_created", data: { id: "a", type: "agent", title: "A" }, model: null });
    tree.append(s, { kind: "event", agentId: null, type: "resource_created", data: { id: "d", type: "directory", title: "d", path: "/x" }, model: null });
    const linkedAt = tree.append(s, attached("a", "d")).id;
    tree.append(s, { kind: "event", agentId: null, type: "object_removed", data: { id: "d" }, model: null });
    expect(foldWorkbench(tree.path(s))).toMatchObject({ objects: [{ id: "a" }], links: [] });
    tree.select(s, linkedAt);
    expect(foldWorkbench(tree.path(s)).links).toEqual([{ agentId: "a", resourceId: "d" }]);
  });
});
