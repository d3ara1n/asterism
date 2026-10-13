import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setImmediate } from "node:timers/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApplicationService } from "./service.ts";
import { ModelFailure, type ModelAdapter, type ModelEvent, type ModelInput } from "../model/contract.ts";
import { sdkMessages } from "../model/ai-sdk.ts";
import { sessionResultSchema, type SessionChanged, type SessionCommand, type SessionMutation } from "../shared/session.ts";
import { dispatchSession } from "./dispatch.ts";
import { sessionVersion } from "../shared/session.ts";
import { flat } from "../session/test-nodes.ts";
import type { AgentSelection, Json } from "../shared/model.ts";
import { projectForAgent } from "../session/projection.ts";
import * as runtimeModules from "../modules/runtime.ts";
import { z } from "zod";
import { defineData } from "@atelier/sdk/contracts";
import { defineImplementation, defineTool } from "@atelier/sdk/contracts";
import { Directory } from "../modules/filesystem/contract.ts";
import { Note } from "../modules/notes/contract.ts";
import { implement } from "../tools/testing.ts";
import { ToolRegistry } from "../tools/registry.ts";
import { foldWorkbench } from "../session/fold.ts";
import { textReadSchema, textChangeSchema } from "../modules/shared/text-contract.ts";

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
  const reply = await service.sessions.execute(command.type === "read" ? { ...command, position: { kind: "live" } } : command);
  return reply.kind === "view" ? reply.snapshot : service.sessions.snapshot(reply.sessionId);
}
async function settled(service: ApplicationService) {
  for (let i = 0; i < 200 && service.sessions.running; i++) await setImmediate();
  expect(service.sessions.running).toBe(false);
}

