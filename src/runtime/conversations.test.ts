import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { setImmediate } from "node:timers/promises";
import { afterEach, describe, expect, it } from "vitest";
import { ApplicationService } from "./service.ts";
import { ModelFailure, type ModelAdapter } from "../model/contract.ts";
import { conversationVersion, type ConversationCommand } from "../shared/conversation.ts";
import { dispatchConversation } from "./dispatch.ts";
import { sdkMessages } from "../model/ai-sdk.ts";

const roots: string[] = [];
const services = new Set<ApplicationService>();
afterEach(async () => { for (const service of services) await service.close(); services.clear(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const adapter: ModelAdapter = { version: "ai-sdk-v7/1", prepare: input => { sdkMessages(input); return { input: { messages: ["test"] }, async *stream() {
  yield { type: "part.start", part: { id: "text", kind: "text", text: "", complete: false } };
  yield { type: "part.delta", partId: "text", delta: "Hello" };
  yield { type: "part.end", partId: "text" };
  yield { type: "finish", reason: "stop", usage: null, replay: { role: "assistant", content: [{ type: "text", text: "Hello" }] } };
} }; } };
async function setup(modelAdapter = adapter) {
  const root = mkdtempSync(join(tmpdir(), "weft-conversation-")); roots.push(root);
  const service = new ApplicationService(root, { adapterFactory: () => modelAdapter }); services.add(service);
  const { savedId: providerId } = await service.configuration.execute({ type: "provider.save", id: null,
    value: { name: "Test", protocol: "openai-responses", baseUrl: "https://example.invalid/v1", enabled: true, auth: "none" }, credential: { action: "keep" } });
  const { savedId: modelId } = await service.configuration.execute({ type: "model.save", id: null,
    value: { providerId: providerId!, name: "Test", modelId: "test", enabled: true, contextWindow: null,
      capabilities: { tools: true, reasoning: false, images: false }, generation: { temperature: null, topP: null, maxOutputTokens: null } } });
  const command: Extract<ConversationCommand, { type: "start" }> = { type: "start", submissionId: randomUUID(), agentConfigurationId: "worker", modelId: modelId!, thinking: null, text: "First input" };
  return { service, root, command };
}
async function settled(service: ApplicationService): Promise<void> {
  for (let i = 0; i < 200 && service.conversations.running; i++) await setImmediate();
  expect(service.conversations.running).toBe(false);
}

describe("会话运行时与持久化", () => {
  it("已有对话每轮读取当前提示词和工具策略，重开只重建消息", async () => {
    const prompts: string[] = [];
    const tools: string[][] = [];
    const limits: Array<number | null> = [];
    const capturing: ModelAdapter = { version: adapter.version, prepare: input => {
      prompts.push(input.system.blocks.find(block => block.kind === "agent")!.text); tools.push(input.tools.map(tool => tool.name));
      limits.push(input.settings.model.generation.maxOutputTokens); return adapter.prepare(input);
    } };
    const { service, root, command } = await setup(capturing);
    await service.configuration.execute({ type: "agent.save", id: "worker", value: { systemPrompt: "Original instructions" } });
    const initial = await service.conversations.execute(command); await settled(service);
    expect(prompts.at(-1)).toBe("Original instructions"); expect(tools.at(-1)).toEqual(["read"]);
    const before = await service.conversations.execute({ type: "read", taskId: initial.taskId, agentId: initial.agentId });
    await service.configuration.execute({ type: "agent.save", id: "worker", value: { systemPrompt: "Updated instructions", tools: [] } });
    const { snapshot: config } = await service.configuration.execute({ type: "read" });
    const { id: _id, revision: _revision, ...model } = config.models.find(item => item.id === command.modelId)!;
    await service.configuration.execute({ type: "model.save", id: command.modelId, value: { ...model, generation: { ...model.generation, maxOutputTokens: 16 } } });
    await service.conversations.execute({ type: "submit", taskId: initial.taskId, agentId: initial.agentId,
      submissionId: randomUUID(), modelId: command.modelId, thinking: null, text: "Next" }); await settled(service);
    expect(prompts.at(-1)).toBe("Updated instructions");
    expect(tools.at(-1)).toEqual([]);
    expect(limits.at(-1)).toBe(16);
    await service.close(); services.delete(service);
    const reopened = new ApplicationService(root, { adapterFactory: () => capturing }); services.add(reopened);
    await reopened.conversations.execute({ type: "submit", taskId: initial.taskId, agentId: initial.agentId,
      submissionId: randomUUID(), modelId: command.modelId, thinking: null, text: "Continue" });
    await settled(reopened);
    expect(prompts.at(-1)).toBe("Updated instructions");
    const after = await reopened.conversations.execute({ type: "read", taskId: initial.taskId, agentId: initial.agentId });
    expect(after.nodes.slice(0, before.nodes.length)).toEqual(before.nodes);
    const db = new DatabaseSync(join(root, "db", "weft.sqlite"), { readOnly: true });
    try {
      const records = db.prepare("SELECT payload FROM events WHERE type = 'conversation_event'").all().map(row => String(row.payload)).join("\n");
      expect(records).not.toContain("Original instructions");
      expect(records).not.toContain("Updated instructions");
      expect(records).not.toContain('"systemPrompt"');
      expect(records).not.toContain('"generation"');
      expect(records).not.toContain('"settings"');
    } finally { db.close(); }
  });
  it("切换当前代理不写历史，继续执行使用新角色；配置失效时明确失败", async () => {
    const prompts: string[] = [];
    const { service, command } = await setup({ version: adapter.version, prepare: input => {
      prompts.push(input.system.blocks.find(block => block.kind === "agent")!.text); return adapter.prepare(input);
    } });
    const initial = await service.conversations.execute(command); await settled(service);
    const custom = await service.configuration.execute({ type: "agent.save", id: null, value: { name: "Supervisor", systemPrompt: "Supervise" } });
    const count = service.history.eventCount();
    const selected = await service.conversations.execute({ type: "configure", taskId: initial.taskId, agentId: initial.agentId,
      selection: { agentConfigurationId: custom.savedId!, modelId: command.modelId, thinking: null } });
    expect(service.history.eventCount()).toBe(count);
    expect(selected.selection?.agentConfigurationId).toBe(custom.savedId);
    await service.conversations.execute({ type: "continue", taskId: initial.taskId, agentId: initial.agentId, modelId: command.modelId, thinking: null });
    await settled(service); expect(prompts.at(-1)).toBe("Supervise");
    await service.configuration.execute({ type: "remove", kind: "agent", id: custom.savedId! });
    const before = service.history.eventCount();
    await expect(service.conversations.execute({ type: "submit", taskId: initial.taskId, agentId: initial.agentId,
      modelId: command.modelId, thinking: null, submissionId: randomUUID(), text: "No fallback" })).rejects.toThrow("Choose an available agent");
    expect(service.history.eventCount()).toBe(before);
    expect((await service.conversations.execute({ type: "read", taskId: initial.taskId, agentId: initial.agentId })).nodes.length).toBeGreaterThan(0);
    const { snapshot: configuration } = await service.configuration.execute({ type: "read" });
    const { id: _id, revision: _revision, ...model } = configuration.models.find(item => item.id === command.modelId)!;
    await service.configuration.execute({ type: "remove", kind: "model", id: command.modelId });
    const replacement = await service.configuration.execute({ type: "model.save", id: null, value: model });
    await service.conversations.execute({ type: "configure", taskId: initial.taskId, agentId: initial.agentId,
      selection: { agentConfigurationId: custom.savedId!, modelId: replacement.savedId!, thinking: null } });
    await service.conversations.execute({ type: "configure", taskId: initial.taskId, agentId: initial.agentId,
      selection: { agentConfigurationId: "worker", modelId: replacement.savedId!, thinking: null } });
    await service.conversations.execute({ type: "continue", taskId: initial.taskId, agentId: initial.agentId, modelId: replacement.savedId!, thinking: null });
    await settled(service);
  });
  it("运行中修改配置只影响下一轮，本轮后续请求使用已取用环境", async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    let streams = 0;
    const seen: string[] = [];
    const { service, command } = await setup({ version: adapter.version, prepare: input => {
      const prompt = input.system.blocks.find(block => block.kind === "agent")!.text;
      return { async *stream() {
        seen.push(prompt);
        if (++streams === 1) {
          await gate;
          yield { type: "part.start", part: { id: "tool", kind: "tool", callId: "call", name: "missing", argumentsText: "", arguments: null, complete: false, execution: "proposed", outcome: null } } as const;
          yield { type: "part.end", partId: "tool", arguments: {} } as const;
          yield { type: "finish", reason: "tool-calls", usage: null, replay: { role: "assistant", content: [] } } as const;
        } else yield* adapter.prepare(input).stream(new AbortController().signal);
      } };
    } });
    await service.configuration.execute({ type: "agent.save", id: "worker", value: { systemPrompt: "Before" } });
    const initial = await service.conversations.execute(command);
    try {
      await service.configuration.execute({ type: "agent.save", id: "worker", value: { systemPrompt: "After" } });
    } finally { release(); }
    await settled(service);
    expect(seen).toEqual(["Before", "Before"]);
    await service.conversations.execute({ type: "continue", taskId: initial.taskId, agentId: initial.agentId, modelId: command.modelId, thinking: null });
    await settled(service); expect(seen.at(-1)).toBe("After");
  });
  it("旧事件只迁移选择身份，保留原始事件并忽略冻结的代理正文", async () => {
    const { service, root, command } = await setup();
    const initial = await service.conversations.execute(command); await settled(service);
    const { snapshot: config } = await service.configuration.execute({ type: "read" });
    await service.close(); services.delete(service);
    const db = new DatabaseSync(join(root, "db", "weft.sqlite"));
    let legacyPayload = "";
    try {
      const row = db.prepare("SELECT event_id, payload FROM events WHERE type = 'conversation_event' AND json_extract(payload, '$.mutation.type') = 'created'").get()!;
      legacyPayload = JSON.stringify({ ...JSON.parse(String(row.payload)), version: 1, mutation: { type: "created", agent: { ...config.agents.find(a => a.id === "worker")!, systemPrompt: "Frozen legacy instructions" } } });
      db.prepare("UPDATE events SET payload = ? WHERE event_id = ?").run(legacyPayload, row.event_id!);
      const node = db.prepare("SELECT event_id, payload FROM events WHERE type = 'conversation_event' AND json_extract(payload, '$.mutation.node.kind') = 'model'").get()!;
      const oldNode = JSON.parse(String(node.payload));
      const { credentialState: _credential, ...provider } = config.providers[0]!;
      oldNode.mutation.node.request = { adapter: adapter.version, settings: { provider, model: config.models[0]!, thinking: null },
        input: { system: "Obsolete system", tools: [] }, historySeq: 0, bindingVersion: 0, bindings: [] };
      db.prepare("UPDATE events SET payload = ? WHERE event_id = ?").run(JSON.stringify(oldNode), node.event_id!);
      db.prepare("UPDATE events SET payload = json_set(payload, '$.input.modelId', ?, '$.input.thinking', NULL) WHERE type = 'turn_started'").run(command.modelId);
      db.exec("DROP TABLE conversation_selections; PRAGMA user_version = 4;");
    } finally { db.close(); }
    const seen: string[] = [];
    const reopened = new ApplicationService(root, { adapterFactory: () => ({ version: adapter.version, prepare: input => {
      seen.push(input.system.blocks.find(block => block.kind === "agent")!.text); return adapter.prepare(input);
    } }) }); services.add(reopened);
    await reopened.configuration.execute({ type: "agent.save", id: "worker", value: { systemPrompt: "Current instructions" } });
    const loaded = await reopened.conversations.execute({ type: "read", taskId: initial.taskId, agentId: initial.agentId });
    expect(loaded.selection).toEqual({ agentConfigurationId: "worker", modelId: command.modelId, thinking: null });
    expect(loaded.nodes.find(node => node.kind === "model")).not.toHaveProperty("request.settings");
    await reopened.conversations.execute({ type: "continue", taskId: initial.taskId, agentId: initial.agentId, modelId: command.modelId, thinking: null });
    await settled(reopened); expect(seen.at(-1)).toBe("Current instructions");
    const check = new DatabaseSync(join(root, "db", "weft.sqlite"), { readOnly: true });
    try {
      expect(check.prepare("SELECT payload FROM events WHERE type = 'conversation_event' AND json_extract(payload, '$.mutation.type') = 'created'").get()?.payload).toBe(legacyPayload);
    } finally { check.close(); }
  });
  it("无模型回复的准备失败仍向前端提供错误与续接选择", async () => {
    let prepared = 0;
    const { service, command } = await setup({ version: adapter.version, prepare: input => {
      if (++prepared === 2) throw new ModelFailure("prepare_failed", "The request could not be prepared.");
      return adapter.prepare(input);
    } });
    const accepted = await service.conversations.execute(command); await settled(service);
    const current = await service.conversations.execute({ type: "read", taskId: accepted.taskId, agentId: accepted.agentId });
    expect(current.nodes.some(node => node.kind === "model")).toBe(false);
    expect(current.activeTurnId).toBeNull();
    expect(current.selection).toEqual({ agentConfigurationId: "worker", modelId: command.modelId, thinking: null });
    expect(current.lastError).toEqual({ code: "prepare_failed", message: "The request could not be prepared." });
  });

  it("首次提交原子保存且并发重试不重复创建；关闭重开重建相同消息", async () => {
    const { service, root, command } = await setup();
    const [a, b] = await Promise.all([service.conversations.execute(command), service.conversations.execute(command)]);
    expect(a.taskId).toBe(b.taskId); expect(a.agentId).toBe(b.agentId);
    expect(a.selection).toEqual({ agentConfigurationId: "worker", modelId: command.modelId, thinking: null });
    expect(a.agentName).toBeTruthy();
    await settled(service);
    const snapshot = await service.conversations.execute({ type: "read", taskId: a.taskId, agentId: a.agentId });
    expect(snapshot.nodes.map(n => n.kind)).toEqual(["input", "extension", "model"]);
    expect(service.execute({ type: "workspace.read" }).tasks).toHaveLength(1);
    await expect(service.conversations.execute({ ...command, text: "Different input" })).rejects.toThrow("different input");
    await service.close(); services.delete(service);
    const reopened = new ApplicationService(root, { adapterFactory: () => adapter }); services.add(reopened);
    expect(await reopened.conversations.execute({ type: "read", taskId: a.taskId, agentId: a.agentId })).toEqual(snapshot);
    expect(await reopened.conversations.execute(command)).toEqual(snapshot);
  });

  it("无效配置不创建任务；IPC 错误只返回明确分类，未知数据不通过 schema", async () => {
    const { service, command } = await setup();
    const response = await dispatchConversation(service, { kind: "conversation.request", version: conversationVersion, id: randomUUID(), command: { ...command, modelId: "missing" } });
    expect(response).toMatchObject({ result: { ok: false, error: { code: "unavailable" } } });
    expect(service.execute({ type: "workspace.read" }).tasks).toHaveLength(0);
    expect(await dispatchConversation(service, { kind: "conversation.request", version: conversationVersion, id: randomUUID(), command: { ...command, apiKey: "not-allowed" } })).toBeNull();
  });

  it("选择旧完整节点后追加新路径，原模型分支仍然保留", async () => {
    const { service, command } = await setup();
    const initial = await service.conversations.execute(command); await settled(service);
    const first = await service.conversations.execute({ type: "read", taskId: initial.taskId, agentId: initial.agentId });
    await service.conversations.execute({ type: "select", taskId: first.taskId, agentId: first.agentId, nodeId: first.nodes[0]!.id });
    await service.conversations.execute({ type: "submit", submissionId: randomUUID(), taskId: first.taskId, agentId: first.agentId,
      text: "New branch", modelId: command.modelId, thinking: null });
    await settled(service);
    const branched = await service.conversations.execute({ type: "read", taskId: first.taskId, agentId: first.agentId });
    expect(branched.nodes).toHaveLength(6);
    expect(branched.nodes[2]).toEqual(first.nodes[2]);
    expect(branched.nodes[3]!.parentId).toBe(first.nodes[0]!.id);
    expect(branched.activeTurnId).toBeNull();
  });

  it("跨模型不兼容在提交前拒绝，不消耗输入幂等身份", async () => {
    const { service, command } = await setup();
    const initial = await service.conversations.execute(command); await settled(service);
    const { snapshot: config } = await service.configuration.execute({ type: "read" });
    const { id: _id, revision: _revision, ...original } = config.models.find(m => m.id === command.modelId)!;
    const { savedId } = await service.configuration.execute({ type: "model.save", id: null, value: { ...original, modelId: "other-model" } });
    const count = service.history.eventCount();
    const submit = { type: "submit" as const, submissionId: randomUUID(), taskId: initial.taskId, agentId: initial.agentId, text: "Next input", modelId: savedId!, thinking: null };
    await expect(service.conversations.execute(submit)).rejects.toThrow("Cross-model");
    expect(service.history.eventCount()).toBe(count);
    await service.conversations.execute({ ...submit, modelId: command.modelId }); await settled(service);
    const current = await service.conversations.execute({ type: "read", taskId: initial.taskId, agentId: initial.agentId });
    expect(current.nodes.filter(n => n.kind === "input")).toHaveLength(2);
  });
});
