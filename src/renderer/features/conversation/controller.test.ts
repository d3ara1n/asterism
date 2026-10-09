import { describe, expect, it } from "vitest";
import { emptyCompletion, type SessionBridge, type SessionChanged, type SessionCommand, type SessionResult, type SessionSnapshot, type SessionNode } from "../../../shared/session.ts";
import { SessionController, SubmissionIdentity } from "./controller.ts";

function snapshot(seq: number, selectionRevision = 0): SessionSnapshot {
  return { sessionId: "s", title: "S", cursor: null, seq, nodes: [], live: [], agents: [], running: false, selectionRevision };
}
function fixture() {
  let listener: ((event: SessionChanged) => void) | null = null;
  const requests: Array<{ command: SessionCommand; resolve: (result: SessionResult) => void }> = [];
  const bridge: SessionBridge = {
    execute: command => new Promise(resolve => requests.push({ command, resolve })),
    onChanged: callback => { listener = callback; return () => { if (listener === callback) listener = null; }; },
  };
  const controller = new SessionController(bridge, "s");
  return { controller, requests, notify: (seq: number, selectionRevision = 0) => listener?.({ kind: "session.changed", sessionId: "s", seq, selectionRevision }) };
}

describe("会话消费时序", () => {
  it("晚到查询不能还原旧选择", async () => {
    const { controller, requests, notify } = fixture(); const disconnect = controller.connect();
    requests[0]!.resolve({ ok: true, snapshot: snapshot(3) }); await Promise.resolve();
    notify(3, 1); expect(requests).toHaveLength(2);
    const command = controller.execute({ type: "configure", sessionId: "s", agentId: "a", selection: { agentConfigurationId: "r", modelId: "m", thinking: null } });
    requests[2]!.resolve({ ok: true, snapshot: snapshot(3, 2) }); await command;
    requests[1]!.resolve({ ok: true, snapshot: snapshot(3, 1) }); await Promise.resolve();
    expect(controller.getSnapshot().snapshot?.selectionRevision).toBe(2); disconnect();
  });
  it("查询途中收到通知时补读一次，不漏最后一批输出", async () => {
    const { controller, requests, notify } = fixture(); const disconnect = controller.connect();
    notify(2); notify(3);
    requests[0]!.resolve({ ok: true, snapshot: snapshot(1) }); await Promise.resolve();
    expect(requests).toHaveLength(2);
    requests[1]!.resolve({ ok: true, snapshot: snapshot(3) }); await Promise.resolve();
    expect(controller.getSnapshot().snapshot?.seq).toBe(3);
    notify(3); expect(requests).toHaveLength(3); disconnect();
  });
  it("卡片与历史浮岛共享连接：最后一个断开才退订，卸载不发送取消", async () => {
    const { controller, requests, notify } = fixture();
    const a = controller.connect(); const b = controller.connect();
    requests[0]!.resolve({ ok: true, snapshot: snapshot(1) }); await Promise.resolve();
    a(); notify(2); expect(requests).toHaveLength(2);
    b(); notify(5); expect(requests).toHaveLength(2);
    expect(requests.map(r => r.command.type)).toEqual(["read", "read"]);
  });
  it("丢失响应后保持提交身份，接受后相同文本视为新输入", () => {
    const identity = new SubmissionIdentity();
    const first = identity.forInput({ text: "Hello" });
    expect(identity.forInput({ text: "Hello" })).toBe(first);
    identity.accepted();
    expect(identity.forInput({ text: "Hello" })).not.toBe(first);
  });

  it("节点序号不变的终态通知仍刷新块元数据并结束运行状态", async () => {
    const { controller, requests, notify } = fixture();
    const disconnect = controller.connect();
    const block: SessionNode = { ...emptyCompletion, kind: "text", id: "block", sessionId: "s", parentId: null, createdAt: "",
      agentId: "a", responseId: "r", requestParentId: null, model: "p/m", ordinal: 0, complete: true,
      continuation: null, adapter: "test", scope: "s", text: "saved" };
    requests[0]!.resolve({ ok: true, snapshot: { ...snapshot(4), nodes: [block], running: true } });
    await Promise.resolve();
    notify(4);
    requests[1]!.resolve({ ok: true, snapshot: { ...snapshot(4), nodes: [{ ...block, finishReason: "stop",
      usage: { input: 2, output: 3, total: 5, reasoning: null, cacheRead: null, cacheWrite: null } }] } });
    await Promise.resolve();
    expect(controller.getSnapshot().snapshot?.running).toBe(false);
    expect(controller.getSnapshot().snapshot?.nodes[0]).toMatchObject({ usage: { total: 5 }, finishReason: "stop" });
    disconnect();
  });

  it("select 前发出的同序号查询不能覆盖新的游标", async () => {
    const { controller, requests, notify } = fixture();
    const disconnect = controller.connect();
    requests[0]!.resolve({ ok: true, snapshot: { ...snapshot(4), cursor: "old" } });
    await Promise.resolve();
    notify(4);
    const selected = controller.execute({ type: "select", sessionId: "s", nodeId: "new" });
    requests[2]!.resolve({ ok: true, snapshot: { ...snapshot(4), cursor: "new" } });
    await selected;
    requests[1]!.resolve({ ok: true, snapshot: { ...snapshot(4), cursor: "old" } });
    await Promise.resolve();
    expect(controller.getSnapshot().snapshot?.cursor).toBe("new");
    disconnect();
  });
});
