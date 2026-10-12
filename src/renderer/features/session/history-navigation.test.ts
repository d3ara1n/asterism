import { describe, expect, it } from "vitest";

import { emptyCompletion, type NewNode, type SessionNode } from "../../../shared/session";
import { historyMessages } from "../../messages/history";
import { getI18n } from "../../shared/i18n";
import { historyBefore, historyEntries, historyResources, historyResourceViews, matchesHistoryView } from "./history-navigation";

const block = { ...emptyCompletion, agentId: "a", responseId: "r", ordinal: 0, requestParentId: null,
  complete: true, model: "test", continuation: null, adapter: "test", scope: "test" };
const node = (id: string, parentId: string | null, value: NewNode): SessionNode => ({ ...value, id, parentId, sessionId: "s", createdAt: "2026-10-10T10:00:00Z" });
const created = (id: string, title: string, kind = "agent"): NewNode => ({ kind: "event", type: "resource_created", agentId: null, data: { id, title, type: kind }, model: null });
const label = (kind: string) => kind;

describe("历史导航契约", () => {
  it("资源视图按来源身份筛选，不混入同名代理、链接事件或工具目标", () => {
    const nodes = [
      node("1", null, created("a", "Same name")),
      node("2", "1", created("b", "Same name")),
      node("3", "2", created("n", "Read target", "note")),
      node("4", "3", { ...block, kind: "text", text: "A output" }),
      node("5", "4", { kind: "event", type: "resource_attached", agentId: "a", data: { id: "n" }, model: null }),
      node("6", "5", { ...block, kind: "toolcall", ordinal: 1, callId: "call", name: "resource_call", argumentsText: "{}",
        arguments: { resource_id: "n", tool: "read", args: {} }, outcome: { kind: "succeeded", data: null, model: null } }),
      node("7", "6", { ...block, kind: "text", agentId: "b", text: "B output" }),
      node("8", "7", { kind: "notice", agentId: null, level: "info", code: "session", message: "Session notice" }),
    ];
    const entries = historyEntries(nodes, label);
    expect(entries.filter(entry => matchesHistoryView(entry, { kind: "resource", resourceId: "a" })).map(entry => entry.node.id)).toEqual(["4", "6"]);
    expect(entries.filter(entry => matchesHistoryView(entry, { kind: "workbench" })).map(entry => entry.node.id)).toEqual(["1", "2", "3", "5"]);
    expect(entries.filter(entry => matchesHistoryView(entry, { kind: "resources" })).map(entry => entry.node.id)).toEqual(["4", "6", "7"]);
    expect(entries.filter(entry => matchesHistoryView(entry, { kind: "all" }))).toHaveLength(8);
    expect(historyResourceViews(entries).map(source => [source.resource.id, source.count])).toEqual([["a", 2], ["b", 1]]);
    // A 的列表中 4 与 6 相邻，“6 之前”仍是被过滤掉的工作台事件 5。
    expect(historyBefore(nodes, nodes[5])).toBe("5");
  });
  it("已移除、其他分支与非代理资源的自发事件仍可作为视图来源", () => {
    const nodes = [
      node("1", null, created("r", "Game", "board")),
      node("2", "1", { kind: "event", type: "object_removed", agentId: null, data: { id: "r" }, model: null }),
      node("3", "1", { kind: "event", type: "board.move", agentId: null, data: { resourceId: "r" }, model: null }),
    ];
    const entries = historyEntries(nodes, label);
    expect(historyResourceViews(entries)).toEqual([{ resource: { id: "r", kind: "board", title: "Game" }, count: 1 }]);
    expect(entries.filter(entry => matchesHistoryView(entry, { kind: "resource", resourceId: "r" })).map(entry => entry.node.id)).toEqual(["3"]);
  });

  it("同一响应穿插工作台事件与另一代理输出时保持独立落点和追加顺序", () => {
    const nodes = [
      node("1", null, created("a", "Alpha")),
      node("2", "1", { ...block, kind: "text", text: "First\nparagraph" }),
      node("3", "2", created("b", "Beta")),
      node("4", "3", { ...block, kind: "text", agentId: "b", responseId: "other", text: "Interleaved" }),
      node("5", "4", { ...block, kind: "text", ordinal: 1, text: "Second paragraph" }),
    ];
    nodes[4].createdAt = "2026-10-09T10:00:00Z"; // 时钟时间不参与导航排序。
    const entries = historyEntries(nodes, label);
    expect(entries.map(entry => entry.node.id)).toEqual(["1", "2", "3", "4", "5"]);
    expect(entries[1].label).toBe("First paragraph");
    expect(entries[2].scope).toBe("session");
    expect(entries[3].resource?.title).toBe("Beta");
    expect(entries[4].resource?.title).toBe("Alpha");
  });
  it("移除对象与另一分支不丢失资源身份；资源自发事件沿自己的身份解析", () => {
    const nodes = [
      node("1", null, created("n", "Old note", "note")),
      node("2", "1", { kind: "event", type: "object_removed", agentId: null, data: { id: "n" }, model: null }),
      node("3", "1", { kind: "event", type: "custom.saved", agentId: null, data: { resourceId: "n" }, model: null }),
    ];
    const entries = historyEntries(nodes, label);
    expect(historyResources(nodes).get("n")).toEqual({ id: "n", kind: "note", title: "Old note" });
    expect(entries[1].label).toBe(getI18n().formatMessage(historyMessages.eventRemoved, { title: "Old note" }));
    expect(entries[2].scope).toBe("resource");
    expect(entries[2].resource?.title).toBe("Old note");
  });
  it("查看之前使用真实父链，不使用过滤后的上一行，并跳过不可选择的不完整块", () => {
    const nodes = [
      node("1", null, created("a", "A")),
      node("2", "1", { ...block, kind: "thinking", text: "Reasoning" }),
      node("3", "2", { ...block, kind: "toolcall", ordinal: 1, callId: "call", name: "resource_call", argumentsText: "{}",
        arguments: { resource_id: "n", tool: "read", target: { path: "input.md" }, args: {} }, outcome: { kind: "succeeded", data: null, model: null } }),
      node("4", "3", { ...block, kind: "text", ordinal: 2, complete: false, text: "Interrupted" }),
      node("5", "4", { kind: "message", agentId: "a", text: "Continue" }),
      node("6", "1", { kind: "message", agentId: "a", text: "Another branch" }),
    ];
    expect(historyEntries(nodes, label).map(entry => entry.node.id)).toEqual(["1", "2", "3", "5", "6"]);
    expect(historyEntries(nodes, label)[2].label).toBe("read · input.md");
    expect(historyBefore(nodes, nodes[2])).toBe("2");
    expect(historyBefore(nodes, nodes[4])).toBe("3");
    expect(historyBefore(nodes, nodes[5])).toBe("1");
    expect(historyBefore(nodes, nodes[0])).toBeNull();
  });
});
