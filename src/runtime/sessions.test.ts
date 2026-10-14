import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApplicationService } from "./service.ts";
import { ModelFailure, type ModelAdapter, type ModelEvent, type ModelInput } from "../model/contract.ts";
import { sdkMessages } from "../model/ai-sdk.ts";
import { type SessionChanged, type SessionCommand, type SessionMutation } from "../shared/session.ts";
import { flat } from "../session/test-nodes.ts";
import type { AgentSelection, Json } from "../shared/model.ts";
import * as runtimeModules from "../modules/runtime.ts";
import { z } from "zod";
import { defineData, ResourceStatusChanged, type ResourceStatus } from "@atelier/sdk/contracts";
import { defineImplementation, defineTool } from "@atelier/sdk/contracts";
import { Directory } from "../modules/filesystem/contract.ts";
import { Note } from "../modules/notes/contract.ts";
import { implement } from "../tools/testing.ts";
import { ToolRegistry } from "../tools/registry.ts";
import { foldWorkbench } from "../session/fold.ts";

const roots: string[] = [];
type Snap = { workbench: { objects: { id: string; kind: string; presentation: { data: unknown } }[] } };
const agentOf = (snap: Snap) => snap.workbench.objects.find(o => o.kind === "atelier.core/agent")!.id;
const selectionOf = (snap: Snap) => (snap.workbench.objects.find(o => o.kind === "atelier.core/agent")!.presentation.data as { selection: AgentSelection }).selection;
import { resourceCall, modelInputText, type ModelInputPart } from "@atelier/sdk/contracts";
import { agentAction, agentCommandSchema, startAgentContentTarget, SubmitAgentInput } from "../modules/agent/contract.ts";
const agentCommand = (sessionId: string, objectId: string, command: Json): SessionMutation => ({ type: "resource.command", sessionId, objectId, command: resourceCall(agentAction(agentCommandSchema.parse(command)), agentCommandSchema.parse(command)) });
const services = new Set<ApplicationService>();
afterEach(async () => { vi.useRealTimers(); for (const s of services) await s.close(); services.clear(); vi.restoreAllMocks(); for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true }); });

function reply(textValue = "Hello"): ModelEvent[] {
  return [{ type: "part.start", part: { id: "t", kind: "text" } }, { type: "part.delta", partId: "t", delta: textValue },
    { type: "part.end", partId: "t" }, { type: "finish", reason: "stop", usage: null }];
}
const adapter = (prepare?: () => void): ModelAdapter => ({ validate() {}, version: "ai-sdk-v7/3", prepare: input => {
  sdkMessages(input); prepare?.();
  return { async *stream() { yield* reply(); } };
} });
async function setup(model: ModelAdapter = adapter(), onSessionChanged?: (event: SessionChanged) => void) {
  const root = mkdtempSync(join(tmpdir(), "core-session-")); roots.push(root);
  const service = new ApplicationService(root, { adapterFactory: () => model, onSessionChanged }); services.add(service);
  const { savedId: providerId } = await service.configuration.execute({ type: "provider.save", id: null,
    value: { id: "test", name: "Test", protocol: "openai-responses", baseUrl: "https://example.invalid/v1", enabled: true, auth: "none" }, credential: { action: "keep" } });
  const { savedId: modelId } = await service.configuration.execute({ type: "model.save", id: null,
    value: { providerId: providerId!, name: "Test", modelId: "test", enabled: true, contextWindow: null,
      capabilities: { tools: true, reasoning: false }, generation: { temperature: null, topP: null, maxOutputTokens: null } } });
  const start: Extract<SessionCommand, { type: "start" }> = { type: "start", submissionId: randomUUID(), agent: "worker", model: modelId!, thinking: null, parts: [{ kind: "text", text: "First" }] };
  return { service, root, start };
}
async function execute(service: ApplicationService, command: SessionMutation | { type: "read"; sessionId: string }) {
  const reply = await service.sessions.execute(command);
  return reply.kind === "view" ? reply.snapshot : service.sessions.snapshot(reply.sessionId);
}
async function settled(service: ApplicationService) {
  await vi.waitFor(() => { expect(service.sessions.running).toBe(false); }, { timeout: 2000, interval: 5 });
}
function resourceStatuses(service: ApplicationService) {
  const states: ResourceStatus["status"][] = [];
  service.sessions.events.listen(ResourceStatusChanged, {}, packet => { states.push((packet.event.data as ResourceStatus).status); });
  return states;
}

