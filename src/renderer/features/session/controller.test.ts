import { resourceCall } from "@atelier/sdk/contracts";
import { ContinueAgent } from "@atelier/builtin-api/contracts";
import { describe, expect, it, vi } from "vitest";
import { type SessionBridge, type SessionChanged, type SessionCommand, type SessionResult, type SessionSnapshot, type SessionProgress } from "../../../shared/session.ts";
import { SessionController } from "./controller.ts";
import { startLanguage, getI18n } from "../../shared/i18n.ts";
import { pluginNamespace, defineMessages } from "@atelier/sdk/contracts";
import type { LanguageState } from "../../../shared/language.ts";

function snapshot(revision: number, cursor: string | null = "current"): SessionSnapshot {
  return { sessionId: "s", title: "S", cursor, seq: 4, revision, nodes: [],
    workbench: { id: "s", title: "S", objects: [], links: [], views: [], viewport: { x: 0, y: 0, zoom: 1 } },
    progress: { revision, version: revision, runningObjectIds: [], unsettledObjectIds: [], live: [] } };
}
const accepted: SessionResult = { ok: true, reply: { kind: "accepted", sessionId: "s" } };
const view = (snapshot: SessionSnapshot): SessionResult => ({ ok: true, reply: { kind: "view", snapshot } });
async function flush() { for (let i = 0; i < 6; i++) await Promise.resolve(); }
function fixture(onRelease?: () => void) {
  let listener: ((event: SessionChanged) => void) | null = null;
  const requests: Array<{ command: SessionCommand; resolve: (result: SessionResult) => void }> = [];
  const bridge: SessionBridge = {
    execute: command => new Promise(resolve => requests.push({ command, resolve })),
    onChanged: callback => { listener = callback; return () => { if (listener === callback) listener = null; }; },
  };
  const controller = new SessionController(bridge, "s", onRelease);
  const notify = (revision: number) => listener?.({ kind: "session.changed", sessionId: "s", revision });
  const progress = (progress: SessionProgress) => listener?.({ kind: "session.progress", sessionId: "s", progress });
  return { controller, requests, notify, progress, subscribed: () => !!listener };
}

it("语言切换刷新静态文案，保留会话投影、活动与草稿提交身份且不重读会话", async () => {
  const { controller, requests } = fixture(), disconnect = controller.connect();
  const initial = snapshot(1); initial.progress.unsettledObjectIds = ["agent"];
  requests[0]!.resolve(view(initial)); await flush();
  const state = controller.getSnapshot(), progress = controller.getProgress();
  const label = pluginNamespace("example.counter").messages("en", defineMessages({ title: { id: "title", defaultMessage: "Counter" } })).title;
  let changed: (value: LanguageState) => void = () => {};
  const english: LanguageState = { preference: "en", locale: "en", interfaceLocale: "en" };
  const stop = await startLanguage([{ owner: "example.counter", locale: "zh-Hans", revision: "1", messages: { title: "计数器" } }], {
    get: async () => english, set: async () => english, onChanged: listener => { changed = listener; return () => { changed = () => {}; }; },
  });
  try {
    expect(getI18n().text(label)).toBe("Counter");
    changed({ preference: "zh-Hans", locale: "zh-Hans", interfaceLocale: "zh-Hans" });
    expect(getI18n().text(label)).toBe("计数器");
    expect(controller.getSnapshot()).toBe(state); expect(controller.getProgress()).toBe(progress);
    expect(progress.unsettledObjectIds).toEqual(["agent"]);
    expect(requests.map(request => request.command.type)).toEqual(["read"]);
  } finally { changed(english); stop(); disconnect(); }
});

