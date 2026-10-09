import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setImmediate } from "node:timers/promises";
import { afterEach, describe, expect, it } from "vitest";
import { ApplicationService } from "./service.ts";
import { ModelFailure, type ModelAdapter, type ModelEvent, type ModelInput } from "../model/contract.ts";
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
  it("块先保存，迟到计量随后可见；重开保留块身份、终态和选择审计", async () => {
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const saved = new Promise<void>(resolve => { entered = resolve; });
    const usage = { input: 12, output: 3, total: 15, reasoning: 1, cacheRead: 4, cacheWrite: 0 };
    const model: ModelAdapter = { version: "ai-sdk-v7/2", prepare: () => ({ async *stream() {
      yield* reply("Saved text").slice(0, -1);
      entered();
      await gate;
      yield { type: "finish", reason: "stop", rawFinishReason: "end_turn", responseId: "provider-response", usage };
    } }) };
    const { service, root, start } = await setup(model);
    const first = await service.sessions.execute(start);
    await saved;
    const before = service.sessions.snapshot(first.sessionId);
    const block = before.nodes.find(node => node.kind === "text")!;
    release();
    expect(block).toMatchObject({ usage: null, finishReason: null });
    expect(before.nodes.map(node => node.kind)).toEqual(["event", "message", "text"]);
    await settled(service);
    const after = service.sessions.snapshot(first.sessionId);
    expect(after.seq).toBe(before.seq);
    expect(after.cursor).toBe(before.cursor);
    expect(after.nodes.find(node => node.id === block.id)).toMatchObject({
      ...block, usage, finishReason: "stop", rawFinishReason: "end_turn", providerResponseId: "provider-response",
    });
    const input = after.nodes.find(node => node.kind === "message")!;
    expect(after.nodes.find(node => node.id === block.id)).toMatchObject({ requestParentId: input.id });
    await service.sessions.execute({ type: "select", sessionId: first.sessionId, nodeId: input.id });
    await service.close(); services.delete(service);
    const reopened = new ApplicationService(root); services.add(reopened);
    expect(reopened.sessions.snapshot(first.sessionId).nodes).toEqual(after.nodes);
    expect(reopened.sessions.tree.cursorSelections(first.sessionId)).toEqual([expect.objectContaining({
      fromId: block.id, requestedId: input.id, selectedId: input.id, reason: "user",
    })]);
  });

  it("无块响应保存诊断与已报告的计量，不伪造文本或计量节点", async () => {
    const model: ModelAdapter = { version: "ai-sdk-v7/2", prepare: () => ({ async *stream() {
      yield { type: "finish", reason: "stop", responseId: "empty-response",
        usage: { input: 2, output: 0, total: 2, reasoning: null, cacheRead: null, cacheWrite: null } };
    } }) };
    const { service, start } = await setup(model);
    const first = await service.sessions.execute(start);
    await settled(service);
    const nodes = service.sessions.snapshot(first.sessionId).nodes;
    expect(nodes.map(node => node.kind)).toEqual(["event", "message", "notice"]);
    expect(nodes.at(-1)).toMatchObject({ code: "empty_response", response: { providerResponseId: "empty-response", usage: { total: 2 } } });
  });

  it("工具结果保存实现版本与当次数据；资源移除、文件改变和重开不影响历史", async () => {
    let resourceId = "";
    let calls = 0;
    const model: ModelAdapter = { version: "ai-sdk-v7/2", prepare: () => ({ async *stream() {
      if (++calls === 2) {
        yield { type: "part.start", part: { id: "c", kind: "toolcall", callId: "read-file", name: "resource_call" } };
        yield { type: "part.end", partId: "c", arguments: { resource_id: resourceId, tool: "read", target: { path: "a.txt" }, args: {} } };
        yield { type: "finish", reason: "tool-calls", usage: null };
      } else yield* reply();
    } }) };
    const { service, root, start } = await setup(model);
    writeFileSync(join(root, "a.txt"), "original");
    const first = await service.sessions.execute(start); await settled(service);
    const created = service.execute({ type: "directory.add", session_id: first.sessionId, path: root, position: { x: 0, y: 0 } });
    const directory = created.session!.objects.find(object => object.kind === "directory")!;
    expect(directory.presentation).toEqual({ contract: { id: "weft.directory.card", version: 1 }, data: { path: root } });
    resourceId = directory.id;
    const agentId = first.agents[0]!.id;
    service.execute({ type: "link.set", session_id: first.sessionId, agent_id: agentId, resource_id: resourceId, linked: true });
    await service.sessions.execute({ type: "continue", sessionId: first.sessionId, agentId }); await settled(service);
    const saved = service.sessions.tree.nodes(first.sessionId).find(node => node.kind === "toolcall");
    expect(saved).toMatchObject({ outcome: { kind: "succeeded", implementation: { id: "weft.directory.read", version: 1 },
      model: { path: "a.txt", text: "original" }, data: { path: "a.txt", text: "original" } } });
    writeFileSync(join(root, "a.txt"), "changed");
    service.execute({ type: "object.remove", session_id: first.sessionId, object_id: resourceId });
    await service.close(); services.delete(service);
    const reopened = new ApplicationService(root); services.add(reopened);
    expect(reopened.sessions.tree.nodes(first.sessionId).find(node => node.kind === "toolcall")).toEqual(saved);
  });

  it("首次提交原子创建会话与代理；重复提交幂等，重开读取相同树", async () => {
    const { service, root, start } = await setup();
    const [a, b] = await Promise.all([service.sessions.execute(start), service.sessions.execute(start)]);
    expect(a.sessionId).toBe(b.sessionId);
    await settled(service);
    const snap = await service.sessions.execute({ type: "read", sessionId: a.sessionId });
    expect(snap.nodes.map(n => n.kind)).toEqual(["event", "message", "text"]);
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
    const running = await service.sessions.execute({ type: "read", sessionId: s.sessionId });
    expect(running.live).toEqual([expect.objectContaining({ kind: "text", text: "Half" })]);
    expect(running.nodes.some(node => node.kind === "text")).toBe(false);
    await service.sessions.execute({ type: "cancel", sessionId: s.sessionId });
    await settled(service);
    const snap = await service.sessions.execute({ type: "read", sessionId: s.sessionId });
    const half = snap.nodes.find(x => x.kind === "text");
    expect(half).toMatchObject({ text: "Half", complete: false });
    expect(snap.cursor).not.toBe(half!.id);
    expect(snap.live).toEqual([]);
  });

  it("回到代理创建前时快照不暴露旁支代理，也不能向其提交或配置", async () => {
    const { service, start } = await setup();
    const first = await service.sessions.execute(start);
    await settled(service);
    const agentId = first.agents[0]!.id;
    const selected = await service.sessions.execute({ type: "select", sessionId: first.sessionId, nodeId: null });
    expect(selected.agents).toEqual([]);
    await expect(service.sessions.execute({ type: "continue", sessionId: first.sessionId, agentId })).rejects.toThrow("current session path");
    await expect(service.sessions.execute({ type: "configure", sessionId: first.sessionId, agentId,
      selection: first.agents[0]!.selection! })).rejects.toThrow("current session path");
    expect(service.sessions.tree.cursor(first.sessionId)).toBeNull();
  });

  it("异常流的未结束调用只留档，不执行且不发起后续请求", async () => {
    let requests = 0;
    const broken: ModelAdapter = { version: "ai-sdk-v7/2", prepare: () => ({ async *stream() {
      requests++;
      yield { type: "part.start", part: { id: "c", kind: "toolcall", callId: "c1", name: "resource_list" } };
      yield { type: "part.delta", partId: "c", delta: "{}" };
      yield { type: "finish", reason: "tool-calls", usage: null };
    } }) };
    const { service, start } = await setup(broken);
    const first = await service.sessions.execute(start);
    await settled(service);
    expect(requests).toBe(1);
    const nodes = service.sessions.tree.nodes(first.sessionId);
    expect(nodes.find(n => n.kind === "toolcall")).toMatchObject({ complete: false, outcome: null });
    expect(nodes.at(-1)).toMatchObject({ kind: "notice", code: "incomplete" });
  });

  it("continue 自动退到 thinking 前的合法位置，原记录仍保留", async () => {
    let requests = 0;
    const inputs: string[][] = [];
    const model: ModelAdapter = { version: "ai-sdk-v7/2", prepare: input => {
      inputs.push(input.messages.map(item => item.kind));
      return { async *stream() {
        if (++requests === 1) {
          yield { type: "part.start", part: { id: "t", kind: "thinking" } } as const;
          yield { type: "part.end", partId: "t" } as const;
          yield { type: "finish", reason: "length", usage: null } as const;
        } else yield* reply();
      } };
    } };
    const { service, start } = await setup(model);
    const first = await service.sessions.execute(start);
    await settled(service);
    const before = service.sessions.tree.nodes(first.sessionId);
    await service.sessions.execute({ type: "continue", sessionId: first.sessionId, agentId: first.agents[0]!.id });
    await settled(service);
    expect(inputs.slice(-2)).toEqual([["input"], ["input"]]);
    expect(service.sessions.tree.nodes(first.sessionId).slice(0, before.length)).toEqual(before);
    expect(service.sessions.tree.path(first.sessionId).map(n => n.kind)).toEqual(["event", "message", "text"]);
    expect(service.sessions.tree.cursorSelections(first.sessionId)).toEqual([expect.objectContaining({
      fromId: before.at(-1)!.id, requestedId: before.at(-1)!.id,
      selectedId: before.find(node => node.kind === "message")!.id, reason: "continuation",
    })]);
  });

  it("运行中修改代理配置在下一模型请求生效", async () => {
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const started = new Promise<void>(resolve => { entered = resolve; });
    const systems: string[] = [];
    let requests = 0;
    const model: ModelAdapter = { version: "ai-sdk-v7/2", prepare: input => {
      systems.push(JSON.stringify(input.system));
      return { async *stream() {
        if (++requests === 1) {
          entered();
          await gate;
          yield { type: "part.start", part: { id: "c", kind: "toolcall", callId: "c1", name: "resource_list" } } as const;
          yield { type: "part.end", partId: "c", arguments: {} } as const;
          yield { type: "finish", reason: "tool-calls", usage: null } as const;
        } else yield* reply();
      } };
    } };
    const { service, start } = await setup(model);
    await service.sessions.execute(start);
    await started;
    try {
      await service.configuration.execute({ type: "agent.save", id: "worker", value: { systemPrompt: "Updated request instructions." } });
    } finally { release(); }
    await settled(service);
    expect(requests).toBe(2);
    expect(systems[1]).not.toContain("Updated request instructions.");
    expect(systems.at(-1)).toContain("Updated request instructions.");
  });

  it.each([false, true])("请求期间断开资源（首块已保存=%s）：本次授权固定，下一请求保留前缀并取用新状态", async firstBlockSaved => {
    let resourceId = "";
    let requests = 0;
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const started = new Promise<void>(resolve => { entered = resolve; });
    const inputs: ModelInput[] = [];
    const model: ModelAdapter = { version: "ai-sdk-v7/2", prepare: input => {
      inputs.push(input);
      return { async *stream() {
        const request = ++requests;
        if (request === 2) {
          if (firstBlockSaved) {
            yield { type: "part.start", part: { id: "t", kind: "text" } };
            yield { type: "part.delta", partId: "t", delta: "Reading now" };
            yield { type: "part.end", partId: "t" };
          }
          entered();
          await gate;
        }
        if (request === 2 || request === 3) {
          yield { type: "part.start", part: { id: "c", kind: "toolcall", callId: `call-${request}`, name: "resource_call" } };
          yield { type: "part.end", partId: "c", arguments: { resource_id: resourceId, tool: "read", args: {} } };
          yield { type: "finish", reason: "tool-calls", usage: null };
        } else yield* reply();
      } };
    } };
    const { service, start } = await setup(model);
    const first = await service.sessions.execute(start);
    await settled(service);
    const sessionId = first.sessionId;
    const agentId = first.agents[0]!.id;
    const created = service.execute({ type: "note.create", session_id: sessionId, title: "Note", content: "content", position: { x: 0, y: 0 } });
    resourceId = created.session!.objects.find(object => object.kind === "note")!.id;
    service.execute({ type: "link.set", session_id: sessionId, agent_id: agentId, resource_id: resourceId, linked: true });
    await service.sessions.execute({ type: "continue", sessionId, agentId });
    await started;
    try {
      service.execute({ type: "link.set", session_id: sessionId, agent_id: agentId, resource_id: resourceId, linked: false });
    } finally { release(); }
    await settled(service);
    expect(requests).toBe(4);
    const nextInput = inputs.at(-2)!;
    const sent = sdkMessages(inputs.at(-3)!);
    expect(sdkMessages(nextInput).slice(0, sent.length)).toEqual(sent);
    expect(nextInput.messages.slice(-3).map(item => item.kind)).toEqual(["output", "result", "context"]);
    expect(nextInput.messages.at(-1)).toMatchObject({ kind: "context", text: expect.stringContaining("no longer linked") });
    expect(service.sessions.tree.nodes(sessionId).filter(node => node.kind === "toolcall").map(node => node.outcome?.kind))
      .toEqual(["succeeded", "rejected"]);
  });
});
