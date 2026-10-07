import { afterEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { HistoryKernel } from "../history/kernel.ts";
import { defaultAgents } from "../configuration/defaults.ts";
import { ConversationStore } from "../conversation/store.ts";
import { projectModel, projectUser } from "../conversation/projection.ts";
import { runAgent } from "./loop.ts";
import type { RuntimeTool } from "./tools.ts";
import type { ModelAdapter, ModelEvent, ModelInput } from "../model/contract.ts";
import type { ModelSettings, ToolPart } from "../shared/conversation.ts";

export const settings: ModelSettings = {
  provider: { id: "provider", revision: 1, name: "Provider", protocol: "openai-responses", baseUrl: "https://example.invalid/v1", enabled: true, auth: "none" },
  model: { id: "model", revision: 1, providerId: "provider", name: "Model", modelId: "model", enabled: true, contextWindow: 10000,
    capabilities: { reasoning: true, tools: true, images: false }, generation: { temperature: null, topP: null, maxOutputTokens: 1000 } }, thinking: null,
};
const kernels: HistoryKernel[] = [];
afterEach(() => { for (const kernel of kernels.splice(0)) kernel.close(); });
function setup() {
  const db = new DatabaseSync(":memory:");
  const history = new HistoryKernel(db); kernels.push(history);
  const { branch_id } = history.createTask();
  const { agent_id } = history.createAgent(branch_id);
  const store = new ConversationStore(history, branch_id, agent_id);
  store.append({ type: "created", agent: { ...defaultAgents[0]!, revision: 1 } });
  store.append({ type: "node.appended", node: { id: "input", parentId: null, kind: "input", text: "Read both notes", createdAt: "now" } });
  const a = history.createResource(branch_id, { type: "note" }).resource_id;
  const b = history.createResource(branch_id, { type: "note" }).resource_id;
  history.requestBinding(branch_id, { agent_id, resource_id: a, action: "attach" });
  history.requestBinding(branch_id, { agent_id, resource_id: b, action: "attach" });
  const { turn_id } = history.startTurn(branch_id, { agent_id });
  const turn = history.reconstruct(history.head(branch_id)).in_flight_turns.find(t => t.turn_id === turn_id)!;
  return { history, store, a, b, turn, db };
}
function call(id: string, resource: string): ModelEvent[] {
  const part: ToolPart = { id, kind: "tool", callId: id, name: "read", argumentsText: "", arguments: null, complete: false, execution: "proposed", outcome: null };
  return [{ type: "part.start", part }, { type: "part.end", partId: id, arguments: { resource_id: resource } }];
}
function finish(reason = "stop"): ModelEvent {
  return { type: "finish", reason, replay: { role: "assistant", content: [{ type: "text", text: "test" }] }, usage: { input: 10, output: 20, total: 30, reasoning: null, cacheRead: 5, cacheWrite: null } };
}
function text(): ModelEvent[] {
  return [{ type: "part.start", part: { id: "text", kind: "text", text: "", complete: false } }, { type: "part.delta", partId: "text", delta: "Done" }, { type: "part.end", partId: "text" }, finish()];
}
function scripted(scripts: Array<(signal: AbortSignal) => AsyncIterable<ModelEvent>>, inputs: ModelInput[] = []): ModelAdapter {
  let index = 0;
  return { version: "test/1", prepare(input) { inputs.push(input); const script = scripts[index++]; if (!script) throw new Error("Unexpected model request");
    return { input: { attempt: index }, stream: signal => script(signal) }; } };
}
async function* events(values: ModelEvent[]) { yield* values; }
const schema = z.strictObject({ resource_id: z.string() });
function readTool(execute: RuntimeTool["execute"]): RuntimeTool {
  return { name: "read", description: "Read", parameters: { type: "object" }, schema, permission: "read", effect: "read", execution: "parallel", execute };
}

describe("单代理执行契约", () => {
  it("工具结果写入失败时同一事务内的操作成功记录也回滚，不留下半份成功", async () => {
    const { db, history, store, turn, a } = setup();
    db.exec(`CREATE TRIGGER fail_tool_result BEFORE INSERT ON events
      WHEN NEW.type = 'conversation_event'
        AND json_extract(NEW.payload, '$.mutation.type') = 'tool.settled'
        AND json_extract(NEW.payload, '$.mutation.outcome.kind') = 'succeeded'
      BEGIN SELECT RAISE(ABORT, 'synthetic write failure'); END;`);
    await runAgent({ store, turn, settings, signal: new AbortController().signal,
      tools: [readTool(async () => ({ kind: "succeeded", model: "read", data: null }))],
      adapter: scripted([() => events([...call("a", a), finish("tool-calls")])]) });
    expect(history.eventsOn(store.branchId).some(e => e.type === "operation_finished" && e.payload.status === "succeeded")).toBe(false);
    expect(store.model(store.read().cursor!)).toMatchObject({ state: "failed", parts: [{ outcome: { kind: "unknown" } }] });
  });

  it("并行工具逐项结束但整批交付；调用顺序稳定，detach 只在轮次结束生效", async () => {
    const { history, store, a, b, turn } = setup();
    const inputs: ModelInput[] = [];
    const settled: string[] = [];
    const gate = Promise.withResolvers<void>();
    const tool = readTool(async args => {
      const resource = schema.parse(args).resource_id;
      if (resource === a) await gate.promise;
      else { history.requestBinding(store.branchId, { agent_id: store.agentId, resource_id: a, action: "detach" }); settled.push("b"); gate.resolve(); }
      if (resource === a) settled.push("a");
      return { kind: "succeeded", model: resource, data: { resource } };
    });
    await runAgent({ store, turn, settings, tools: [tool], signal: new AbortController().signal,
      adapter: scripted([() => events([...call("a", a), ...call("b", b), finish("tool-calls")]), () => events(text())], inputs) });
    expect(settled).toEqual(["b", "a"]);
    expect(inputs).toHaveLength(2);
    expect(inputs[1]!.messages.filter(m => m.kind === "result").map(m => m.callId)).toEqual(["a", "b"]);
    const models = [...store.read().nodes.values()].filter(n => n.kind === "model");
    expect(models.map(n => n.state)).toEqual(["complete", "complete"]);
    expect(models.map(n => n.usage?.total)).toEqual([30, 30]);
    expect(models[0]!.request.bindings).toEqual(turn.bindings);
    expect(history.reconstruct(history.head(store.branchId)).bindings_by_agent[store.agentId]!.resources.map(r => r.resource_id)).toEqual([b]);
  });

  it("未授权资源被拒绝并交付模型，执行器不会被调用", async () => {
    const { store, turn } = setup(); let executed = 0;
    const inputs: ModelInput[] = [];
    await runAgent({ store, turn, settings, tools: [readTool(async () => { executed++; return { kind: "succeeded", model: null, data: null }; })], signal: new AbortController().signal,
      adapter: scripted([() => events([...call("forbidden", "guessed-resource"), finish("tool-calls")]), () => events(text())], inputs) });
    expect(executed).toBe(0);
    expect(inputs[1]!.messages.find(m => m.kind === "result")).toMatchObject({ outcome: { kind: "rejected", error: { code: "access_denied" } } });
  });

  it("输出上限截断时，即使工具参数完整也不执行，仍保存用量和可查看的内容", async () => {
    const { store, turn, a } = setup(); let executed = false;
    await runAgent({ store, turn, settings, tools: [readTool(async () => { executed = true; return { kind: "succeeded", model: null, data: null }; })], signal: new AbortController().signal,
      adapter: scripted([() => events([...call("a", a), finish("length")])]) });
    const node = store.model(store.read().cursor!);
    expect(executed).toBe(false); expect(node.state).toBe("failed"); expect(node.usage?.total).toBe(30);
    expect(() => projectModel(store.read())).toThrow("Incomplete");
    expect(() => store.append({ type: "cursor.selected", nodeId: node.id })).toThrow("incomplete");
    store.append({ type: "cursor.selected", nodeId: "input" });
    store.append({ type: "node.appended", node: { kind: "input", id: "branch", parentId: "input", text: "Try again", createdAt: "now" } });
    expect(store.read().nodes.has(node.id)).toBe(true);
    expect(projectModel(store.read())).toEqual([{ kind: "input", text: "Read both notes" }, { kind: "input", text: "Try again" }]);
  });

  it("取消保留已收到但尚未达批量阈值的正文，不产生下一次请求", async () => {
    const { store, turn } = setup(); const controller = new AbortController();
    const adapter = scripted([async function* () {
      yield { type: "part.start", part: { id: "text", kind: "text", text: "", complete: false } };
      yield { type: "part.delta", partId: "text", delta: "Partial output" };
      controller.abort(); controller.signal.throwIfAborted();
    }]);
    await runAgent({ store, turn, settings, tools: [], adapter, signal: controller.signal });
    expect(store.model(store.read().cursor!)).toMatchObject({ state: "cancelled", usage: null, parts: [{ text: "Partial output", complete: false }] });
  });

  it("重建时运行中工具标记结果未知，未启动工具标记取消，不重放任何操作", () => {
    const { store, turn } = setup();
    store.append({ type: "node.appended", node: { kind: "model", id: "model", parentId: "input", createdAt: "now", turnId: turn.turn_id,
      request: { adapter: "test", settings, input: null, historySeq: store.read().seq, bindingVersion: turn.binding_version, bindings: turn.bindings },
      state: "streaming", parts: [], usage: null, finishReason: null, responseId: null, rawFinishReason: null, replay: null, error: null } });
    for (const id of ["a", "b"]) {
      const first = call(id, "resource")[0]!;
      if (first.type !== "part.start") throw new Error();
      store.append({ type: "part.started", nodeId: "model", part: first.part });
      store.append({ type: "part.ended", nodeId: "model", partId: id, arguments: {} });
    }
    store.append({ type: "response.finished", nodeId: "model", usage: null, finishReason: "tool-calls", replay: null });
    store.append({ type: "tool.started", nodeId: "model", partId: "a" });
    const reopened = new ConversationStore(store.history, store.branchId, store.agentId);
    reopened.recover();
    expect(reopened.model("model")).toMatchObject({ state: "interrupted", parts: [
      { outcome: { kind: "unknown" } }, { outcome: { kind: "cancelled" } },
    ] });
    const count = store.history.eventCount(); reopened.recover(); expect(store.history.eventCount()).toBe(count);
  });

  it("压缩与不可见扩展不删除历史；回到压缩前分支恢复原始上下文", () => {
    const { store } = setup();
    store.append({ type: "node.appended", node: { kind: "extension", id: "hidden", parentId: "input", createdAt: "now", extension: "plugin", version: 1, data: { cursor: 3 }, model: "omit", user: "omit" } });
    store.append({ type: "node.appended", node: { kind: "compaction", id: "compact", parentId: "hidden", createdAt: "now", summary: "Earlier work" } });
    expect(projectModel(store.read())).toEqual([{ kind: "input", text: "Conversation summary:\nEarlier work" }]);
    expect(projectUser([...store.read().nodes.values()])).toHaveLength(2);
    store.append({ type: "cursor.selected", nodeId: "input" });
    expect(projectModel(store.read())).toEqual([{ kind: "input", text: "Read both notes" }]);
    expect(store.read().nodes.has("compact")).toBe(true);
  });
});
