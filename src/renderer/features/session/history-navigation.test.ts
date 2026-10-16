import { describe, expect, it } from "vitest";

import { node, created as make, text, thinking, call, message, notice, event, attached, removed } from "../../../session/test-nodes";
import { ViewRegistry } from "../../modules/registry";
import { builtinViews } from "../../../../packages/builtin/src/renderer";
import { workbenchRecordViews } from "../workbench/records";
import { historyBefore, historyEntries, historyResources, historyResourceViews, matchesHistoryView } from "./history-navigation";

const created = (id: string, title: string, kind = "agent") => make(id, title, kind);
const label = new ViewRegistry([...builtinViews, workbenchRecordViews]);

describe("历史导航契约", () => {
  it("资源视图按来源身份筛选，不混入同名代理、链接事件或工具目标", () => {
    const nodes = [
      node("1", null, created("a", "Same name")),
      node("2", "1", created("b", "Same name")),
      node("3", "2", created("n", "Read target", "note")),
      node("4", "3", text("a", "r", 0, "A output")),
      node("5", "4", attached("a", "n", null)),
      node("6", "5", call("a", "r", 1, "call", { name: "resource_call", arguments: { resource_id: "n", tool: "read", args: {} } })),
      node("7", "6", text("b", "r", 0, "B output")),
      node("8", "7", notice(null, "session", "Session notice", "info")),
    ];
    const entries = historyEntries(nodes, label);
    expect(entries.filter(entry => matchesHistoryView(entry, { kind: "resource", resourceId: "a" })).map(entry => entry.node.id)).toEqual(["4", "6"]);
    expect(entries.filter(entry => matchesHistoryView(entry, { kind: "session" })).map(entry => entry.node.id)).toEqual(["1", "2", "3", "5", "8"]);
    expect(entries.filter(entry => matchesHistoryView(entry, { kind: "resources" })).map(entry => entry.node.id)).toEqual(["4", "6", "7"]);
    expect(entries.filter(entry => matchesHistoryView(entry, { kind: "all" }))).toHaveLength(8);
    expect(historyResourceViews(entries).map(source => [source.resource.id, source.count])).toEqual([["a", 2], ["b", 1]]);
  });
  it("已移除、其他分支与非代理资源的自发事件仍可作为视图来源", () => {
    const nodes = [
      node("1", null, created("r", "Game", "board")),
      node("2", "1", removed("r")),
      node("3", "1", event("board.move", {}, { source: { plugin: "example.board", resource: { sessionId: "s", id: "r", kind: "board" } } })),
    ];
    const entries = historyEntries(nodes, label);
    expect(historyResources(nodes).get("r")).toEqual({ id: "r", kind: "board", title: "Game" });
    expect(entries[2]).toMatchObject({ scope: "resource", resource: { id: "r", title: "Game" } });
    expect(historyResourceViews(entries)).toEqual([{ resource: { id: "r", kind: "board", title: "Game" }, count: 1 }]);
    expect(entries.filter(entry => matchesHistoryView(entry, { kind: "resource", resourceId: "r" })).map(entry => entry.node.id)).toEqual(["3"]);
  });

  it("同一响应穿插工作台事件与另一代理输出时保持独立落点和追加顺序", () => {
    const nodes = [
      node("1", null, created("a", "Alpha")),
      node("2", "1", text("a", "r", 0, "First\nparagraph")),
      node("3", "2", created("b", "Beta")),
      node("4", "3", text("b", "other", 0, "Interleaved")),
      node("5", "4", text("a", "r", 1, "Second paragraph")),
    ];
    nodes[4].createdAt = "2026-10-09T10:00:00Z"; // 时钟时间不参与导航排序。
    const entries = historyEntries(nodes, label);
    expect(entries.map(entry => entry.node.id)).toEqual(["1", "2", "3", "4", "5"]);
    expect(entries[2].scope).toBe("session");
    expect(entries[3].resource?.title).toBe("Beta");
    expect(entries[4].resource?.title).toBe("Alpha");
  });
  it("不完整块也是历史位置，查看之前使用真实父节点而非过滤后的上一行", () => {
    const nodes = [
      node("1", null, created("a", "A")),
      node("2", "1", thinking("a", "r", 0, "Reasoning")),
      node("3", "2", call("a", "r", 1, "call", { name: "resource_call", arguments: { resource_id: "n", tool: "read", target: { path: "input.md" }, args: {} } })),
      node("4", "3", text("a", "r", 2, "Interrupted", { complete: false })),
      node("5", "4", message("a", "Continue")),
      node("6", "1", message("a", "Another branch")),
    ];
    expect(historyEntries(nodes, label).map(entry => entry.node.id)).toEqual(["1", "2", "3", "4", "5", "6"]);
    const filtered = historyEntries(nodes, label).filter(entry => entry.node.id === "3" || entry.node.id === "5");
    expect(filtered.map(entry => entry.node.id)).toEqual(["3", "5"]);
    expect(historyBefore(nodes, nodes[2])).toBe("2");
    expect(historyBefore(nodes, nodes[4])).toBe("4");
    expect(historyBefore(nodes, nodes[5])).toBe("1");
    expect(historyBefore(nodes, nodes[0])).toBeNull();
  });
});
