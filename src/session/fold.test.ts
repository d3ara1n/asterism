import { describe, expect, it } from "vitest";
import { foldWorkbench } from "./fold.ts";
import { attached, created, node, removed } from "./test-nodes.ts";

// 预期来自工作台事件折叠：移除清除全部方向链接，历史读取只取所给路径。
describe("工作台折叠", () => {
  it("移除对象清除入向与出向链接，旧路径仍可还原对象和关系", () => {
    const path = [
      node("a", null, created("agent-a", "A")),
      node("b", "a", created("agent-b", "B")),
      node("ab", "b", attached("agent-b", "agent-a")),
      node("ba", "ab", attached("agent-a", "agent-b")),
    ];
    const current = foldWorkbench([...path, node("removed", "ba", removed("agent-a"))]);
    expect(current.objects.map(object => object.id)).toEqual(["agent-b"]);
    expect(current.links).toEqual([]);
    expect(foldWorkbench(path).links).toEqual([
      { agentId: "agent-b", resourceId: "agent-a" }, { agentId: "agent-a", resourceId: "agent-b" },
    ]);
  });
});
