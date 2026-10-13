import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineModule, type PluginContext } from "@atelier/sdk/runtime";
import type { ModelEvent, StreamRequest } from "@atelier/sdk/contracts";
import { ApplicationService } from "../../runtime/service.ts";
import * as runtimeModules from "../runtime.ts";
import * as pluginLoader from "../../plugins/loader.ts";
import { Agent, CreateAgent } from "../agent/contract.ts";
import { Execution, UserMessage } from "../agent/records.ts";
import { SessionNamed } from "./records.ts";

const roots: string[] = [], services: ApplicationService[] = [];
const loadPlugins = pluginLoader.loadPlugins;
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
  const assembly = vi.spyOn(runtimeModules, "createModules");
  vi.spyOn(pluginLoader, "loadPlugins").mockImplementation(([core, ...external], host) => loadPlugins([
    { ...core!, modules: [...core!.modules, defineModule(plugin => {
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
  const rename = (title: string) => service.sessions.execute({ type: "rename", sessionId, title });
  const naming = (assembly.mock.results.at(-1)!.value as ReturnType<typeof runtimeModules.createModules>).naming;
  return { context, service, root, naming, session, sessionId, agentId, requests, submit, submitBatch, reply, idle, rename };
}

describe("人工命名入口", () => {
  // 命名契约：用户保存只追加一条具 core 身份的会话记录，标题由观察者同步；无效输入不留下事实。
  it("应用入口保存正规来源和规范化标题，无效输入不修改历史，重开保留标题与事件", async () => {
    const test = await open(() => title("Unused"));
    const before = test.service.sessions.tree.nodes(test.sessionId);
    await test.rename("  我的\t会话  ");
    const nodes = test.service.sessions.tree.nodes(test.sessionId);
    expect(nodes).toHaveLength(before.length + 1);
    expect(nodes.at(-1)).toMatchObject({
      contract: SessionNamed.id, source: { plugin: "atelier.core", resource: null },
      data: { title: "我的 会话", source: "user" }, model: null,
    });
    expect(test.session.title.get()).toBe("我的 会话");
    for (const invalid of [" \t ", "x".repeat(161)]) {
      await expect(test.rename(invalid)).rejects.toMatchObject({ code: "invalid_request" });
    }
    expect(test.service.sessions.tree.nodes(test.sessionId)).toEqual(nodes);
    services.splice(services.indexOf(test.service), 1);
    await test.service.close();
    const reopened = new ApplicationService(test.root); services.push(reopened);
    expect(reopened.sessions.tree.title(test.sessionId)).toBe("我的 会话");
    expect(reopened.sessions.tree.nodes(test.sessionId)).toEqual(nodes);
  });

  // 装配契约：每份接口捕获本运行时的 context，关闭开始即停止接受新调用。
  it("两个运行时各自持有写入身份，关闭一个不影响另一个", async () => {
    const first = await open(() => title("Unused"));
    const second = await open(() => title("Unused"));
    first.naming.nameByUser(first.sessionId, "First runtime");
    second.naming.nameByUser(second.sessionId, "Second runtime");
    expect(first.session.title.get()).toBe("First runtime");
    expect(second.session.title.get()).toBe("Second runtime");
    services.splice(services.indexOf(first.service), 1);
    const closing = first.service.close();
    expect(() => first.naming.nameByUser(first.sessionId, "Closed")).toThrow("Session naming is unavailable.");
    await closing;
    second.naming.nameByUser(second.sessionId, "Still available");
    expect(second.session.title.get()).toBe("Still available");
  });

  // 插件装配契约：命名 setup 成功后其余模块失败，也不能泄漏可调用的半初始化接口。
  it("core 后续模块装配失败时拒绝人工命名，不覆盖标题或追加记录", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(pluginLoader, "loadPlugins").mockImplementation(([core, ...external], host) => loadPlugins([
      { ...core!, modules: [...core!.modules, defineModule(() => { throw new Error("Setup failed."); })] },
      ...external,
    ], host));
    const root = mkdtempSync(join(tmpdir(), "atelier-naming-failed-")); roots.push(root);
    const service = new ApplicationService(root); services.push(service);
    const sessionId = service.sessions.tree.create("Unchanged");
    await expect(service.sessions.execute({ type: "rename", sessionId, title: "Rejected" })).rejects.toMatchObject({ code: "unavailable" });
    expect(service.sessions.tree.title(sessionId)).toBe("Unchanged");
    expect(service.sessions.tree.nodes(sessionId)).toEqual([]);
  });
});

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

  it("用户同名事件阻止在途结果和当前路径的自动命名，旁支不继承保护", async () => {
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const test = await open(async function* () { await held; yield* title("Automatic"); });
    const first = test.submit("First");
    try {
      await vi.waitFor(() => expect(test.requests).toHaveLength(1));
      await test.rename("First");
    } finally { release(); }
    await test.idle();
    expect(test.session.title.get()).toBe("First");
    const manual = test.session.snapshot().records.last(SessionNamed, { scope: "timeline" })!.record;
    for (let i = 2; i <= 5; i++) test.submit(`Protected ${i}`);
    await test.idle();
    expect(test.requests).toHaveLength(1);
    await test.service.sessions.execute({ type: "select", sessionId: test.sessionId, nodeId: first });
    for (let i = 2; i <= 5; i++) test.submit(`Branch ${i}`);
    await test.idle();
    expect(test.requests).toHaveLength(2);
    expect(test.session.title.get()).toBe("Automatic");
    expect(test.session.snapshot().records.last(SessionNamed, { scope: "timeline" })).toMatchObject({ data: { source: "auto" } });
    await test.service.sessions.execute({ type: "select", sessionId: test.sessionId, nodeId: manual.id });
    expect(test.session.title.get()).toBe("First");
    expect(test.requests).toHaveLength(2);
  });

  it("任务等待启动时已被用户同名命名，短路且不发送模型请求", async () => {
    const test = await open(() => title("Automatic"));
    test.submit("First");
    await test.rename("First");
    await test.idle();
    expect(test.requests).toHaveLength(0);
    expect(test.session.title.get()).toBe("First");
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
    expect(test.session.title.get()).toBe("First");
    expect(test.session.snapshot().records.last(SessionNamed, { scope: "session" })).toBeNull();
    for (let i = 2; i <= 5; i++) test.submit(`Request ${i}`);
    await test.idle();
    expect(test.session.title.get()).toBe("Later title");
    expect(log).toHaveBeenCalled();
  });

  // 预期来自命名回溯规则：标题取执行路径最新命名；没有命名时取当前时间线首条输入的 72 单位截断，两者都没有时保持不变。
  it("仅追加命名事件即可更新标题，读取不更新，回溯与分支切换不追加恢复事件", async () => {
    const test = await open(() => title("Generated"));
    const opening = `  ${"首条用户消息".repeat(20)}  `;
    const fallback = "首条用户消息".repeat(20).slice(0, 72);
    const first = test.submit(opening);
    expect(test.session.title.get()).toBe(fallback);
    await test.idle();
    const generated = test.session.snapshot().records.last(SessionNamed, { scope: "timeline" })!.record;
    await test.rename("Manual");
    const manual = test.session.snapshot().records.last(SessionNamed, { scope: "timeline" })!.record.id;
    expect(test.session.title.get()).toBe("Manual");
    const original = test.service.sessions.tree.nodes(test.sessionId);
    const select = (nodeId: string | null) => test.service.sessions.execute({ type: "select", sessionId: test.sessionId, nodeId });
    const current = test.service.sessions.snapshot(test.sessionId);
    expect(current.title).toBe("Manual");
    expect(test.session.snapshot().position.nodeId).toBe(manual);
    await select(generated.id);
    expect(test.session.title.get()).toBe("Generated");
    await select(first);
    expect(test.session.title.get()).toBe(fallback);
    await select(null);
    expect(test.session.title.get()).toBe(fallback);
    expect(test.service.sessions.tree.nodes(test.sessionId)).toEqual(original);
    await select(first);
    await test.rename("Branch");
    const branch = test.session.snapshot().records.last(SessionNamed, { scope: "timeline" })!.record.id;
    expect(test.session.title.get()).toBe("Branch");
    await select(manual);
    expect(test.session.title.get()).toBe("Manual");
    await select(branch);
    expect(test.session.title.get()).toBe("Branch");
    expect(test.service.sessions.tree.nodes(test.sessionId)).toHaveLength(original.length + 1);
    expect(test.requests).toHaveLength(1);
    expect(test.service.execute({ type: "workspace.read" }).sessions.find(session => session.id === test.sessionId)?.title).toBe("Branch");
  });

  it("命名请求期间回溯到不含触发输入的位置，迟到结果不进入新路径", async () => {
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const test = await open(async function* () { await held; yield* title("Stale"); });
    test.submit("First");
    try {
      await vi.waitFor(() => expect(test.requests).toHaveLength(1));
      await test.service.sessions.execute({ type: "select", sessionId: test.sessionId, nodeId: null });
    } finally { release(); }
    await test.idle();
    expect(test.session.snapshot().position.nodeId).toBeNull();
    expect(test.session.title.get()).toBe("First");
    expect(test.session.snapshot().records.query(SessionNamed, { scope: "session" })).toEqual([]);
  });
});
