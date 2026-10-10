import { describe, expect, it } from "vitest";
import { emptyCompletion, type SessionNode } from "../../../shared/session";
import { arrivedBranch, branchContains, historyBranches, viewedBranch } from "./history-branches";

const message = (id: string, parentId: string | null): SessionNode => ({
  id, parentId, sessionId: "s", createdAt: "2026-10-10T10:00:00Z", kind: "message", agentId: "a", text: id,
});
const interrupted = (id: string, parentId: string): SessionNode => ({
  ...message(id, parentId), ...emptyCompletion, kind: "text", text: "Partial", agentId: "a",
  complete: false, responseId: "r", ordinal: 0, requestParentId: parentId, model: "test", continuation: null, adapter: "test", scope: "test",
});

describe("历史分支 Tab 契约", () => {
  it("A-C-B 保留原后续，C-D 共享 C 并双向定位，不复制 A", () => {
    const nodes = [message("A", null), message("C", "A"), message("B", "C"), message("D", "C")];
    const tree = historyBranches(nodes);
    const [main, child] = tree.branches;
    expect([...main!.nodeIds]).toEqual(["A", "C", "B"]);
    expect([...child!.nodeIds]).toEqual(["C", "D"]);
    expect(child).toMatchObject({ parentId: main!.id, forkId: "C", tip: "D", number: 1 });
    expect(viewedBranch(tree, "C", child!.id)).toBe(child);
    expect(viewedBranch(tree, "C", main!.id)).toBe(main);
    expect(viewedBranch(tree, "B", child!.id)).toBe(main);
    expect(viewedBranch(tree, "D")).toBe(child);
    expect(nodes.map(node => node.id)).toEqual(["A", "C", "B", "D"]);
  });

  it("嵌套分支指回所属 Tab，同一位置再次分叉仍指回原分支", () => {
    const tree = historyBranches([
      message("A", null), message("C", "A"), message("B", "C"), message("D", "C"),
      message("E", "D"), message("F", "D"), message("G", "C"),
    ]);
    const [main, child, nested, sibling] = tree.branches;
    expect(nested).toMatchObject({ parentId: child!.id, forkId: "D", number: 2 });
    expect([...nested!.nodeIds]).toEqual(["D", "F"]);
    expect(sibling).toMatchObject({ parentId: main!.id, forkId: "C", number: 3 });
    expect([...child!.nodeIds]).toEqual(["C", "D", "E"]);
  });

  it("继续任意路径只延长原 Tab，新增分支不改变已有身份与编号", () => {
    const nodes = [message("A", null), message("B", "A"), message("D", "A")];
    const before = historyBranches(nodes);
    const after = historyBranches([...nodes, message("E", "D"), message("C", "B"), message("F", "A")]);
    expect(after.branches.slice(0, 2).map(({ id, number }) => [id, number]))
      .toEqual(before.branches.map(({ id, number }) => [id, number]));
    expect(after.branches[0]!.tip).toBe("C");
    expect(after.branches[1]!.tip).toBe("E");
    expect([...after.branches[0]!.nodeIds]).toEqual(["A", "B", "C"]);
  });

  it("从会话起点分叉仍可在共享起点往返，空会话也有可查看位置", () => {
    const empty = historyBranches([]);
    expect(empty.branches).toHaveLength(1);
    expect(branchContains(empty.branches[0]!, null)).toBe(true);
    const tree = historyBranches([message("A", null), message("B", "A"), message("D", null)]);
    const [main, child] = tree.branches;
    expect(child).toMatchObject({ parentId: main!.id, forkId: null, tip: "D" });
    expect([...child!.nodeIds]).toEqual(["D"]);
    expect(viewedBranch(tree, null, child!.id)).toBe(child);
    expect(viewedBranch(tree, null)).toBe(main);
  });

  it("不完整块保留结构归属，但跳转与共享起点使用可查看祖先", () => {
    const tree = historyBranches([
      message("A", null), interrupted("partial", "A"), message("B", "partial"),
      message("D", "partial"), interrupted("tail", "D"),
    ]);
    const [main, child] = tree.branches;
    expect([...main!.nodeIds]).toEqual(["A", "B"]);
    expect([...child!.nodeIds]).toEqual(["A", "D"]);
    expect(child).toMatchObject({ forkId: "A", tip: "D" });
    expect(tree.owner.get("tail")).toBe(child);
    expect(branchContains(child!, "tail")).toBe(false);
  });

  it("只有同次成功导航可选中新 Tab，失败或离开再返回相同节点不能复活旧意图", () => {
    const pending = { branchId: "branch:D", nodeId: "C", version: 2 };
    const state = { status: "ready", navigationVersion: 2, snapshot: { at: "C" } };
    expect(arrivedBranch(pending, state)).toBe("branch:D");
    expect(arrivedBranch(pending, { ...state, status: "loading" })).toBeNull();
    expect(arrivedBranch(pending, { ...state, status: "error" })).toBeNull();
    expect(arrivedBranch(pending, { ...state, navigationVersion: 4 })).toBeNull();
    expect(arrivedBranch(pending, { ...state, snapshot: { at: "D" } })).toBeNull();
    expect(arrivedBranch(null, state)).toBeNull();
  });
});