describe("会话运行时", () => {
  // 预期来自时间线契约：终态属于块，正常工具续轮不得生成用户未选择的分支。
  it("首页工具调用后自动续接保持单一路径，回溯到工具块即包含结果与一次计量", async () => {
    let requests = 0;
    const usage = { input: 5, output: 2, total: 7, reasoning: null, cacheRead: null, cacheWrite: null };
    const model: ModelAdapter = { validate() {}, version: "test/1", prepare: () => ({ async *stream() {
      if (++requests === 1) {
        yield { type: "part.start", part: { id: "list", kind: "toolcall", callId: "list", name: "resource_list" } };
        yield { type: "part.end", partId: "list", arguments: {} };
        yield { type: "finish", reason: "tool-calls", usage };
      } else {
        yield* reply("No resources are linked.").slice(0, -1);
        yield { type: "finish", reason: "stop", usage };
      }
    } }) };
    const { service, start } = await setup(model);
    // 状态对应整次代理执行，工具续轮期间不能提前标记 completed。
    const states = resourceStatuses(service);
    const first = await execute(service, start);
    await settled(service);
    expect(states).toEqual(["running", "completed"]);
    expect(requests).toBe(2);
    const snapshot = service.sessions.snapshot(first.sessionId);
    expect(service.sessions.tree.timeline(first.sessionId)).toEqual(snapshot.nodes);
    expect(service.sessions.tree.cursorSelections(first.sessionId)).toEqual([]);
    const blocks = snapshot.nodes.map(flat).filter(node => node.kind === "toolcall" || node.kind === "text");
    expect(blocks.map(block => block.kind)).toEqual(["toolcall", "text"]);
    expect(blocks[1]!.parentId).toBe(blocks[0]!.id);
    expect(blocks.reduce((sum, block) => sum + block.completion.usage.total, 0)).toBe(14);
    await service.sessions.execute({ type: "select", sessionId: first.sessionId, nodeId: blocks[0]!.id });
    expect(service.sessions.tree.timeline(first.sessionId).map(flat).at(-1)).toMatchObject({
      kind: "toolcall", complete: true, outcome: { kind: "succeeded", data: { resources: [] } },
      completion: { usage, finishReason: "tool-calls" },
    });
  });

  it("文件输入先提交到时间线，图文顺序保留且已受理重试不依赖草稿", async () => {
    const inputs: ModelInput[] = [];
    let currentService!: ApplicationService;
    const model: ModelAdapter = { version: "ai-sdk-v7/3", validate() {}, prepare(input) {
      expect(currentService.sessions.tree.list().some(session => currentService.sessions.tree.timeline(session.id).map(flat).some(node => node.kind === "message"))).toBe(true);
      inputs.push(input); return { async *stream() { yield* reply(); } };
    } };
    const { service, start } = await setup(model); currentService = service;
    const draft = service.sessions.openContentInput(startAgentContentTarget), png = new Uint8Array([1, 2, 3]);
    const file = await service.sessions.content.writer({ scope: draft }).stage(png);
    const input = { ...start, parts: [{ kind: "file" as const, file, mediaType: "image/png", filename: "first.png" }], contentScopeId: draft.id };
    const first = await execute(service, input); await settled(service); await draft.close();
    expect((await execute(service, { ...input, contentScopeId: undefined })).sessionId).toBe(first.sessionId);
    expect(first.nodes.map(flat).find(node => node.kind === "message")).toMatchObject({ parts: input.parts });
    const objectId = agentOf(first), next = service.sessions.openContentInput({ sessionId: first.sessionId, objectId,
      contractId: SubmitAgentInput.id, resourceKind: SubmitAgentInput.resource.kind });
    const other = await service.sessions.content.writer({ scope: next }).stage(new Uint8Array([4, 5, 6]));
    const parts: ModelInputPart[] = [{ kind: "text", text: "Compare" }, { kind: "file", file: other, mediaType: "image/webp" }, { kind: "text", text: "with the screenshot" }];
    await service.sessions.execute({ type: "resource.command", sessionId: first.sessionId, objectId,
      command: resourceCall(SubmitAgentInput, { type: "submit", submissionId: randomUUID(), parts }), contentScopeId: next.id });
    await settled(service); await next.close();
    expect(service.sessions.tree.nodes(first.sessionId).map(flat).filter(node => node.kind === "message").at(-1)).toMatchObject({ parts });
    expect(inputs.at(-1)!.messages.at(-1)).toMatchObject({ kind: "input", parts: [
      { kind: "text", text: "Compare" }, { kind: "file", mediaType: "image/webp" }, { kind: "text", text: "with the screenshot" },
    ] });
  });

  it("首页准备失败不创建会话、不消耗文件草稿；修正输入后可以重试", async () => {
    const { service, start } = await setup();
    const draft = service.sessions.openContentInput(startAgentContentTarget);
    const file = await service.sessions.content.writer({ scope: draft }).stage(new Uint8Array([1]));
    const input = { ...start, contentScopeId: draft.id, parts: [{ kind: "file" as const, file, mediaType: "image/png" }] };
    await expect(service.sessions.execute({ ...input, agent: "missing" })).rejects.toThrow();
    expect(service.sessions.tree.list()).toEqual([]);
    expect(await service.sessions.content.reader({ scope: draft }).read(file)).toEqual(new Uint8Array([1]));
    const { revision: _revision, ...configured } = service.configuration.current().models[0]!;
    await service.configuration.execute({ type: "model.save", id: start.model,
      value: { ...configured, capabilities: { ...configured.capabilities } } });
    await service.sessions.execute(input); await settled(service);
    expect(service.sessions.tree.list()).toHaveLength(1);
  });
  it("同一代理相同 submission 的并发重试均受理且只保存一条输入", async () => {
    const { service, start } = await setup();
    const first = await execute(service, start); await settled(service);
    const command = agentCommand(first.sessionId, agentOf(first), { type: "submit", submissionId: randomUUID(), parts: [{ kind: "text", text: "Concurrent retry" }] });
    const receipts = await Promise.all([service.sessions.execute(command), service.sessions.execute(command)]);
    expect(receipts).toEqual([{ kind: "accepted", sessionId: first.sessionId }, { kind: "accepted", sessionId: first.sessionId }]);
    await settled(service);
    expect(service.sessions.tree.nodes(first.sessionId).map(flat).filter(node => node.kind === "message" && modelInputText(node.parts) === "Concurrent retry")).toHaveLength(1);
  });
  it("重建会话数据库保留全局模型配置与用户覆盖", async () => {
    const { service, root, start } = await setup();
    await execute(service, start); await settled(service);
    await service.configuration.execute({ type: "agent.save", id: "worker", value: { systemPrompt: "Persistent instructions" } });
    await service.close(); services.delete(service);
    rmSync(join(root, "db"), { recursive: true });
    const reopened = new ApplicationService(root); services.add(reopened);
    expect(reopened.execute({ type: "workspace.read" }).sessions).toEqual([]);
    const { snapshot } = await reopened.configuration.execute({ type: "read" });
    expect(snapshot.models[0] && `${snapshot.models[0].providerId}/${snapshot.models[0].modelId}`).toBe(start.model);
    expect(snapshot.providers).toHaveLength(1);
    expect(snapshot.overrides.agents.worker).toEqual({ systemPrompt: "Persistent instructions" });
  });
  it("笔记写入只更新当前正文和视图，游标选择与重开均读取当前值", async () => {
    let tools!: ToolRegistry;
    const original = runtimeModules.createModules;
    vi.spyOn(runtimeModules, "createModules").mockImplementation(services => {
      const modules = original(services); tools = modules.tools; return modules;
    });
    const { service, root, start } = await setup();
    const first = await execute(service, start); await settled(service);
    const sessionId = first.sessionId;
    const created = await execute(service, { type: "resource.create", sessionId, kind: "atelier.core/note", creation: { id: "atelier.core/note.create" },
      input: { title: "Notebook", content: "original" }, position: { x: 0, y: 0 } });
    const note = foldWorkbench(created.nodes.map(flat)).objects.find(object => object.kind === "atelier.core/note")!;
    const before = service.sessions.tree.nodes(sessionId), cursor = service.sessions.tree.cursor(sessionId);
    const prepared = tools.match(note).find(tool => tool.tool.name === "write")!.prepare(note, null, { content: "latest" });
    if (!("execute" in prepared)) throw new Error("Expected a write invocation.");
    expect(await prepared.execute(new AbortController().signal)).toMatchObject({ kind: "succeeded" });
    expect(service.sessions.snapshot(sessionId).revision).toBeGreaterThan(created.revision);
    expect(service.sessions.tree.nodes(sessionId)).toEqual(before);
    expect(service.sessions.tree.cursor(sessionId)).toBe(cursor);
    await service.sessions.execute({ type: "select", sessionId, nodeId: cursor });
    expect(service.sessions.snapshot(sessionId).workbench.objects.find(object => object.id === note.id)?.presentation.data).toEqual({ text: "latest" });
    await service.close(); services.delete(service);
    const reopened = new ApplicationService(root); services.add(reopened);
    expect(reopened.sessions.snapshot(sessionId).workbench.objects.find(object => object.id === note.id)?.presentation.data).toEqual({ text: "latest" });
  });

  it("游标重建存在性，布局跨回溯和重开保留且不追加历史", async () => {
    const { service, root, start } = await setup();
    const first = await execute(service, start); await settled(service);
    const sessionId = first.sessionId;
    const created = await execute(service, { type: "resource.create", sessionId, kind: "atelier.core/note", creation: { id: "atelier.core/note.create" },
      input: { title: "Saved note", content: "original" }, position: { x: 10, y: 20 } });
    const note = created.workbench.objects.find(object => object.kind === "atelier.core/note")!, nodeId = created.cursor!;
    expect(await service.sessions.execute({ type: "object.remove", sessionId, objectId: note.id })).toEqual({ kind: "accepted", sessionId });
    const removedCursor = service.sessions.tree.cursor(sessionId), before = service.sessions.tree.nodes(sessionId);
    expect(service.sessions.snapshot(sessionId).workbench.objects.map(object => object.id)).not.toContain(note.id);
    await service.sessions.execute({ type: "select", sessionId, nodeId });
    expect(service.sessions.snapshot(sessionId).cursor).toBe(nodeId);
    expect(service.sessions.snapshot(sessionId).workbench.objects.map(object => object.id)).toContain(note.id);
    const selections = service.sessions.tree.cursorSelections(sessionId);
    await service.sessions.execute({ type: "view.set", sessionId, objectId: note.id, size: { width: 900, height: 1000 } });
    await service.sessions.execute({ type: "view.set", sessionId, objectId: note.id, collapsed: true, position: { x: 30, y: 40 } });
    expect(service.sessions.snapshot(sessionId).workbench.views.find(view => view.objectId === note.id))
      .toMatchObject({ size: { width: 900, height: 1000 }, collapsed: true, position: { x: 30, y: 40 } });
    expect(service.sessions.tree.nodes(sessionId)).toEqual(before);
    expect(service.sessions.tree.cursor(sessionId)).toBe(nodeId);
    expect(service.sessions.tree.cursorSelections(sessionId)).toEqual(selections);
    await service.sessions.execute({ type: "select", sessionId, nodeId: removedCursor });
    expect(service.sessions.snapshot(sessionId).workbench.objects.map(object => object.id)).not.toContain(note.id);
    await service.sessions.execute({ type: "select", sessionId, nodeId });
    await service.close(); services.delete(service);
    const reopened = new ApplicationService(root); services.add(reopened);
    expect(reopened.sessions.snapshot(sessionId).workbench.views.find(view => view.objectId === note.id)?.size).toEqual({ width: 900, height: 1000 });
    await reopened.sessions.execute({ type: "view.set", sessionId, objectId: note.id, size: null, collapsed: false });
    expect(reopened.sessions.snapshot(sessionId).workbench.views.find(view => view.objectId === note.id))
      .toMatchObject({ size: null, collapsed: false, position: { x: 30, y: 40 } });
    expect(reopened.sessions.tree.cursor(sessionId)).toBe(nodeId);
  });

  it("正文增量发布独立进度，持久节点和终态才使会话视图失效", async () => {
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const started = new Promise<void>(resolve => { entered = resolve; });
    const events: SessionChanged[] = [];
    const model: ModelAdapter = { validate() {}, version: "ai-sdk-v7/3", prepare: () => ({ async *stream() {
      yield { type: "part.start", part: { id: "t", kind: "text" } };
      yield { type: "part.delta", partId: "t", delta: "Live" };
      entered(); await gate;
      yield { type: "part.end", partId: "t" };
      yield { type: "finish", reason: "stop", usage: null };
    } }) };
    const { service, start } = await setup(model, event => events.push(event));
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const first = await execute(service, start); await started;
      events.length = 0;
      await vi.advanceTimersToNextTimerAsync();
      expect(events.some(event => event.kind === "session.progress" && event.progress.live.some(block => block.kind === "text" && block.text === "Live"))).toBe(true);
      release(); await settled(service);
      expect(events.some(event => event.kind === "session.changed")).toBe(true);
      expect(events.at(-1)).toMatchObject({ kind: "session.progress", progress: { live: [] } });
      expect(service.sessions.snapshot(first.sessionId).nodes.map(flat).some(node => node.kind === "text" && node.complete)).toBe(true);
    } finally { release(); vi.useRealTimers(); }
  });

  it("正文等待终态后作为同一块入树并推进游标，代理视图交付回合状态且重开保留计量", async () => {
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const saved = new Promise<void>(resolve => { entered = resolve; });
    const usage = { input: 12, output: 3, total: 15, reasoning: 1, cacheRead: 4, cacheWrite: 0 };
    const model: ModelAdapter = { validate() {}, version: "ai-sdk-v7/3", prepare: () => ({ async *stream() {
      yield* reply("Saved text").slice(0, -1);
      entered();
      await gate;
      yield { type: "finish", reason: "stop", rawFinishReason: "end_turn", responseId: "provider-response", usage };
    } }) };
    const { service, root, start } = await setup(model);
    const first = await execute(service, start);
    await saved;
    const before = service.sessions.snapshot(first.sessionId);
    try {
      expect(before.nodes.map(flat).some(node => node.kind === "text")).toBe(false);
      expect(before.progress.live).toContainEqual(expect.objectContaining({ kind: "text", text: "Saved text" }));
      // 领域状态须经资源投影交付；不能只在前端或执行循环内存中计算。
      expect(before.workbench.objects.find(object => object.kind === "atelier.core/agent")?.presentation)
        .toMatchObject({ data: { turnState: "incomplete" } });
    } finally { release(); }
    await settled(service);
    const after = service.sessions.snapshot(first.sessionId);
    expect(after.nodes).toHaveLength(before.nodes.length + 1);
    expect(after.cursor).toBe(after.nodes.at(-1)!.id);
    expect(after.nodes.map(flat).at(-1)).toMatchObject({ kind: "text", parentId: before.cursor,
      completion: { usage, finishReason: "stop", rawFinishReason: "end_turn", providerResponseId: "provider-response" } });
    expect(after.workbench.objects.find(object => object.kind === "atelier.core/agent")?.presentation)
      .toMatchObject({ data: { turnState: "completed" } });
    await service.close(); services.delete(service);
    const reopened = new ApplicationService(root); services.add(reopened);
    const restored = reopened.sessions.snapshot(first.sessionId);
    expect(restored.nodes).toEqual(after.nodes);
    expect(restored.workbench.objects.find(object => object.kind === "atelier.core/agent")?.presentation)
      .toMatchObject({ data: { turnState: "completed" } });
  });

  it("无块响应保留已报告计量，不伪造正文或工具块", async () => {
    const model: ModelAdapter = { validate() {}, version: "ai-sdk-v7/3", prepare: () => ({ async *stream() {
      yield { type: "finish", reason: "stop", responseId: "empty-response",
        usage: { input: 2, output: 0, total: 2, reasoning: null, cacheRead: null, cacheWrite: null } };
    } }) };
    const { service, start } = await setup(model);
    const first = await execute(service, start);
    await settled(service);
    const nodes = service.sessions.snapshot(first.sessionId).nodes;
    expect(nodes.map(flat).some(node => ["text", "thinking", "toolcall"].includes(node.kind))).toBe(false);
    expect(nodes.map(flat).find(node => node.kind === "notice")).toMatchObject({ code: "empty_response", response: { providerResponseId: "empty-response", usage: { total: 2 } } });
  });

  it("目录 see 的图片随代理工具结果落库，下一次请求作为文件部件发送，重开仍可读取", async () => {
    let resourceId = "";
    const seen: ModelInput[] = [];
    const model: ModelAdapter = { validate() {}, version: "ai-sdk-v7/3", prepare: input => { seen.push(input); return { async *stream() {
      if (seen.length === 2) {
        yield { type: "part.start", part: { id: "c", kind: "toolcall", callId: "see-image", name: "resource_call" } };
        yield { type: "part.end", partId: "c", arguments: { resource_id: resourceId, tool: "see", target: { path: "shot.png" }, args: {} } };
        yield { type: "finish", reason: "tool-calls", usage: null };
      } else yield* reply();
    } }; } };
    const { service, root, start } = await setup(model);
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jX1kAAAAASUVORK5CYII=", "base64");
    writeFileSync(join(root, "shot.png"), png);
    const first = await execute(service, start); await settled(service);
    const created = await execute(service, { type: "resource.create", sessionId: first.sessionId, kind: "atelier.core/directory", creation: { id: "atelier.core/directory.create" }, input: { path: root }, position: { x: 0, y: 0 } });
    resourceId = created.workbench.objects.find(object => object.kind === "atelier.core/directory")!.id;
    const agentId = agentOf(first);
    await execute(service, { type: "link.set", sessionId: first.sessionId, agentId, resourceId, linked: true });
    await execute(service, agentCommand(first.sessionId, agentId, { type: "continue" })); await settled(service);
    const nodes = service.sessions.tree.nodes(first.sessionId).map(flat);
    expect(nodes.filter(node => node.kind === "notice")).toEqual([]);
    const saved = nodes.find(node => node.kind === "toolcall");
    expect(saved).toMatchObject({ outcome: { kind: "succeeded", model: [{ kind: "text" }, { kind: "file", mediaType: "image/png", filename: "shot.png" }] } });
    expect(seen).toHaveLength(3);
    const result = seen[2]!.messages.find(item => item.kind === "result");
    expect(result).toMatchObject({ kind: "result", parts: [{ kind: "text" }, { kind: "file", mediaType: "image/png", data: new Uint8Array(png) }] });
    await service.close(); services.delete(service);
    const reopened = new ApplicationService(root); services.add(reopened);
    const outcome = reopened.sessions.tree.nodes(first.sessionId).map(flat).find(node => node.kind === "toolcall")!;
    const file = (outcome as unknown as { outcome: { model: { kind: string; file?: { "$atelier.content": string } }[] } }).outcome.model.find(part => part.kind === "file")!.file!;
    expect(await reopened.sessions.content.reader({ sessionId: first.sessionId, objectId: agentId,
      recordIds: new Set(reopened.sessions.tree.timeline(first.sessionId).map(flat).map(node => node.id)) }).read(file)).toEqual(new Uint8Array(png));
  });

  it.each(["succeeded", "cancelled"] as const)("工具 %s 结局和当次资源身份落库，移除资源与重开不改变历史", async kind => {
    let entered!: () => void;
    const executing = new Promise<void>(resolve => { entered = resolve; });
    const contract = defineImplementation({
      ...defineData("test.saved", z.strictObject({ text: z.string() }).describe("Captured output.")), resource: Directory,
      tool: defineTool({ id: "test.tools/capture", name: "capture", description: "Capture output.", guidelines: [], argsSchema: z.strictObject({}).describe("No parameters.") }),
      targetSchema: z.null().describe("Use the directory."), effect: "read", execution: "parallel",
    });
    const original = runtimeModules.createModules;
    vi.spyOn(runtimeModules, "createModules").mockImplementation(services => ({ ...original(services), tools: new ToolRegistry([
      implement(contract, { async call(_state, _target, _args, { publish, signal }) {
        publish({ text: "captured" });
        if (kind === "cancelled") await new Promise<never>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), { once: true }); entered();
        });
        else entered();
        return { kind: "succeeded", data: { text: "captured" } };
      }, toModel: data => data.text }),
    ]) }));
    let resourceId = "", requests = 0;
    const model: ModelAdapter = { validate() {}, version: "ai-sdk-v7/3", prepare: () => ({ async *stream() {
      if (++requests === 2) {
        yield { type: "part.start", part: { id: "c", kind: "toolcall", callId: "capture", name: "resource_call" } };
        yield { type: "part.end", partId: "c", arguments: { resource_id: resourceId, tool: "capture", args: {} } };
        yield { type: "finish", reason: "tool-calls", usage: null };
      } else yield* reply();
    } }) };
    const { service, root, start } = await setup(model);
    const first = await execute(service, start); await settled(service);
    const sessionId = first.sessionId, agentId = agentOf(first);
    const created = await execute(service, { type: "resource.create", sessionId, kind: Directory.kind, creation: { id: "atelier.core/directory.create" },
      input: { path: root, title: "Captured directory" }, position: { x: 0, y: 0 } });
    resourceId = created.workbench.objects.find(object => object.kind === Directory.kind)!.id;
    await execute(service, { type: "link.set", sessionId, agentId, resourceId, linked: true });
    await execute(service, agentCommand(sessionId, agentId, { type: "continue" })); await executing;
    if (kind === "cancelled") await execute(service, agentCommand(sessionId, agentId, { type: "cancel" }));
    await settled(service);
    const saved = service.sessions.tree.nodes(sessionId).map(flat).find(node => node.kind === "toolcall")!;
    expect(saved).toMatchObject({ outcome: { kind, data: { text: "captured" }, implementation: { id: contract.id },
      resource: { id: resourceId, kind: Directory.kind, title: "Captured directory" } } });
    expect(saved.outcome.model.some((part: ModelInputPart) => part.kind === "text" && part.text.includes("captured"))).toBe(true);
    await execute(service, { type: "object.remove", sessionId, objectId: resourceId });
    await service.close(); services.delete(service);
    const reopened = new ApplicationService(root); services.add(reopened);
    expect(reopened.sessions.tree.nodes(sessionId).map(flat).find(node => node.id === saved.id)).toEqual(saved);
  });

  it("首次提交原子创建会话与代理；重复提交幂等，重开读取相同树", async () => {
    const { service, root, start } = await setup();
    const [a, b] = await Promise.all([execute(service, start), execute(service, start)]);
    expect(a.sessionId).toBe(b.sessionId);
    await settled(service);
    const snap = await execute(service, { type: "read", sessionId: a.sessionId });
    expect(snap.nodes.map(flat).map(n => n.kind)).toEqual(["event", "message", "text"]);
    expect(snap.workbench.objects.filter(o => o.kind === "atelier.core/agent")).toHaveLength(1);
    await expect(execute(service, { ...start, parts: [{ kind: "text", text: "Other" }] })).rejects.toThrow();
    await service.close(); services.delete(service);
    const reopened = new ApplicationService(root, { adapterFactory: () => adapter() }); services.add(reopened);
    expect((await execute(reopened, { type: "read", sessionId: a.sessionId })).nodes).toEqual(snap.nodes);
  });

  it("两个代理并行运行：互不阻塞，事件交错追加，各自投影只含自己的输入与响应", async () => {
    let release!: () => void;
    const gate = new Promise<void>(r => { release = r; });
    const inputs: ModelInput[] = [];
    let calls = 0;
    const model: ModelAdapter = { validate() {}, version: "ai-sdk-v7/3", prepare: input => { inputs.push(input); return { async *stream() {
      if (++calls === 2) await gate;
      yield* reply(`R${calls}`);
    } }; } };
    const { service, start } = await setup(model);
    const first = await execute(service, start); await settled(service);
    const sessionId = first.sessionId;
    const a = agentOf(first);
    await execute(service, { type: "resource.create", sessionId, kind: "atelier.core/agent", creation: { id: "atelier.core/agent.create" }, input: { selection: selectionOf(first) }, position: { x: 600, y: 0 } });
    const b = service.sessions.snapshot(sessionId).workbench.objects.find(o => o.kind === "atelier.core/agent" && o.id !== a)!.id;
    await execute(service, agentCommand(sessionId, a, { type: "submit", submissionId: randomUUID(), parts: [{ kind: "text", text: "To A" }] }));
    await execute(service, agentCommand(sessionId, b, { type: "submit", submissionId: randomUUID(), parts: [{ kind: "text", text: "To B" }] }));
    await expect(execute(service, agentCommand(sessionId, a, { type: "continue" }))).rejects.toThrow();
    release(); await settled(service);
    const texts = (input: ModelInput) => input.messages.flatMap(m => m.kind === "input" ? [modelInputText(m.parts)] : []);
    // 提交时先预检（prepare）再真正请求；按最后一次含该输入的请求核对各代理投影。
    const sent = inputs.map(texts);
    expect(sent.filter(m => m.includes("To A")).at(-1)).toEqual(["First", "To A"]);
    expect(sent.filter(m => m.includes("To B")).at(-1)).toEqual(["To B"]);
    const path = service.sessions.tree.timeline(sessionId).map(flat);
    expect(path.filter(n => n.kind === "message").map(n => n.source?.resource?.id)).toEqual([a, a, b]);
  });

  it("其他代理在 thinking 生成期间发送时沿当前游标追加，终态到达后仍保持单一路径", async () => {
    let release!: () => void;
    let markThinking!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const thinkingSaved = new Promise<void>(resolve => { markThinking = resolve; });
    let calls = 0;
    const model: ModelAdapter = { validate() {}, version: "ai-sdk-v7/3", prepare: () => ({ async *stream() {
      if (++calls === 2) {
        yield { type: "part.start", part: { id: "r", kind: "thinking" } };
        yield { type: "part.delta", partId: "r", delta: "Reasoning" };
        yield { type: "part.end", partId: "r" };
        markThinking(); await gate;
      }
      yield* reply();
    } }) };
    const { service, start } = await setup(model);
    const first = await execute(service, start); await settled(service);
    const sessionId = first.sessionId;
    const a = agentOf(first);
    await execute(service, { type: "resource.create", sessionId, kind: "atelier.core/agent", creation: { id: "atelier.core/agent.create" }, input: { selection: selectionOf(first) }, position: { x: 600, y: 0 } });
    const b = service.sessions.snapshot(sessionId).workbench.objects.find(o => o.id !== a)!.id;
    try {
      await execute(service, agentCommand(sessionId, a, { type: "submit", submissionId: randomUUID(), parts: [{ kind: "text", text: "To A" }] }));
      await thinkingSaved;
      const cursor = service.sessions.tree.cursor(sessionId);
      expect(service.sessions.snapshot(sessionId).progress.live).toContainEqual(expect.objectContaining({ kind: "thinking", text: "Reasoning" }));
      await execute(service, agentCommand(sessionId, b, { type: "submit", submissionId: randomUUID(), parts: [{ kind: "text", text: "To B" }] }));
      expect(service.sessions.tree.nodes(sessionId).map(flat).find(n => n.kind === "message" && modelInputText(n.parts) === "To B")?.parentId).toBe(cursor);
      expect(service.sessions.tree.cursorSelections(sessionId)).toEqual([]);
    } finally { release(); }
    await settled(service);
    const nodes = service.sessions.tree.nodes(sessionId);
    expect(service.sessions.tree.timeline(sessionId)).toEqual(nodes);
    expect(nodes.map(flat).some(node => node.kind === "thinking")).toBe(true);
  });

  it("异步 submit 准备期间对象被移除，落地前拒绝命令", async () => {
    const { service, start } = await setup();
    const first = await execute(service, start); await settled(service);
    const sessionId = first.sessionId;
    const agentId = agentOf(first);
    const read = service.configuration.execute.bind(service.configuration);
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    vi.spyOn(service.configuration, "execute").mockImplementationOnce(async command => { await gate; return read(command); });
    const command: Json = { type: "submit", submissionId: randomUUID(), parts: [{ kind: "text", text: "Too late" }] };
    const pending = execute(service, agentCommand(sessionId, agentId, command));
    const rejected = expect(pending).rejects.toMatchObject({ code: "not_found" });
    try {
      await execute(service, { type: "object.remove", sessionId, objectId: agentId });
      const nodes = service.sessions.tree.nodes(sessionId).map(flat);
      release(); await rejected;
      expect(service.sessions.tree.nodes(sessionId).map(flat)).toEqual(nodes);
      expect(service.sessions.running).toBe(false);
    } finally { release(); }
  });

  it.each(["agent", "resource"] as const)("%s 写入活动未收束时禁止选择和自身移除，其他对象可移除", async mode => {
    let capturedId = "", release!: () => void, entered!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; }), started = new Promise<void>(resolve => { entered = resolve; });
    const original = runtimeModules.createModules;
    vi.spyOn(runtimeModules, "createModules").mockImplementation(services => {
      const modules = original(services);
      modules.resources.controller(Note.kind)!.activity = () => ({ running: mode === "resource" && capturedId ? [capturedId] : [], live: [] });
      return modules;
    });
    const model: ModelAdapter = { validate() {}, version: "ai-sdk-v7/3", prepare: () => ({ async *stream() {
      if (mode === "agent") { entered(); await gate; }
      yield* reply();
    } }) };
    const { service, root, start } = await setup(model), first = await execute(service, start), sessionId = first.sessionId;
    if (mode === "agent") { await started; capturedId = agentOf(first); }
    else {
      await settled(service);
      const note = await execute(service, { type: "resource.create", sessionId, kind: Note.kind, creation: { id: "atelier.core/note.create" }, input: {}, position: { x: 0, y: 0 } });
      capturedId = note.workbench.objects.find(object => object.kind === Note.kind)!.id;
    }
    const id = capturedId;
    try {
      expect(service.sessions.snapshot(sessionId).progress.unsettledObjectIds).toContain(id);
      await expect(execute(service, { type: "select", sessionId, nodeId: first.cursor })).rejects.toMatchObject({ code: "conflict" });
      await expect(execute(service, { type: "object.remove", sessionId, objectId: id })).rejects.toMatchObject({ code: "conflict" });
      const directory = await execute(service, { type: "resource.create", sessionId, kind: Directory.kind, creation: { id: "atelier.core/directory.create" }, input: { path: root }, position: { x: 0, y: 0 } });
      await execute(service, { type: "object.remove", sessionId, objectId: directory.workbench.objects.find(object => object.kind === Directory.kind)!.id });
    } finally { release(); capturedId = ""; }
    await settled(service);
    await execute(service, { type: "object.remove", sessionId, objectId: id });
    await execute(service, { type: "select", sessionId, nodeId: first.cursor });
  });

  it("请求在产生块之前失败时记录错误级通知，不伪造回复", async () => {
    let n = 0;
    const { service, start } = await setup(adapter(() => { if (++n === 1) throw new ModelFailure("prepare_failed", "Cannot prepare."); }));
    // 无输出的请求失败也必须终结运行标记。
    const states = resourceStatuses(service);
    const s = await execute(service, start); await settled(service);
    expect(states).toEqual(["running", "failed"]);
    const snap = await execute(service, { type: "read", sessionId: s.sessionId });
    expect(snap.nodes.map(flat).some(x => x.kind === "text")).toBe(false);
    expect(snap.nodes.map(flat).at(-1)).toMatchObject({ kind: "notice", level: "error", code: "prepare_failed" });
  });

  it("取消时已收到的部分正文以不完整块留档，不进入可续接路径", async () => {
    let markStreamed!: () => void;
    const streamed = { promise: new Promise<void>(r => { markStreamed = r; }) };
    const partial: ModelAdapter = { validate() {}, version: "ai-sdk-v7/3", prepare: () => ({ async *stream(signal) {
      yield { type: "part.start", part: { id: "t", kind: "text" } } as const;
      yield { type: "part.delta", partId: "t", delta: "Half" } as const;
      markStreamed();
      await new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason)));
    } }) };
    const { service, start } = await setup(partial);
    // 主动停止后需要用户显式继续，不能误报正常完成或留下 running。
    const states = resourceStatuses(service);
    const s = await execute(service, start);
    await streamed.promise;
    const running = await execute(service, { type: "read", sessionId: s.sessionId });
    expect(running.progress.live).toEqual([expect.objectContaining({ kind: "text", text: "Half" })]);
    expect(running.nodes.map(flat).some(node => node.kind === "text")).toBe(false);
    await execute(service, agentCommand(s.sessionId, agentOf(s), { type: "cancel" }));
    await settled(service);
    const snap = await execute(service, { type: "read", sessionId: s.sessionId });
    const half = snap.nodes.map(flat).find(x => x.kind === "text");
    expect(states).toEqual(["running", "awaiting"]);
    expect(half).toMatchObject({ text: "Half", complete: false });
    expect(snap.progress.live).toEqual([]);
  });

  it("异常流的未结束调用只留档，不执行且不发起后续请求", async () => {
    let requests = 0;
    const broken: ModelAdapter = { validate() {}, version: "ai-sdk-v7/3", prepare: () => ({ async *stream() {
      requests++;
      yield { type: "part.start", part: { id: "c", kind: "toolcall", callId: "c1", name: "resource_list" } };
      yield { type: "part.delta", partId: "c", delta: "{}" };
      yield { type: "finish", reason: "tool-calls", usage: null };
    } }) };
    const { service, start } = await setup(broken);
    const first = await execute(service, start);
    await settled(service);
    expect(requests).toBe(1);
    const nodes = service.sessions.tree.nodes(first.sessionId).map(flat);
    expect(nodes.at(-1)).toMatchObject({ kind: "notice", code: "incomplete" });
  });

  it("运行中修改代理配置在下一模型请求生效", async () => {
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const started = new Promise<void>(resolve => { entered = resolve; });
    const systems: string[] = [];
    let requests = 0;
    const model: ModelAdapter = { validate() {}, version: "ai-sdk-v7/3", prepare: input => {
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
    await execute(service, start);
    await started;
    try {
      await service.configuration.execute({ type: "agent.save", id: "worker", value: { systemPrompt: "Updated request instructions." } });
    } finally { release(); }
    await settled(service);
    expect(requests).toBe(2);
    expect(systems[0]).not.toContain("Updated request instructions.");
    expect(systems.at(-1)).toContain("Updated request instructions.");
  });

  it.each([false, true])("请求期间断开资源（首块已保存=%s）：本次授权固定，下一请求取用新状态", async firstBlockSaved => {
    let resourceId = "";
    let requests = 0;
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const started = new Promise<void>(resolve => { entered = resolve; });
    const inputs: ModelInput[] = [];
    const model: ModelAdapter = { validate() {}, version: "ai-sdk-v7/3", prepare: input => {
      inputs.push(input);
      return { async *stream() {
        const request = ++requests;
        if (request === 2) {
          if (firstBlockSaved) {
            yield { type: "part.start", part: { id: "t", kind: "text" } };
            yield { type: "part.delta", partId: "t", delta: "Listing now" };
            yield { type: "part.end", partId: "t" };
          }
          entered();
          await gate;
        }
        if (request === 2 || request === 3) {
          yield { type: "part.start", part: { id: "c", kind: "toolcall", callId: `call-${request}`, name: "resource_call" } };
          yield { type: "part.end", partId: "c", arguments: { resource_id: resourceId, tool: "list", args: {} } };
          yield { type: "finish", reason: "tool-calls", usage: null };
        } else yield* reply();
      } };
    } };
    const { service, root, start } = await setup(model);
    const first = await execute(service, start);
    await settled(service);
    const sessionId = first.sessionId;
    const agentId = agentOf(first);
    const created = await execute(service, { type: "resource.create", sessionId, kind: "atelier.core/directory", creation: { id: "atelier.core/directory.create" }, input: { path: root }, position: { x: 0, y: 0 } });
    resourceId = created.workbench.objects.find(object => object.kind === "atelier.core/directory")!.id;
    await execute(service, { type: "link.set", sessionId: sessionId, agentId: agentId, resourceId: resourceId, linked: true });
    await execute(service, agentCommand(sessionId, agentId, { type: "continue" }));
    await started;
    try {
      await execute(service, { type: "link.set", sessionId: sessionId, agentId: agentId, resourceId: resourceId, linked: false });
    } finally { release(); }
    await settled(service);
    expect(requests).toBe(4);
    expect(service.sessions.tree.nodes(sessionId).map(flat).filter(node => node.kind === "toolcall").map(node => node.outcome?.kind))
      .toEqual(["succeeded", "rejected"]);
  });
});

describe("插件包管理命令", () => {
  it("应用命令登记和移除插件包，正确表达重启标记", async () => {
    const { service, root } = await setup();
    const dir = join(root, "pkg"); mkdirSync(dir);
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "p", atelier: { id: "acme.p", api: { major: 7, minMinor: 0 } } }));
    const added = service.execute({ type: "plugin.add", path: dir });
    expect(added.plugins.map(p => [p.source, p.status, p.enabled])).toEqual([[dir, "pending", true]]);
    expect(added.restartRequired).toBe(true);
    expect(service.execute({ type: "plugin.remove", index: 0 }).restartRequired).toBe(false);
  });
});