describe("会话运行时", () => {
  it("首页纯文件先进入时间轴；后续图文顺序、重开和历史分叉保留内容资格", async () => {
    const inputs: ModelInput[] = [];
    let currentService!: ApplicationService;
    const model: ModelAdapter = { version: "ai-sdk-v7/3", validate() {}, prepare(input) {
      // Provider 准备前，用户输入已经作为消息记录提交。
      expect(currentService.sessions.tree.list().some(session => currentService.sessions.tree.path(session.id).map(flat).some(node => node.kind === "message"))).toBe(true);
      inputs.push(input); return { async *stream() { yield* reply(); } };
    } };
    const { service, start, root } = await setup(model); currentService = service;
    const { revision: _revision, ...configured } = service.configuration.current().models[0]!;
    await service.configuration.execute({ type: "model.save", id: start.model,
      value: { ...configured, capabilities: { ...configured.capabilities } } });
    const store = service.sessions.content, draft = service.sessions.openContentInput(startAgentContentTarget);
    const png = new Uint8Array([1, 2, 3]), webp = new Uint8Array([4, 5, 6]);
    const file = await store.writer({ scope: draft }).stage(png);
    const firstInput = { ...start, parts: [{ kind: "file" as const, file, mediaType: "image/png", filename: "first.png" }], contentScopeId: draft.id };
    const first = await execute(service, firstInput); await settled(service);
    await draft.close();
    // 已受理重试不再需要有效草稿，临时 scope 不属于业务幂等身份。
    expect((await execute(service, { ...firstInput, contentScopeId: undefined })).sessionId).toBe(first.sessionId);
    const agentId = agentOf(first), origin = first.nodes.map(flat).find(node => node.kind === "message")!;
    expect(origin).toMatchObject({ parts: firstInput.parts });
    expect(inputs[0]!.messages).toEqual([{ kind: "input", parts: [{ kind: "file", data: png, mediaType: "image/png", filename: "first.png" }] }]);
    const next = service.sessions.openContentInput({ sessionId: first.sessionId, objectId: agentId, contractId: SubmitAgentInput.id, resourceKind: SubmitAgentInput.resource.kind });
    const other = await store.writer({ scope: next }).stage(webp);
    const parts: ModelInputPart[] = [{ kind: "text", text: "Compare" }, { kind: "file" as const, file: other, mediaType: "image/webp" }, { kind: "text" as const, text: "with the screenshot" }];
    await service.sessions.execute({ type: "resource.command", sessionId: first.sessionId, objectId: agentId,
      command: resourceCall(SubmitAgentInput, { type: "submit", submissionId: randomUUID(), parts }), contentScopeId: next.id });
    await settled(service); await next.close();
    expect(inputs.at(-1)!.messages.at(-1)).toEqual({ kind: "input", parts: [
      { kind: "text", text: "Compare" }, { kind: "file", data: webp, mediaType: "image/webp" }, { kind: "text", text: "with the screenshot" },
    ] });
    const originalNodes = service.sessions.tree.nodes(first.sessionId).map(flat);
    await service.sessions.execute({ type: "select", sessionId: first.sessionId, nodeId: origin.id });
    await expect(service.sessions.execute({ type: "resource.command", sessionId: first.sessionId, objectId: agentId,
      command: resourceCall(SubmitAgentInput, { type: "submit", submissionId: randomUUID(), parts: [{ kind: "file", file: other, mediaType: "image/webp" }] }) })).rejects.toThrow("does not belong");
    await execute(service, agentCommand(first.sessionId, agentId, { type: "submit", submissionId: randomUUID(), parts: [{ kind: "text", text: "Branch" }] }));
    await settled(service);
    const saved = service.sessions.tree.nodes(first.sessionId).map(flat);
    expect(saved.slice(0, originalNodes.length)).toEqual(originalNodes);
    await service.close(); services.delete(service);
    const reopened = new ApplicationService(root, { adapterFactory: () => adapter() }); services.add(reopened);
    expect(reopened.sessions.tree.nodes(first.sessionId).map(flat)).toEqual(saved);
    expect(await reopened.sessions.content.reader({ sessionId: first.sessionId, objectId: agentId,
      recordIds: new Set(reopened.sessions.tree.path(first.sessionId).map(flat).map(node => node.id)) }).read(file)).toEqual(png);
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
  it("笔记保存只改当前正文和视图修订，历史位置与重开都读取当前内容", async () => {
    let tools!: ToolRegistry;
    const createModules = runtimeModules.createModules;
    vi.spyOn(runtimeModules, "createModules").mockImplementation(services => {
      const modules = createModules(services); tools = modules.tools; return modules;
    });
    const { service, root, start } = await setup();
    const first = await execute(service, start); await settled(service);
    const sessionId = first.sessionId;
    const created = await execute(service, { type: "resource.create", sessionId, kind: "atelier.core/note", creation: { id: "atelier.core/note.create" },
      input: { title: "Notebook", content: "first\nsecond" }, position: { x: 0, y: 0 } });
    const note = foldWorkbench(created.nodes.map(flat)).objects.find(object => object.kind === "atelier.core/note")!;
    const nodeId = created.cursor!;
    const nodes = service.sessions.tree.nodes(sessionId).map(flat), cursor = service.sessions.tree.cursor(sessionId);
    const call = async (name: string, args: Json, target: Json = null) => {
      const implementation = tools.match(note).find(tool => tool.tool.name === name)!;
      const invocation = implementation.prepare(note, target, args);
      if (!("execute" in invocation)) return invocation;
      return invocation.execute(new AbortController().signal);
    };
    const read = textReadSchema.parse((await call("read", {})).data);
    expect(read.rows).toHaveLength(2);
    expect((await call("read", { anchored: false }))).toMatchObject({ kind: "succeeded", data: { rows: [{ line: 1, hash: null }, { line: 2, hash: null }] } });
    expect(await call("read", {}, { offset: 1 })).toMatchObject({ kind: "rejected", error: { code: "invalid_arguments" } });
    expect(await call("edit", { edits: [{ op: "replace", anchor: { line: 2, hash: read.rows[1].hash! }, body: ["edited"] }] })).toMatchObject({
      kind: "succeeded", data: { anchors: [{ line: 2, content: "edited" }] },
    });
    const write = await call("write", { content: "latest" });
    expect(textChangeSchema.parse(write.data).anchors).toEqual([]);
    expect(service.sessions.snapshot(sessionId).revision).toBeGreaterThan(created.revision);
    const revision = service.sessions.snapshot(sessionId).revision;
    expect(await call("write", { content: "latest" })).toMatchObject({ kind: "succeeded", data: { changed: false } });
    expect(service.sessions.snapshot(sessionId).revision).toBe(revision);
    expect(service.sessions.tree.nodes(sessionId).map(flat)).toEqual(nodes);
    expect(service.sessions.tree.cursor(sessionId)).toBe(cursor);
    const history = service.sessions.snapshot(sessionId, { kind: "history", nodeId });
    expect(history.workbench.objects.find(object => object.id === note.id)?.presentation.data).toEqual({ text: "latest" });
    expect(await call("write", { content: "x".repeat(100_001) })).toMatchObject({ kind: "rejected", error: { code: "note_too_large" } });
    expect(service.sessions.snapshot(sessionId).workbench.objects.find(object => object.id === note.id)?.presentation.data).toEqual({ text: "latest" });
    await service.close(); services.delete(service);
    const reopened = new ApplicationService(root); services.add(reopened);
    expect(reopened.sessions.snapshot(sessionId, { kind: "history", nodeId }).workbench.objects.find(object => object.id === note.id)?.presentation.data).toEqual({ text: "latest" });
    expect(textReadSchema.parse((await call("read", {})).data).rows[0].content).toBe("latest");
  });

  it("工具产出进入独立进度，取消后保存产出与身份；移除资源并重开仍可重放", async () => {
    let entered!: () => void;
    const executing = new Promise<void>(resolve => { entered = resolve; });
    let publish!: (data: { text: string }) => void;
    const implementation = defineImplementation({
      ...defineData("test.streaming", z.strictObject({ text: z.string() }).describe("Captured output.")),
      resource: Directory,
      tool: defineTool({ id: "test.tools/stream", name: "stream", description: "Stream output.", guidelines: [], argsSchema: z.strictObject({}).describe("No parameters.") }),
      targetSchema: z.null().describe("Use the directory."), effect: "read", execution: "parallel",
    });
    const createModules = runtimeModules.createModules;
    vi.spyOn(runtimeModules, "createModules").mockImplementation(services => ({
      ...createModules(services),
      tools: new ToolRegistry([implement(implementation, {
        async call(_state, _target, _args, context) {
          publish = context.publish;
          publish({ text: "first" });
          await new Promise<never>((_resolve, reject) => {
            context.signal.addEventListener("abort", () => reject(context.signal.reason), { once: true });
            entered();
          });
          return { kind: "succeeded", data: { text: "unreachable" } };
        },
        toModel: data => data.text,
      })]),
    }));
    let resourceId = "", requests = 0;
    const model: ModelAdapter = { validate() {}, version: "ai-sdk-v7/3", prepare: () => ({ async *stream() {
      if (++requests === 2) {
        yield { type: "part.start", part: { id: "c", kind: "toolcall", callId: "stream-call", name: "resource_call" } };
        yield { type: "part.end", partId: "c", arguments: { resource_id: resourceId, tool: "stream", args: {} } };
        yield { type: "finish", reason: "tool-calls", usage: null };
      } else yield* reply();
    } }) };
    const events: SessionChanged[] = [];
    const { service, root, start } = await setup(model, event => events.push(event));
    const first = await execute(service, start); await settled(service);
    const sessionId = first.sessionId, agentId = agentOf(first);
    const created = await execute(service, { type: "resource.create", sessionId, kind: "atelier.core/directory", creation: { id: "atelier.core/directory.create" },
      input: { path: root, title: "Captured directory" }, position: { x: 0, y: 0 } });
    resourceId = created.workbench.objects.find(object => object.kind === "atelier.core/directory")!.id;
    await execute(service, { type: "link.set", sessionId, agentId, resourceId, linked: true });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      await execute(service, agentCommand(sessionId, agentId, { type: "continue" }));
      await executing;
      const running = service.sessions.snapshot(sessionId);
      expect(running.nodes.map(flat).some(node => node.kind === "toolcall")).toBe(false);
      expect(running.progress.live).toEqual([expect.objectContaining({
        kind: "toolcall", state: "executing", result: { kind: "running", data: { text: "first" } },
        invocation: expect.objectContaining({ resource: { id: resourceId, kind: "atelier.core/directory", title: "Captured directory" } }),
      })]);
      publish({ text: "first\nsecond" });
      events.length = 0;
      await vi.advanceTimersByTimeAsync(32);
      expect(events).toEqual([expect.objectContaining({ kind: "session.progress", progress: expect.objectContaining({
        live: [expect.objectContaining({ result: { kind: "running", data: { text: "first\nsecond" } } })],
      }) })]);
      expect(requests).toBe(2);
    } finally {
      await execute(service, agentCommand(sessionId, agentId, { type: "cancel" }));
      await settled(service);
      vi.useRealTimers();
    }
    const snapshot = service.sessions.snapshot(sessionId);
    const saved = snapshot.nodes.map(flat).find(node => node.kind === "toolcall")!;
    expect(saved).toMatchObject({ complete: true, outcome: {
      kind: "cancelled", data: { text: "first\nsecond" }, model: [{ kind: "text", text: "cancelled: Operation execution was cancelled." }, { kind: "text", text: "first\nsecond" }],
      implementation: { id: "test.streaming" }, resource: { id: resourceId, kind: "atelier.core/directory", title: "Captured directory" },
      startedAt: expect.any(Number), finishedAt: expect.any(Number),
    } });
    expect(snapshot.progress.live).toEqual([]);
    publish({ text: "too late" });
    expect(service.sessions.snapshot(sessionId).nodes.map(flat).find(node => node.id === saved.id)).toEqual(saved);
    await execute(service, { type: "object.remove", sessionId, objectId: resourceId });
    await service.close(); services.delete(service);
    const reopened = new ApplicationService(root); services.add(reopened);
    const history = reopened.sessions.snapshot(sessionId);
    expect(history.nodes.map(flat).find(node => node.id === saved.id)).toEqual(saved);
    expect(projectForAgent(history.nodes.map(flat), agentId).find(item => item.kind === "result")).toMatchObject({
      outcome: { kind: "cancelled", model: [{ kind: "text" }, { kind: "text", text: "first\nsecond" }] },
    });
    expect(history.progress.live).toEqual([]);
  });

  it("资源与布局命令只返回受理结果；历史读取统一对象与路径，布局保存不移动历史", async () => {
    const { service, start } = await setup();
    const first = await execute(service, start); await settled(service);
    const sessionId = first.sessionId;
    const created = await execute(service, { type: "resource.create", sessionId, kind: "atelier.core/note", creation: { id: "atelier.core/note.create" }, input: { title: "Saved note", content: "original" }, position: { x: 10, y: 20 } });
    const note = created.workbench.objects.find(object => object.kind === "atelier.core/note")!;
    const history = created.cursor!;
    const receipt = await service.sessions.execute({ type: "object.remove", sessionId, objectId: note.id });
    expect(receipt).toEqual({ kind: "accepted", sessionId });
    const currentCursor = service.sessions.tree.cursor(sessionId);
    const selected = service.sessions.snapshot(sessionId, { kind: "history", nodeId: history });
    expect(selected.at).toBe(history);
    expect(selected.workbench.objects.map(object => object.id)).toContain(note.id);
    expect(service.sessions.snapshot(sessionId).workbench.objects.map(object => object.id)).not.toContain(note.id);
    const original = service.sessions.tree.nodes(sessionId).map(flat);
    await service.sessions.execute({ type: "view.set", sessionId, objectId: note.id, collapsed: true });
    const viewed = service.sessions.snapshot(sessionId, { kind: "history", nodeId: history });
    expect(viewed.workbench.views.find(item => item.objectId === note.id)?.collapsed).toBe(true);
    expect(viewed.revision).toBeGreaterThan(selected.revision);
    expect(viewed.seq).toBe(selected.seq);
    expect(service.sessions.tree.nodes(sessionId).map(flat)).toEqual(original);
    expect(service.sessions.tree.cursor(sessionId)).toBe(currentCursor);
    expect(service.sessions.tree.cursorSelections(sessionId)).toEqual([]);
    expect(service.execute({ type: "workspace.read" })).not.toHaveProperty("session");
    expect(() => service.execute({ type: "workspace.read", session_id: sessionId })).toThrow("Invalid application command");
    const response = await dispatchSession(service, { kind: "session.request", version: sessionVersion, id: randomUUID(),
      command: { type: "read", sessionId, position: { kind: "history", nodeId: history } } });
    expect(sessionResultSchema.parse((response as { result: unknown }).result)).toMatchObject({ ok: true, reply: { kind: "view", snapshot: { at: history } } });
  });

  it("通用卡片尺寸跨重开保存，折叠与历史读取保留尺寸，清除覆盖不改变任务历史", async () => {
    const { service, root, start } = await setup();
    const first = await execute(service, start); await settled(service);
    const sessionId = first.sessionId, agentId = agentOf(first);
    const created = await execute(service, { type: "resource.create", sessionId, kind: "atelier.core/note", creation: { id: "atelier.core/note.create" },
      input: { title: "Resizable note", content: "text" }, position: { x: 10, y: 20 } });
    const noteId = created.workbench.objects.find(object => object.kind === "atelier.core/note")!.id;
    const original = service.sessions.tree.nodes(sessionId).map(flat), cursor = service.sessions.tree.cursor(sessionId);
    for (const objectId of [agentId, noteId]) {
      await execute(service, { type: "view.set", sessionId, objectId, size: { width: 900, height: 1000 } });
      await execute(service, { type: "view.set", sessionId, objectId, collapsed: true });
      await execute(service, { type: "view.set", sessionId, objectId, position: { x: 30, y: 40 } });
    }
    const history = service.sessions.snapshot(sessionId, { kind: "history", nodeId: cursor });
    for (const objectId of [agentId, noteId]) {
      expect(history.workbench.views.find(view => view.objectId === objectId))
        .toMatchObject({ size: { width: 900, height: 1000 }, collapsed: true, position: { x: 30, y: 40 } });
    }
    expect(history.nodes.map(flat)).toEqual(created.nodes.map(flat));
    expect(service.sessions.tree.nodes(sessionId).map(flat)).toEqual(original);
    expect(service.sessions.tree.cursor(sessionId)).toBe(cursor);
    await service.close(); services.delete(service);
    const reopened = new ApplicationService(root); services.add(reopened);
    expect(reopened.sessions.snapshot(sessionId).workbench.views.find(view => view.objectId === agentId)?.size)
      .toEqual({ width: 900, height: 1000 });
    await execute(reopened, { type: "view.set", sessionId, objectId: agentId, size: null, collapsed: false });
    expect(reopened.sessions.snapshot(sessionId).workbench.views.find(view => view.objectId === agentId))
      .toMatchObject({ size: null, collapsed: false, position: { x: 30, y: 40 } });
    expect(reopened.sessions.snapshot(sessionId).workbench.views.find(view => view.objectId === noteId)?.size)
      .toEqual({ width: 900, height: 1000 });
    expect(reopened.sessions.tree.nodes(sessionId).map(flat)).toEqual(original);
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
      await vi.advanceTimersByTimeAsync(32);
      expect(events).toEqual([expect.objectContaining({ kind: "session.progress",
        progress: expect.objectContaining({ live: [expect.objectContaining({ text: "Live" })] }) })]);
      release(); await settled(service);
      expect(events.some(event => event.kind === "session.changed")).toBe(true);
      expect(events.at(-1)).toMatchObject({ kind: "session.progress", progress: { live: [] } });
      expect(service.sessions.snapshot(first.sessionId).nodes.map(flat).some(node => node.kind === "text" && node.complete)).toBe(true);
    } finally { release(); vi.useRealTimers(); }
  });

  it("块先保存，迟到计量随后可见；重开保留块身份、终态和选择审计", async () => {
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
    const block = before.nodes.map(flat).find(node => node.kind === "text")!;
    release();
    expect(before.nodes.map(flat).map(node => node.kind)).toEqual(["event", "message", "text"]);
    await settled(service);
    const after = service.sessions.snapshot(first.sessionId);
    expect(after.cursor).toBe(before.cursor);
    // 终态是执行体的独立审计记录：原块不变，计量随后追加且不移动游标。
    expect(after.nodes.map(flat).find(node => node.id === block.id)).toEqual(block);
    expect(after.nodes.map(flat).at(-1)).toMatchObject({ kind: "completion", position: false, ordinal: block.ordinal,
      completion: { usage, finishReason: "stop", rawFinishReason: "end_turn", providerResponseId: "provider-response" } });
    const input = after.nodes.map(flat).find(node => node.kind === "message")!;
    expect(after.nodes.map(flat).find(node => node.id === block.id)).toMatchObject({ requestParentId: input.id });
    await execute(service, { type: "select", sessionId: first.sessionId, nodeId: input.id });
    await service.close(); services.delete(service);
    const reopened = new ApplicationService(root); services.add(reopened);
    expect(reopened.sessions.snapshot(first.sessionId).nodes).toEqual(after.nodes);
    expect(reopened.sessions.tree.cursorSelections(first.sessionId)).toEqual([expect.objectContaining({
      fromId: block.id, requestedId: input.id, selectedId: input.id, reason: "user",
    })]);
  });

  it("无块响应保存诊断与已报告的计量，不伪造文本或计量节点", async () => {
    const model: ModelAdapter = { validate() {}, version: "ai-sdk-v7/3", prepare: () => ({ async *stream() {
      yield { type: "finish", reason: "stop", responseId: "empty-response",
        usage: { input: 2, output: 0, total: 2, reasoning: null, cacheRead: null, cacheWrite: null } };
    } }) };
    const { service, start } = await setup(model);
    const first = await execute(service, start);
    await settled(service);
    const nodes = service.sessions.snapshot(first.sessionId).nodes;
    expect(nodes.map(flat).map(node => node.kind)).toEqual(["event", "message", "completion"]);
    expect(flat(nodes.at(-1)!)).toMatchObject({ ordinal: null, completion: { providerResponseId: "empty-response", usage: { total: 2 } } });
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
      recordIds: new Set(reopened.sessions.tree.path(first.sessionId).map(flat).map(node => node.id)) }).read(file)).toEqual(new Uint8Array(png));
  });

  it("工具结果保存实现版本与当次数据；资源移除、文件改变和重开不影响历史", async () => {
    let resourceId = "";
    let calls = 0;
    const model: ModelAdapter = { validate() {}, version: "ai-sdk-v7/3", prepare: () => ({ async *stream() {
      if (++calls === 2) {
        yield { type: "part.start", part: { id: "c", kind: "toolcall", callId: "list-directory", name: "resource_call" } };
        yield { type: "part.end", partId: "c", arguments: { resource_id: resourceId, tool: "list", target: { path: "files" }, args: {} } };
        yield { type: "finish", reason: "tool-calls", usage: null };
      } else yield* reply();
    } }) };
    const { service, root, start } = await setup(model);
    mkdirSync(join(root, "files"));
    writeFileSync(join(root, "files", "a.txt"), "original");
    const first = await execute(service, start); await settled(service);
    const created = await execute(service, { type: "resource.create", sessionId: first.sessionId, kind: "atelier.core/directory", creation: { id: "atelier.core/directory.create" }, input: { path: root }, position: { x: 0, y: 0 } });
    const directory = created.workbench.objects.find(object => object.kind === "atelier.core/directory")!;
    expect(directory.id).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect(directory.presentation).toEqual({ contract: { id: "atelier.core/directory.card" }, data: { path: root } });
    resourceId = directory.id;
    const agentId = agentOf(first);
    await execute(service, { type: "link.set", sessionId: first.sessionId, agentId: agentId, resourceId: resourceId, linked: true });
    await execute(service, agentCommand(first.sessionId, agentId, { type: "continue" })); await settled(service);
    const saved = service.sessions.tree.nodes(first.sessionId).map(flat).find(node => node.kind === "toolcall");
    const listing = { path: "files", entries: [{ name: "a.txt", type: "file" }], truncated: false };
    expect(saved).toMatchObject({ outcome: { kind: "succeeded", implementation: { id: "atelier.core/directory.list" },
      model: [{ kind: "text", text: JSON.stringify(listing) }], data: listing } });
    writeFileSync(join(root, "files", "b.txt"), "changed");
    await execute(service, { type: "object.remove", sessionId: first.sessionId, objectId: resourceId });
    await service.close(); services.delete(service);
    const reopened = new ApplicationService(root); services.add(reopened);
    expect(reopened.sessions.tree.nodes(first.sessionId).map(flat).find(node => node.kind === "toolcall")).toEqual(saved);
  });

  it("首次提交原子创建会话与代理；重复提交幂等，重开读取相同树", async () => {
    const { service, root, start } = await setup();
    const [a, b] = await Promise.all([execute(service, start), execute(service, start)]);
    expect(a.sessionId).toBe(b.sessionId);
    await settled(service);
    const snap = await execute(service, { type: "read", sessionId: a.sessionId });
    expect(snap.nodes.map(flat).map(n => n.kind)).toEqual(["event", "message", "text", "completion"]);
    expect(snap.workbench.objects.filter(o => o.kind === "atelier.core/agent")).toHaveLength(1);
    expect(agentOf(snap)).toMatch(/^[A-Za-z0-9_-]{16}$/);
    await expect(execute(service, { ...start, parts: [{ kind: "text", text: "Other" }] })).rejects.toThrow("different input");
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
    await expect(execute(service, agentCommand(sessionId, a, { type: "continue" }))).rejects.toThrow("running");
    release(); await settled(service);
    const texts = (input: ModelInput) => input.messages.flatMap(m => m.kind === "input" ? [modelInputText(m.parts)] : []);
    // 提交时先预检（prepare）再真正请求；按最后一次含该输入的请求核对各代理投影。
    const sent = inputs.map(texts);
    expect(sent.filter(m => m.includes("To A")).at(-1)).toEqual(["First", "To A"]);
    expect(sent.filter(m => m.includes("To B")).at(-1)).toEqual(["To B"]);
    const path = service.sessions.tree.path(sessionId).map(flat);
    expect(path.filter(n => n.kind === "message").map(n => n.source.resource?.id)).toEqual([a, a, b]);
  });

  it("选择旧位置后发送形成新分支，旧分支保留；运行中不能选择", async () => {
    let release!: () => void;
    const gate = new Promise<void>(r => { release = r; });
    let calls = 0;
    const slow: ModelAdapter = { validate() {}, version: "ai-sdk-v7/3", prepare: () => ({ async *stream() { if (++calls === 2) await gate; yield* reply(); } }) };
    const { service, start } = await setup(slow);
    const first = await execute(service, start); await settled(service);
    const before = await execute(service, { type: "read", sessionId: first.sessionId });
    const agentId = agentOf(before);
    const message = before.nodes.map(flat).find(n => n.kind === "message")!;
    await execute(service, { type: "select", sessionId: first.sessionId, nodeId: message.id });
    await execute(service, agentCommand(first.sessionId, agentId, { type: "submit", submissionId: randomUUID(), parts: [{ kind: "text", text: "Branch" }] }));
    await expect(execute(service, { type: "select", sessionId: first.sessionId, nodeId: message.id })).rejects.toThrow("settle");
    release(); await settled(service);
    const after = await execute(service, { type: "read", sessionId: first.sessionId });
    expect(after.nodes.map(flat).slice(0, before.nodes.map(flat).length)).toEqual(before.nodes.map(flat));
    expect(after.nodes.map(flat).find(n => n.kind === "message" && modelInputText(n.parts) === "Branch")!.parentId).toBe(message.id);
  });

  it("其他代理在 thinking 后发送时沿同一路径追加，不回溯或拆开响应", async () => {
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
      const thinking = service.sessions.tree.path(sessionId).map(flat).at(-1)!;
      expect(thinking.kind).toBe("thinking");
      await execute(service, agentCommand(sessionId, b, { type: "submit", submissionId: randomUUID(), parts: [{ kind: "text", text: "To B" }] }));
      expect(service.sessions.tree.path(sessionId).map(flat)).toContainEqual(thinking);
      expect(service.sessions.tree.nodes(sessionId).map(flat).find(n => n.kind === "message" && modelInputText(n.parts) === "To B")?.parentId).toBe(thinking.id);
      expect(service.sessions.tree.cursorSelections(sessionId)).toEqual([]);
    } finally { release(); }
    await settled(service);
    const lastOutput = projectForAgent(service.sessions.tree.path(sessionId).map(flat), a).filter(item => item.kind === "output").at(-1)!;
    expect(lastOutput.parts.map(part => part.kind)).toEqual(["thinking", "text"]);
  });

  it("移除活动代理返回 conflict；收束后移除同时解除入向与出向链接", async () => {
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const started = new Promise<void>(resolve => { entered = resolve; });
    let calls = 0;
    const model: ModelAdapter = { validate() {}, version: "ai-sdk-v7/3", prepare: () => ({ async *stream() {
      if (++calls === 2) { entered(); await gate; }
      yield* reply();
    } }) };
    const { service, start } = await setup(model);
    const first = await execute(service, start); await settled(service);
    const sessionId = first.sessionId;
    const a = agentOf(first);
    await execute(service, { type: "resource.create", sessionId, kind: "atelier.core/agent", creation: { id: "atelier.core/agent.create" }, input: { selection: selectionOf(first) }, position: { x: 600, y: 0 } });
    const b = service.sessions.snapshot(sessionId).workbench.objects.find(o => o.id !== a)!.id;
    await execute(service, { type: "link.set", sessionId, agentId: a, resourceId: b, linked: true });
    await execute(service, { type: "link.set", sessionId, agentId: b, resourceId: a, linked: true });
    try {
      await execute(service, agentCommand(sessionId, a, { type: "continue" })); await started;
      const cursor = service.sessions.tree.cursor(sessionId);
      await expect(execute(service, { type: "object.remove", sessionId, objectId: a })).rejects.toMatchObject({ code: "conflict" });
      expect(service.sessions.tree.cursor(sessionId)).toBe(cursor);
      expect(service.sessions.snapshot(sessionId).workbench.links).toHaveLength(2);
    } finally { release(); }
    await settled(service);
    const removed = await execute(service, { type: "object.remove", sessionId, objectId: a });
    expect(removed.workbench.objects.map(o => o.id)).toEqual([b]);
    expect(removed.workbench.links).toEqual([]);
  });

  it.each(["submit"] as const)("异步 %s 准备期间对象被移除，落地前拒绝命令", async type => {
    const { service, start } = await setup();
    const first = await execute(service, start); await settled(service);
    const sessionId = first.sessionId;
    const agentId = agentOf(first);
    const read = service.configuration.execute.bind(service.configuration);
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    vi.spyOn(service.configuration, "execute").mockImplementationOnce(async command => { await gate; return read(command); });
    const command: Json = type === "submit" ? { type, submissionId: randomUUID(), parts: [{ kind: "text", text: "Too late" }] }
      : { type, selection: selectionOf(first) };
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

  it("被捕获的非代理资源活动阻止回溯与自身移除，外部引用不阻止", async () => {
    let capturedId = "";
    const createModules = runtimeModules.createModules;
    vi.spyOn(runtimeModules, "createModules").mockImplementation(services => {
      const modules = createModules(services);
      modules.resources.controller(Note.kind)!.activity = () => ({ running: capturedId ? [capturedId] : [], live: [] });
      return modules;
    });
    const { service, root, start } = await setup();
    const first = await execute(service, start); await settled(service);
    const sessionId = first.sessionId;
    const note = await execute(service, { type: "resource.create", sessionId, kind: "atelier.core/note", creation: { id: "atelier.core/note.create" }, input: {}, position: { x: 0, y: 0 } });
    capturedId = note.workbench.objects.find(o => o.kind === "atelier.core/note")!.id;
    expect(service.sessions.snapshot(sessionId).progress).toMatchObject({ unsettledObjectIds: [capturedId] });
    await expect(execute(service, { type: "select", sessionId, nodeId: first.cursor })).rejects.toMatchObject({ code: "conflict" });
    await expect(execute(service, { type: "object.remove", sessionId, objectId: capturedId })).rejects.toMatchObject({ code: "conflict" });
    const directory = await execute(service, { type: "resource.create", sessionId, kind: "atelier.core/directory", creation: { id: "atelier.core/directory.create" }, input: { path: root }, position: { x: 0, y: 0 } });
    await execute(service, { type: "object.remove", sessionId, objectId: directory.workbench.objects.find(o => o.kind === "atelier.core/directory")!.id });
    const id = capturedId;
    capturedId = "";
    await execute(service, { type: "object.remove", sessionId, objectId: id });
    await execute(service, { type: "select", sessionId, nodeId: first.cursor });
  });

  it("请求在产生块之前失败时记录错误级通知，不伪造回复", async () => {
    let n = 0;
    const { service, start } = await setup(adapter(() => { if (++n === 1) throw new ModelFailure("prepare_failed", "Cannot prepare."); }));
    const s = await execute(service, start); await settled(service);
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
    const s = await execute(service, start);
    await streamed.promise;
    const running = await execute(service, { type: "read", sessionId: s.sessionId });
    expect(running.progress.live).toEqual([expect.objectContaining({ kind: "text", text: "Half" })]);
    expect(running.nodes.map(flat).some(node => node.kind === "text")).toBe(false);
    await execute(service, agentCommand(s.sessionId, agentOf(s), { type: "cancel" }));
    await settled(service);
    const snap = await execute(service, { type: "read", sessionId: s.sessionId });
    const half = snap.nodes.map(flat).find(x => x.kind === "text");
    expect(half).toMatchObject({ text: "Half", complete: false });
    expect(snap.cursor).not.toBe(half!.id);
    expect(snap.progress.live).toEqual([]);
  });

  it("回到代理创建前时快照不暴露旁支代理，也不能向其提交或配置", async () => {
    const { service, start } = await setup();
    const first = await execute(service, start);
    await settled(service);
    const agentId = agentOf(first);
    const selected = await execute(service, { type: "select", sessionId: first.sessionId, nodeId: null });
    expect(selected.workbench.objects.filter(o => o.kind === "atelier.core/agent")).toEqual([]);
    await expect(execute(service, agentCommand(first.sessionId, agentId, { type: "continue" }))).rejects.toThrow("current session path");
    await expect(execute(service, agentCommand(first.sessionId, agentId, { type: "configure", selection: selectionOf(first) }))).rejects.toThrow("current session path");
    expect(service.sessions.tree.cursor(first.sessionId)).toBeNull();
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
    expect(nodes.find(n => n.kind === "toolcall")).toMatchObject({ complete: false, outcome: null });
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

  it.each([false, true])("请求期间断开资源（首块已保存=%s）：本次授权固定，下一请求保留前缀并取用新状态", async firstBlockSaved => {
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
    const nextInput = inputs.at(-2)!;
    const sent = sdkMessages(inputs.at(-3)!);
    expect(sdkMessages(nextInput).slice(0, sent.length)).toEqual(sent);
    expect(nextInput.messages.slice(-3).map(item => item.kind)).toEqual(["output", "result", "context"]);
    expect(nextInput.messages.at(-1)).toMatchObject({ kind: "context", parts: [{ kind: "text", text: expect.stringContaining("no longer linked") }] });
    expect(service.sessions.tree.nodes(sessionId).map(flat).filter(node => node.kind === "toolcall").map(node => node.outcome?.kind))
      .toEqual(["succeeded", "rejected"]);
  });
});

describe("插件包管理命令", () => {
  it("添加无效路径失败；有效包进入列表并标为重启后生效", async () => {
    const { service, root } = await setup();
    expect(() => service.execute({ type: "plugin.add", path: join(root, "missing") })).toThrow(/No package.json/);
    const dir = join(root, "pkg"); mkdirSync(dir);
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "p", atelier: { id: "acme.p", api: { major: 5, minMinor: 0 } } }));
    const added = service.execute({ type: "plugin.add", path: dir });
    expect(added.plugins.map(p => [p.source, p.status, p.enabled])).toEqual([[dir, "pending", true]]);
    expect(added.restartRequired).toBe(true);
    expect(service.execute({ type: "plugin.remove", index: 0 }).restartRequired).toBe(false);
  });
});