describe("会话视图所有权", () => {
  it("观察命令等待受理后的读取，后续命令覆盖链接结果也能结束等待", async () => {
    const { controller, requests, notify } = fixture(); const disconnect = controller.connect();
    requests[0]!.resolve(view(snapshot(1))); await flush();
    const settled = vi.fn();
    const saved = controller.executeAndRead({ type: "link.set", sessionId: "s", agentId: "a", resourceId: "n", linked: true }).then(result => { settled(); return result; });
    await flush();
    notify(2); // 受理前已经开始的读取，不能结束观察。
    requests[1]!.resolve(accepted); await flush();
    const linked = snapshot(2); linked.workbench.links = [{ agentId: "a", resourceId: "n" }];
    requests[2]!.resolve(view(linked)); await flush();
    expect(settled).not.toHaveBeenCalled();
    const continued = controller.execute({ type: "resource.command", sessionId: "s", objectId: "a", command: resourceCall(ContinueAgent, { type: "continue" }) });
    await flush(); requests[4]!.resolve(accepted); await continued;
    requests[3]!.resolve(view(linked)); await flush(); // 已被继续操作使之过时。
    expect(settled).not.toHaveBeenCalled();
    requests[5]!.resolve(view(snapshot(3, "legal-ancestor"))); await flush();
    expect((await saved).ok).toBe(true);
    expect(controller.getSnapshot().snapshot?.workbench.links).toEqual([]);
    disconnect();
  });

  it.each(["error", "disconnect"] as const)("命令受理后 %s 会结束读取观察，不永久挂起保存", async action => {
    const { controller, requests } = fixture(); const disconnect = controller.connect();
    requests[0]!.resolve(view(snapshot(1))); await flush();
    const saved = controller.executeAndRead({ type: "link.set", sessionId: "s", agentId: "a", resourceId: "n", linked: true });
    await flush(); requests[1]!.resolve(accepted); await flush();
    if (action === "error") requests[2]!.resolve({ ok: false, error: { code: "unavailable", message: "Read failed.", display: "Read failed." } });
    else disconnect();
    expect((await saved).ok).toBe(true); // 受理结果与查询失败分别表达。
    if (action === "error") expect(controller.getSnapshot()).toMatchObject({ status: "error", readError: "Read failed." });
    disconnect();
  });

  it("命令受理后仍等待新投影，不能基于旧选择再次配置", async () => {
    const { controller, requests } = fixture(); const disconnect = controller.connect();
    requests[0]!.resolve(view(snapshot(1))); await flush();
    const command = { type: "resource.command" as const, sessionId: "s", objectId: "a",
      command: { id: "atelier.builtin/agent.configure", input: { type: "configure", selection: { agent: "worker", model: "new", thinking: null } } } };
    const changed = controller.execute(command); await flush();
    requests[1]!.resolve(accepted); await changed;
    expect(controller.getSnapshot()).toMatchObject({ busy: false, status: "loading" });
    expect((await controller.execute(command)).ok).toBe(false);
    expect(requests.filter(request => request.command.type === "resource.command")).toHaveLength(1);
    requests[2]!.resolve(view(snapshot(2))); await flush();
    expect(controller.getSnapshot().status).toBe("ready");
    disconnect();
  });

  it("就绪视图上同时入队的创建依次受理，后项等待前项的新投影", async () => {
    const { controller, requests } = fixture(); const disconnect = controller.connect();
    requests[0]!.resolve(view(snapshot(1))); await flush();
    const create = (path: string) => ({ type: "resource.create" as const, sessionId: "s", kind: "directory", creation: { id: "directory/create" }, input: { path }, position: { x: 0, y: 0 } });
    const first = controller.execute(create("/first"));
    const second = controller.execute(create("/second"));
    await flush();
    requests[1]!.resolve(accepted); expect((await first).ok).toBe(true);
    await flush();
    expect(requests.map(r => r.command.type)).toEqual(["read", "resource.create", "read"]);
    requests[2]!.resolve(view(snapshot(2))); await flush();
    expect(requests[3]!.command).toEqual(create("/second"));
    requests[3]!.resolve(accepted); expect((await second).ok).toBe(true);
    requests[4]!.resolve(view(snapshot(3))); await flush();
    disconnect();
  });

  it("排队创建等待的重读失败时保留错误并拒绝后项", async () => {
    const { controller, requests } = fixture(); const disconnect = controller.connect();
    requests[0]!.resolve(view(snapshot(1))); await flush();
    const command = { type: "resource.create" as const, sessionId: "s", kind: "note", creation: { id: "note/create" }, input: {}, position: { x: 0, y: 0 } };
    const first = controller.execute(command);
    const second = controller.execute(command);
    await flush(); requests[1]!.resolve(accepted); await first;
    requests[2]!.resolve({ ok: false, error: { code: "unavailable", message: "Read failed.", display: "Read failed." } });
    expect((await second).ok).toBe(false);
    expect(requests.filter(r => r.command.type === "resource.create")).toHaveLength(1);
    expect(controller.getSnapshot().status).toBe("error");
    expect(controller.getSnapshot().readError).toBe("Read failed.");
    disconnect();
  });

  it("创建排队等待同步时断开不会留下挂起命令", async () => {
    const { controller, requests } = fixture(); const disconnect = controller.connect();
    requests[0]!.resolve(view(snapshot(1))); await flush();
    const command = { type: "resource.create" as const, sessionId: "s", kind: "note", creation: { id: "note/create" }, input: {}, position: { x: 0, y: 0 } };
    const first = controller.execute(command);
    const second = controller.execute(command);
    await flush(); requests[1]!.resolve(accepted); await first; await flush();
    disconnect();
    expect((await second).ok).toBe(false);
    expect(requests.filter(r => r.command.type === "resource.create")).toHaveLength(1);
    disconnect();
  });

  // 工作台状态反馈：读取错误独立于命令回执，手动重试和后续通知恢复后撤下读取错误。
  it.each(["refresh", "notification"] as const)("读取失败保留画面并阻止基于旧数据操作，经 %s 恢复后清除读取错误", async recovery => {
    const { controller, requests, notify } = fixture(); const disconnect = controller.connect();
    requests[0]!.resolve(view(snapshot(1))); await flush();
    void controller.refresh();
    requests[1]!.resolve({ ok: false, error: { code: "unavailable", message: "Read failed.", display: "Read failed." } }); await flush();
    expect(controller.getSnapshot()).toMatchObject({ status: "error", snapshot: { cursor: "current" } });
    expect((await controller.execute({ type: "object.remove", sessionId: "s", objectId: "note" })).ok).toBe(false);
    if (recovery === "refresh") void controller.refresh();
    else notify(2);
    expect(requests.at(-1)!.command).toEqual({ type: "read", sessionId: "s" });
    requests.at(-1)!.resolve(view(snapshot(2))); await flush();
    expect(controller.getSnapshot()).toMatchObject({ status: "ready", readError: null });
    disconnect();
  });

  // 工作台反馈归属：操作失败只随本次回执交给发起者，共享视图只拥有自己的读取异常。
  it.each(["resource.create", "resource.command"] as const)("%s 失败只通过回执交付，重读前后均不保存为会话状态", async type => {
    const { controller, requests, notify } = fixture(); const disconnect = controller.connect();
    requests[0]!.resolve(view(snapshot(1))); await flush();
    const command = type === "resource.command"
      ? { type, sessionId: "s", objectId: "new-agent", command: resourceCall(ContinueAgent, { type: "continue" }) }
      : { type, sessionId: "s", kind: "atelier.builtin/agent", creation: { id: "atelier.builtin/agent.create" },
        input: {}, position: { x: 0, y: 0 } };
    const failed = controller.execute(command); await flush();
    const failure = { ok: false as const, error: { code: "model_unavailable", message: "The selected model is unavailable.", display: "Model unavailable." } };
    requests[1]!.resolve(failure);
    expect(await failed).toEqual(failure);
    expect(controller.getSnapshot()).not.toHaveProperty("error");
    expect(controller.getSnapshot().readError).toBeNull();
    requests[2]!.resolve(view(snapshot(1))); await flush();
    expect(controller.getSnapshot()).toMatchObject({ status: "ready", readError: null });
    notify(2);
    requests[3]!.resolve({ ok: false, error: { code: "unavailable", message: "Read failed.", display: "Read failed." } }); await flush();
    expect(controller.getSnapshot()).toMatchObject({ status: "error", readError: "Read failed." });
    disconnect();
  });

  // 时间线契约：只有 select 移动执行游标；命令前的读取不得覆盖新位置。
  it("游标跳转受理后重读当前状态，旧查询不能覆盖新位置", async () => {
    const { controller, requests, notify } = fixture(); const disconnect = controller.connect();
    requests[0]!.resolve(view(snapshot(1))); await flush();
    notify(2);
    const selected = controller.branchFrom("branch"); await flush();
    expect(requests[2]!.command).toEqual({ type: "select", sessionId: "s", nodeId: "branch" });
    requests[2]!.resolve(accepted); await selected;
    expect(requests[3]!.command).toEqual({ type: "read", sessionId: "s" });
    requests[3]!.resolve(view(snapshot(3, "branch"))); await flush();
    requests[1]!.resolve(view(snapshot(2))); await flush();
    expect(controller.getSnapshot()).toMatchObject({ snapshot: { cursor: "branch", revision: 3 } });
    disconnect();
  });

  it("查询途中合并通知，迟到计量在节点序号不变时仍可更新", async () => {
    const { controller, requests, notify } = fixture(); const disconnect = controller.connect();
    notify(2); notify(3);
    requests[0]!.resolve(view(snapshot(1))); await flush();
    expect(requests).toHaveLength(2);
    requests[1]!.resolve(view(snapshot(3))); await flush();
    notify(4); requests[2]!.resolve(view(snapshot(4))); await flush();
    expect(controller.getSnapshot().snapshot).toMatchObject({ seq: 4, revision: 4 });
    disconnect();
  });

  it("流增量只通知进度订阅者，不查询历史或刷新画布", async () => {
    const { controller, requests, progress } = fixture(); const disconnect = controller.connect();
    requests[0]!.resolve(view(snapshot(1))); await flush();
    const changed = vi.fn(); const streamed = vi.fn();
    controller.subscribe(changed); controller.subscribeProgress(streamed);
    progress({ revision: 1, version: 2, runningObjectIds: [], unsettledObjectIds: ["a"], live: [] });
    progress({ revision: 1, version: 3, runningObjectIds: [], unsettledObjectIds: ["a"], live: [] });
    expect(changed).not.toHaveBeenCalled();
    expect(streamed).toHaveBeenCalled();
    expect(controller.getProgress().version).toBe(3);
    expect(requests).toHaveLength(1);
    disconnect();
  });

  it("块落库后的进度等待对应持久版本，不在查询途中丢掉正在阅读的块", async () => {
    const { controller, requests, progress } = fixture(); const disconnect = controller.connect();
    const block = { id: "r:0", objectId: "a", responseId: "r", ordinal: 0, kind: "thinking" as const, text: "thinking", startedAt: 1000, endedAt: null };
    requests[0]!.resolve(view({ ...snapshot(1), progress: { revision: 1, version: 1, runningObjectIds: ["a"], unsettledObjectIds: ["a"], live: [block] } })); await flush();
    progress({ revision: 2, version: 3, runningObjectIds: ["a"], unsettledObjectIds: ["a"], live: [] });
    expect(controller.getProgress().live).toEqual([block]);
    expect(requests).toHaveLength(2);
    requests[1]!.resolve(view(snapshot(2))); await flush();
    expect(controller.getProgress()).toMatchObject({ version: 3, live: [] });
    progress({ revision: 1, version: 1, runningObjectIds: ["a"], unsettledObjectIds: ["a"], live: [block] });
    expect(controller.getProgress().live).toEqual([]);
    disconnect();
  });

  it("最后一个查看者断开才退订，重新打开读取恢复且不取消执行", async () => {
    const { controller, requests, notify } = fixture();
    const a = controller.connect(); const b = controller.connect();
    requests[0]!.resolve(view(snapshot(1))); await flush();
    a(); notify(2); expect(requests).toHaveLength(2);
    b(); notify(5); expect(requests).toHaveLength(2);
    const reopened = controller.connect(); expect(requests).toHaveLength(3);
    requests[2]!.resolve(view(snapshot(5))); await flush();
    requests[1]!.resolve(view(snapshot(2))); await flush();
    expect(controller.getSnapshot().snapshot?.revision).toBe(5);
    expect(requests.every(request => request.command.type === "read")).toBe(true);
    reopened();
  });

});

