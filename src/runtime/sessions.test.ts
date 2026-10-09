import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setImmediate } from "node:timers/promises";
import { afterEach, describe, expect, it } from "vitest";
import { ApplicationService } from "./service.ts";
import { ModelFailure, type ModelAdapter, type ModelEvent } from "../model/contract.ts";
import { sdkMessages } from "../model/ai-sdk.ts";
import type { SessionCommand } from "../shared/session.ts";

const roots: string[] = [];
const services = new Set<ApplicationService>();
afterEach(async () => { for (const s of services) await s.close(); services.clear(); for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true }); });

function reply(textValue = "Hello"): ModelEvent[] {
  return [{ type: "part.start", part: { id: "t", kind: "text" } }, { type: "part.delta", partId: "t", delta: textValue },
    { type: "part.end", partId: "t" }, { type: "finish", reason: "stop", usage: null }];
}
const adapter = (prepare?: () => void): ModelAdapter => ({ version: "ai-sdk-v7/2", prepare: input => {
  sdkMessages(input); prepare?.();
  return { async *stream() { yield* reply(); } };
} });
async function setup(model: ModelAdapter = adapter()) {
  const root = mkdtempSync(join(tmpdir(), "weft-session-")); roots.push(root);
  const service = new ApplicationService(root, { adapterFactory: () => model }); services.add(service);
  const { savedId: providerId } = await service.configuration.execute({ type: "provider.save", id: null,
    value: { name: "Test", protocol: "openai-responses", baseUrl: "https://example.invalid/v1", enabled: true, auth: "none" }, credential: { action: "keep" } });
  const { savedId: modelId } = await service.configuration.execute({ type: "model.save", id: null,
    value: { providerId: providerId!, name: "Test", modelId: "test", enabled: true, contextWindow: null,
      capabilities: { tools: true, reasoning: false, images: false }, generation: { temperature: null, topP: null, maxOutputTokens: null } } });
  const start: Extract<SessionCommand, { type: "start" }> = { type: "start", submissionId: randomUUID(), agentConfigurationId: "worker", modelId: modelId!, thinking: null, text: "First" };
  return { service, root, start };
}
async function settled(service: ApplicationService) {
  for (let i = 0; i < 200 && service.sessions.running; i++) await setImmediate();
  expect(service.sessions.running).toBe(false);
}

describe("会话运行时", () => {
  it("首次提交原子创建会话与代理；重复提交幂等，重开读取相同树", async () => {
    const { service, root, start } = await setup();
    const [a, b] = await Promise.all([service.sessions.execute(start), service.sessions.execute(start)]);
    expect(a.sessionId).toBe(b.sessionId);
    await settled(service);
    const snap = await service.sessions.execute({ type: "read", sessionId: a.sessionId });
    expect(snap.nodes.map(n => n.kind)).toEqual(["event", "message", "text", "response_end"]);
    expect(snap.agents).toHaveLength(1);
    await expect(service.sessions.execute({ ...start, text: "Other" })).rejects.toThrow("different input");
    await service.close(); services.delete(service);
    const reopened = new ApplicationService(root, { adapterFactory: () => adapter() }); services.add(reopened);
    expect((await reopened.sessions.execute({ type: "read", sessionId: a.sessionId })).nodes).toEqual(snap.nodes);
  });

  it("选择旧位置后发送形成新分支，旧分支保留；运行中不能选择", async () => {
    let release!: () => void;
    const gate = new Promise<void>(r => { release = r; });
    let calls = 0;
    const slow: ModelAdapter = { version: "ai-sdk-v7/2", prepare: () => ({ async *stream() { if (++calls === 2) await gate; yield* reply(); } }) };
    const { service, start } = await setup(slow);
    const first = await service.sessions.execute(start); await settled(service);
    const before = await service.sessions.execute({ type: "read", sessionId: first.sessionId });
    const agentId = before.agents[0]!.id;
    const message = before.nodes.find(n => n.kind === "message")!;
    await service.sessions.execute({ type: "select", sessionId: first.sessionId, nodeId: message.id });
    await service.sessions.execute({ type: "submit", submissionId: randomUUID(), sessionId: first.sessionId, agentId, text: "Branch" });
    await expect(service.sessions.execute({ type: "select", sessionId: first.sessionId, nodeId: message.id })).rejects.toThrow("running");
    release(); await settled(service);
    const after = await service.sessions.execute({ type: "read", sessionId: first.sessionId });
    expect(after.nodes.slice(0, before.nodes.length)).toEqual(before.nodes);
    expect(after.nodes.find(n => n.kind === "message" && n.text === "Branch")!.parentId).toBe(message.id);
  });

  it("请求在产生块之前失败时记录错误级通知，不伪造回复", async () => {
    let n = 0;
    const { service, start } = await setup(adapter(() => { if (++n === 2) throw new ModelFailure("prepare_failed", "Cannot prepare."); }));
    const s = await service.sessions.execute(start); await settled(service);
    const snap = await service.sessions.execute({ type: "read", sessionId: s.sessionId });
    expect(snap.nodes.some(x => x.kind === "text")).toBe(false);
    expect(snap.nodes.at(-1)).toMatchObject({ kind: "notice", level: "error", code: "prepare_failed" });
  });

  it("取消时已收到的部分正文以不完整块留档，不进入可续接路径", async () => {
    let markStreamed!: () => void;
    const streamed = { promise: new Promise<void>(r => { markStreamed = r; }) };
    const partial: ModelAdapter = { version: "ai-sdk-v7/2", prepare: () => ({ async *stream(signal) {
      yield { type: "part.start", part: { id: "t", kind: "text" } } as const;
      yield { type: "part.delta", partId: "t", delta: "Half" } as const;
      markStreamed();
      await new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason)));
    } }) };
    const { service, start } = await setup(partial);
    const s = await service.sessions.execute(start);
    await streamed.promise;
    await service.sessions.execute({ type: "cancel", sessionId: s.sessionId });
    await settled(service);
    const snap = await service.sessions.execute({ type: "read", sessionId: s.sessionId });
    const half = snap.nodes.find(x => x.kind === "text");
    expect(half).toMatchObject({ text: "Half", complete: false });
    expect(snap.cursor).not.toBe(half!.id);
  });
});
