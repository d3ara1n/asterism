import { describe, expect, it } from "vitest";
import type { ConversationBridge, ConversationChanged, ConversationCommand, ConversationResult, ConversationSnapshot } from "../../../shared/conversation.ts";
import { ConversationController, SubmissionIdentity } from "./controller.ts";

function snapshot(seq: number): ConversationSnapshot {
  return { taskId: "task", agentId: "agent", agentName: "Worker", cursor: null, seq, nodes: [], activeTurnId: null, selection: null, selectionRevision: 0, lastError: null };
}
function fixture() {
  let listener: ((event: ConversationChanged) => void) | null = null;
  const requests: Array<{ command: ConversationCommand; resolve: (result: ConversationResult) => void }> = [];
  const bridge: ConversationBridge = {
    execute: command => new Promise(resolve => requests.push({ command, resolve })),
    onChanged: callback => { listener = callback; return () => { if (listener === callback) listener = null; }; },
  };
  const controller = new ConversationController(bridge, "task", "agent");
  return { controller, requests, notify: (seq: number, selectionRevision = 0) => listener?.({ kind: "conversation.changed", taskId: "task", agentId: "agent", seq, selectionRevision }) };
}

describe("会话消费时序", () => {
  it("选择变化独立于历史序号刷新，晚到查询不能还原旧选择", async () => {
    const { controller, requests, notify } = fixture(); const disconnect = controller.connect();
    requests[0]!.resolve({ ok: true, snapshot: snapshot(3) }); await Promise.resolve();
    notify(3, 1); expect(requests).toHaveLength(2);
    const command = controller.execute({ type: "configure", taskId: "task", agentId: "agent",
      selection: { agentConfigurationId: "reviewer", modelId: "model", thinking: null } });
    requests[2]!.resolve({ ok: true, snapshot: { ...snapshot(3), selectionRevision: 2 } }); await command;
    requests[1]!.resolve({ ok: true, snapshot: { ...snapshot(3), selectionRevision: 1 } }); await Promise.resolve();
    expect(controller.getSnapshot().snapshot?.selectionRevision).toBe(2); disconnect();
  });
  it("查询途中收到增量通知时补读一次，不漏掉最后一批输出", async () => {
    const { controller, requests, notify } = fixture(); const disconnect = controller.connect();
    notify(2); notify(3);
    requests[0]!.resolve({ ok: true, snapshot: snapshot(1) }); await Promise.resolve();
    expect(requests).toHaveLength(2);
    requests[1]!.resolve({ ok: true, snapshot: snapshot(3) }); await Promise.resolve();
    expect(controller.getSnapshot().snapshot?.seq).toBe(3);
    notify(3); expect(requests).toHaveLength(2); disconnect();
  });

  it("晚到查询不能覆盖较新的命令结果；重复点击不产生第二个命令", async () => {
    const { controller, requests } = fixture(); const disconnect = controller.connect();
    const command = controller.execute({ type: "cancel", taskId: "task", agentId: "agent" });
    const duplicate = await controller.execute({ type: "cancel", taskId: "task", agentId: "agent" });
    expect(duplicate).toMatchObject({ ok: false, error: { code: "conflict" } }); expect(requests).toHaveLength(2);
    requests[1]!.resolve({ ok: true, snapshot: snapshot(4) }); await command;
    requests[0]!.resolve({ ok: true, snapshot: snapshot(2) }); await Promise.resolve();
    expect(controller.getSnapshot().snapshot?.seq).toBe(4); disconnect();
  });

  it("断开重连后忽略旧订阅的在途响应，卸载不发送取消命令", async () => {
    const { controller, requests } = fixture();
    const first = controller.connect(); first(); const second = controller.connect();
    requests[0]!.resolve({ ok: true, snapshot: snapshot(8) });
    requests[1]!.resolve({ ok: true, snapshot: snapshot(5) }); await Promise.resolve();
    expect(controller.getSnapshot().snapshot?.seq).toBe(5);
    expect(requests.map(r => r.command.type)).toEqual(["read", "read"]); second();
  });

  it("丢失响应后保持提交身份，已接受后的相同文本视为新的明确输入", () => {
    const identity = new SubmissionIdentity();
    const first = identity.forInput({ text: "Hello", modelId: "model" });
    expect(identity.forInput({ text: "Hello", modelId: "model" })).toBe(first);
    identity.accepted();
    expect(identity.forInput({ text: "Hello", modelId: "model" })).not.toBe(first);
    expect(identity.forInput({ text: "Other", modelId: "model" })).not.toBe(first);
  });
});