describe("离开会话释放前端视图", () => {
  function released() {
    const release = vi.fn();
    return { ...fixture(release), release };
  }

  it("最后一个连接断开且没有在途命令时释放", async () => {
    const { controller, requests, release, subscribed } = released();
    const first = controller.connect(), second = controller.connect();
    requests[0]!.resolve(view(snapshot(1))); await flush();
    first(); await flush();
    expect(release).not.toHaveBeenCalled(); // 仍有其他使用者
    second(); await flush();
    expect(subscribed()).toBe(false);
    expect(release).toHaveBeenCalledOnce();
  });

  it("同步重连（StrictMode 重放 effect）不释放", async () => {
    const { controller, release } = released();
    controller.connect()();
    const disconnect = controller.connect();
    await flush();
    expect(release).not.toHaveBeenCalled();
    disconnect();
  });

  it("在途命令收束后才释放，命令仍由同一控制器串行", async () => {
    const { controller, requests, release } = released();
    const disconnect = controller.connect();
    requests[0]!.resolve(view(snapshot(1))); await flush();
    const result = controller.execute({ type: "rename", sessionId: "s", title: "T" });
    await flush();
    disconnect(); await flush();
    expect(release).not.toHaveBeenCalled();
    requests[1]!.resolve(accepted);
    await expect(result).resolves.toEqual(accepted); await flush();
    expect(release).toHaveBeenCalledOnce();
  });
});
