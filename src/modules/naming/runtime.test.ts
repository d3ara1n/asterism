import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineModule, type PluginContext } from "@atelier/sdk/runtime";
import type { ModelEvent, StreamRequest } from "@atelier/sdk/contracts";
import { ApplicationService } from "../../runtime/service.ts";
import * as runtimeModules from "../runtime.ts";
import { loadPlugins } from "../../plugins/loader.ts";
import { Agent, CreateAgent } from "../agent/contract.ts";
import { Execution, UserMessage } from "../agent/records.ts";
import { SessionNamed } from "./records.ts";

const roots: string[] = [], services: ApplicationService[] = [];
afterEach(async () => {
  for (const service of services.splice(0)) await service.close();
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
async function* title(text: string, reason = "stop"): AsyncIterable<ModelEvent> {
  yield { type: "part.start", part: { id: "thinking", kind: "thinking" } };
  yield { type: "part.delta", partId: "thinking", delta: "Do not put reasoning in the title." };
  yield { type: "part.end", partId: "thinking" };
  yield { type: "part.start", part: { id: "title", kind: "text" } };
  yield { type: "part.delta", partId: "title", delta: text };
  yield { type: "part.end", partId: "title" };
  yield { type: "finish", reason, usage: null };
}
async function open(stream: (request: StreamRequest) => AsyncIterable<ModelEvent>) {
  let context!: PluginContext;
  const requests: StreamRequest[] = [];
  vi.spyOn(runtimeModules, "createModules").mockImplementation((host, external = []) => loadPlugins([
    { ...runtimeModules.corePlugin, modules: [...runtimeModules.corePlugin.modules, defineModule(plugin => {
      context = plugin; return {};
    })] }, ...external,
  ], { ...host, models: { ...host.models,
    list: () => [{ model: "test/model", provider: "test", name: "Test", contextWindow: null,
      capabilities: { tools: false, reasoning: false } }],
    roles: () => [{ id: "utility", name: "Utility", description: "Naming", hidden: true, model: "test/model", thinking: null }],
    stream: request => { requests.push(request); return stream(request); },
  } }));
  const root = mkdtempSync(join(tmpdir(), "atelier-naming-")); roots.push(root);
  const service = new ApplicationService(root); services.push(service);
  const sessionId = service.sessions.tree.create("Temporary");
  await service.sessions.execute({ type: "resource.create", sessionId, kind: Agent.kind,
    creation: { id: CreateAgent.id }, input: { selection: { agent: "worker", model: "test/model", thinking: null } }, position: { x: 0, y: 0 } });
  const agentId = service.sessions.snapshot(sessionId).workbench.objects[0]!.id;
  const object = context.object(sessionId, Agent, agentId);
  const session = context.session(sessionId);
  const submit = (text: string) => {
    let id!: string;
    object.commit(writer => { id = writer.append(UserMessage, { parts: [{ kind: "text", text }] }); });
    messages.push(id); return id;
  };
  const submitBatch = (texts: string[]) => {
    object.commit(writer => { for (const text of texts) messages.push(writer.append(UserMessage, { parts: [{ kind: "text", text }] })); });
  };
  const reply = (text: string) => {
    const origin = session.snapshot().position.nodeId;
    object.commit(writer => { writer.append(Execution, { type: "block", block: {
      kind: "text", text, complete: true, responseId: crypto.randomUUID(), requestParentId: origin, ordinal: 0,
      continuation: null, source: { model: "test", adapter: "test", scope: "test" },
    } }); });
  };
  const messages: string[] = [];
  const idle = async () => { await vi.waitFor(() => {
    for (const id of messages) expect(context.tasks.has(`naming:${sessionId}:${id}`)).toBe(false);
  }); };
  return { context, service, session, sessionId, agentId, requests, submit, submitBatch, reply, idle };
}

describe("两级自动命名", () => {
  it("首批多条用户消息仍以第一条执行一级命名，每批只安排一次", async () => {
    const test = await open(() => title("Opening title"));
    test.submitBatch(["Opening request", "Additional request"]); await test.idle();
    expect(test.requests).toHaveLength(1);
    expect(test.requests[0]!.messages[0]).toMatchObject({ parts: [{ kind: "text", text: expect.stringContaining("Opening request") }] });
    expect(test.requests[0]!.messages[0]).toMatchObject({ parts: [{ kind: "text", text: expect.not.stringContaining("Additional request") }] });
    expect(test.session.snapshot().records.last(SessionNamed, { scope: "session" })).toMatchObject({ data: { source: "auto", auto: { level: "initial", model: "test/model" } } });
  });

  it("只在用户输入节点命名，二级包含已有收尾回复，来源事件只追加且不发送模型", async () => {
    let calls = 0;
    const test = await open(() => title(++calls === 1 ? '<title>Title: “修复登录”</title>' : "完善 token 刷新"));
    test.submit("检查登录问题"); await test.idle();
    expect(test.session.title.get()).toBe("修复登录");
    test.reply("调查中"); test.reply("找到了 token 过期原因"); await test.idle();
    expect(test.requests).toHaveLength(1);
    for (let i = 2; i <= 5; i++) { test.submit(`请求 ${i}`); if (i < 5) test.reply(`完成 ${i}`); }
    await test.idle();
    expect(test.requests).toHaveLength(2);
    expect(test.requests[1]!.messages[0]).toMatchObject({ parts: [{ kind: "text", text: expect.stringContaining("找到了 token 过期原因") }] });
    expect(test.requests[1]!.messages[0]).toMatchObject({ parts: [{ kind: "text", text: expect.stringContaining("请求 5") }] });
    const snapshot = test.session.snapshot();
    expect(snapshot.records.query(SessionNamed, { scope: "session" }).map(value => value.status === "known" && value.data))
      .toMatchObject([{ title: "修复登录", source: "auto", auto: { level: "initial", model: "test/model" } },
        { title: "完善 token 刷新", source: "auto", auto: { level: "refined", model: "test/model" } }]);
    expect(test.session.title.get()).toBe("完善 token 刷新");
    expect(test.service.sessions.tree.nodes(test.sessionId).filter(node =>
      node.contract === SessionNamed.id).every(node => node.model === null)).toBe(true);
  });

  it("用户命名即使文字相同也阻止在途结果和后续自动命名，跨分支仍保护会话标题", async () => {
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const test = await open(async function* () { await held; yield* title("Automatic"); });
    const first = test.submit("First");
    try {
      await vi.waitFor(() => expect(test.requests).toHaveLength(1));
      test.session.commit(writer => {
        test.session.title.propose("Temporary", { expected: "Temporary" });
        writer.append(SessionNamed, { title: "Temporary", source: "user" });
      });
    } finally { release(); }
    await test.idle();
    expect(test.session.title.get()).toBe("Temporary");
    await test.service.sessions.execute({ type: "select", sessionId: test.sessionId, nodeId: first });
    for (let i = 2; i <= 5; i++) test.submit(`Branch ${i}`);
    await test.idle();
    expect(test.requests).toHaveLength(1);
    expect(test.session.snapshot().records.last(SessionNamed, { scope: "session" })).toMatchObject({ data: { source: "user" } });
  });

  it("任务等待启动时已被用户同名命名，短路且不发送模型请求", async () => {
    const test = await open(() => title("Automatic"));
    test.submit("First");
    test.session.commit(writer => {
      test.session.title.propose("Temporary", { expected: "Temporary" });
      writer.append(SessionNamed, { title: "Temporary", source: "user" });
    });
    await test.idle();
    expect(test.requests).toHaveLength(0);
    expect(test.session.title.get()).toBe("Temporary");
    expect(test.session.snapshot().records.query(SessionNamed, { scope: "session" })).toHaveLength(1);
  });

  it("后发二级请求胜过迟到的一级结果，旧结果不留下生效事件", async () => {
    let release!: () => void, calls = 0;
    const held = new Promise<void>(resolve => { release = resolve; });
    const test = await open(async function* () {
      if (++calls === 1) { await held; yield* title("Old initial"); }
      else yield* title("New refined");
    });
    test.submit("First");
    try {
      await vi.waitFor(() => expect(test.requests).toHaveLength(1));
      for (let i = 2; i <= 5; i++) test.submit(`Request ${i}`);
      await vi.waitFor(() => expect(test.session.title.get()).toBe("New refined"));
    } finally { release(); }
    await test.idle();
    expect(test.session.snapshot().records.query(SessionNamed, { scope: "session" })).toHaveLength(1);
    expect(test.session.title.get()).toBe("New refined");
  });

  it.each(["error", "length"])("带正文但终态为 %s 的命名不应用，后续节点仍可重命名", async reason => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    let calls = 0;
    const test = await open(() => ++calls === 1 ? title("Incomplete", reason) : title("Later title"));
    test.submit("First"); await test.idle();
    expect(test.session.title.get()).toBe("Temporary");
    expect(test.session.snapshot().records.last(SessionNamed, { scope: "session" })).toBeNull();
    for (let i = 2; i <= 5; i++) test.submit(`Request ${i}`);
    await test.idle();
    expect(test.session.title.get()).toBe("Later title");
    expect(log).toHaveBeenCalled();
  });
});
