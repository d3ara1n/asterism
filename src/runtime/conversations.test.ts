import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setImmediate } from "node:timers/promises";
import { afterEach, describe, expect, it } from "vitest";
import { ApplicationService } from "./service.ts";
import type { ModelAdapter } from "../model/contract.ts";
import type { ConversationCommand } from "../shared/conversation.ts";
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
async function setup() {
  const root = mkdtempSync(join(tmpdir(), "weft-conversation-")); roots.push(root);
  const service = new ApplicationService(root, { adapterFactory: () => adapter }); services.add(service);
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
  it("首次提交原子保存且并发重试不重复创建；关闭重开重建相同消息", async () => {
    const { service, root, command } = await setup();
    const [a, b] = await Promise.all([service.conversations.execute(command), service.conversations.execute(command)]);
    expect(a.taskId).toBe(b.taskId); expect(a.agentId).toBe(b.agentId);
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
    const response = await dispatchConversation(service, { kind: "conversation.request", version: 1, id: randomUUID(), command: { ...command, modelId: "missing" } });
    expect(response).toMatchObject({ result: { ok: false, error: { code: "unavailable" } } });
    expect(service.execute({ type: "workspace.read" }).tasks).toHaveLength(0);
    expect(await dispatchConversation(service, { kind: "conversation.request", version: 1, id: randomUUID(), command: { ...command, apiKey: "not-allowed" } })).toBeNull();
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
