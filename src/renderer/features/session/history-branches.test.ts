import { describe, expect, it } from "vitest";
import type { SessionNode } from "../../../shared/session";
import { node, message as input, text } from "../../../session/test-nodes";
import { branchContains, historyBranches, branchForNode } from "./history-branches";

const message = (id: string, parentId: string | null): SessionNode => node(id, parentId, input("a", id));
const interrupted = (id: string, parentId: string): SessionNode => node(id, parentId, text("a", "r", 0, "Partial", { complete: false, requestParentId: parentId }));

describe("历史分支 Tab 契约", () => {
  it("A-C-B 保留原后续，C-D 共享 C 并双向定位，不复制 A", () => {
    const nodes = [message("A", null), message("C", "A"), message("B", "C"), message("D", "C")];
    const tree = historyBranches(nodes);
    const [main, child] = tree.branches;
    expect([...main!.nodeIds]).toEqual(["A", "C", "B"]);
    expect([...child!.nodeIds]).toEqual(["C", "D"]);
    expect(child).toMatchObject({ parentId: main!.id, forkId: "C", tip: "D", number: 1 });
    expect(branchForNode(tree, "C", child!.id)).toBe(child);
    expect(branchForNode(tree, "C", main!.id)).toBe(main);
    expect(branchForNode(tree, "B", child!.id)).toBe(main);
    expect(branchForNode(tree, "D")).toBe(child);
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

  it("从会话起点分叉仍可在共享起点往返，空会话也有可选择节点", () => {
    const empty = historyBranches([]);
    expect(empty.branches).toHaveLength(1);
    expect(branchContains(empty.branches[0]!, null)).toBe(true);
    const tree = historyBranches([message("A", null), message("B", "A"), message("D", null)]);
    const [main, child] = tree.branches;
    expect(child).toMatchObject({ parentId: main!.id, forkId: null, tip: "D" });
    expect([...child!.nodeIds]).toEqual(["D"]);
    expect(branchForNode(tree, null, child!.id)).toBe(child);
    expect(branchForNode(tree, null)).toBe(main);
  });

  it("不完整块同样可查看，分叉使用它自身作为共享起点", () => {
    const tree = historyBranches([
      message("A", null), interrupted("partial", "A"), message("B", "partial"),
      message("D", "partial"), interrupted("tail", "D"),
    ]);
    const [main, child] = tree.branches;
    expect([...main!.nodeIds]).toEqual(["A", "partial", "B"]);
    expect([...child!.nodeIds]).toEqual(["partial", "D", "tail"]);
    expect(child).toMatchObject({ forkId: "partial", tip: "tail" });
    expect(tree.owner.get("tail")).toBe(child);
    expect(branchContains(child!, "tail")).toBe(true);
  });

});
