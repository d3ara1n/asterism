import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { NewNode } from "../shared/session.ts";
import { projectForAgent } from "./projection.ts";
import { SessionTree } from "./tree.ts";

const blk = { continuation: null, adapter: "test/1", scope: "s", complete: true };
const text = (agentId: string, responseId: string, ordinal: number, t: string, complete = true): NewNode =>
  ({ ...blk, kind: "text", agentId, responseId, ordinal, text: t, complete });
const thinking = (agentId: string, responseId: string, ordinal: number): NewNode =>
  ({ ...blk, kind: "thinking", agentId, responseId, ordinal, text: "…" });
const call = (agentId: string, responseId: string, ordinal: number, callId: string): NewNode =>
  ({ ...blk, kind: "toolcall", agentId, responseId, ordinal, callId, name: "read", argumentsText: "{}", arguments: {},
    outcome: { kind: "succeeded", model: callId, data: null } });
const end = (agentId: string, responseId: string): NewNode =>
  ({ kind: "response_end", agentId, responseId, usage: null, finishReason: "stop", model: "p/m" });
const msg = (agentId: string, t: string): NewNode => ({ kind: "message", agentId, text: t });
const attached = (agentId: string | null, r: string): NewNode => ({ kind: "event", agentId, type: "resource_attached", data: { id: r }, model: `${r} attached` });

function setup() { const tree = new SessionTree(new DatabaseSync(":memory:")); return { tree, s: tree.create("S") }; }

describe("会话级扁平树", () => {
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
    expect(projectForAgent(tree.path(s), "a")).toEqual([{ kind: "input", text: "hi" }]);
  });

  it("停在 thinking 之后选择时吸附到其之前", () => {
    const { tree, s } = setup();
    const m = tree.append(s, msg("a", "hi"));
    const t = tree.append(s, thinking("a", "r1", 0));
    tree.append(s, text("a", "r1", 1, "ok"));
    expect(tree.select(s, t.id)).toBe(m.id);
  });

  it("投影按 ordinal 重组响应、结果随后，响应期间的事件延后；其他代理不可见", () => {
    const { tree, s } = setup();
    tree.append(s, msg("a", "go"));
    tree.append(s, call("a", "r1", 1, "c2")); // 并行时 tc2 先完成
    tree.append(s, attached("a", "dir"));
    tree.append(s, text("b", "rb", 0, "other agent"));
    tree.append(s, call("a", "r1", 0, "c1"));
    tree.append(s, end("a", "r1"));
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
    tree.append(s, { kind: "event", agentId: null, type: "agent_created", data: { id: "a", title: "A" }, model: null });
    tree.append(s, { kind: "event", agentId: null, type: "resource_created", data: { id: "d", type: "directory", title: "d", path: "/x" }, model: null });
    const linkedAt = tree.append(s, attached("a", "d")).id;
    tree.append(s, { kind: "event", agentId: null, type: "object_removed", data: { id: "d" }, model: null });
    expect(foldWorkbench(tree.path(s))).toMatchObject({ objects: [{ id: "a" }], links: [] });
    tree.select(s, linkedAt);
    expect(foldWorkbench(tree.path(s)).links).toEqual([{ agentId: "a", resourceId: "d" }]);
  });
});
