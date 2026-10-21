import { describe, expect, it, vi } from "vitest";
import { resourceCall } from "@atelier/sdk/contracts";
import { ContinueAgent } from "@atelier/builtin-api/contracts";
import type { SessionBridge, SessionChanged, SessionCommand, SessionResult, SessionData } from "../../../shared/session.ts";
import { SessionController } from "./controller.ts";

function data(): SessionData {
  return { sessionId: "s", title: "Session", cursor: null, nodes: [],
    workbench: { id: "s", title: "Session", objects: [], links: [], views: [], viewport: { x: 0, y: 0, zoom: 1 } },
    progress: { busyObjectIds: [], timelineBusy: false, live: [] } };
}
const accepted: SessionResult = { ok: true, reply: { kind: "accepted", sessionId: "s" } };
async function flush() { for (let i = 0; i < 6; i++) await Promise.resolve(); }
function fixture() {
  let listener: (event: SessionChanged) => void = () => {};
  const requests: Array<{ command: SessionCommand; resolve(result: SessionResult): void }> = [];
  const release = vi.fn();
  const bridge: SessionBridge = {
    execute: command => new Promise(resolve => requests.push({ command, resolve })),
    onChanged: callback => { listener = callback; return () => {}; },
  };
  const controller = new SessionController(bridge, "s", release);
  const notify = (event: SessionChanged) => listener(event);
  const open = (initial = data()) => {
    const disconnect = controller.connect();
    notify({ kind: "session.opened", sessionId: "s", data: initial });
    requests.at(-1)!.resolve(accepted);
    return disconnect;
  };
  return { controller, requests, notify, open, release, listener: () => listener };
}
const command = (objectId: string) => ({ type: "resource.command" as const, sessionId: "s", objectId, command: resourceCall(ContinueAgent, {}) });

// docs/workbench.md：打开后直接接收当前数据变化，局部操作不读取完整历史或改变工作台加载状态。
describe("会话当前数据", () => {
  it("资源变化只替换对应对象，动作回执不发起读取", async () => {
    const f = fixture(), initial = data();
    const object = (id: string) => ({ id, kind: "test/resource", title: id, presentation: { contract: { id: "test/view" }, data: { mode: "none" } } });
    initial.workbench.objects = [object("a"), object("b")];
    const disconnect = f.open(initial);
    const before = f.controller.getSnapshot().data!;
    const pending = f.controller.execute(command("a"));
    expect(f.controller.getSnapshot().status).toBe("ready");
    const changed = { ...initial.workbench.objects[0]!, presentation: { contract: { id: "test/view" }, data: { mode: "follow" } } };
    f.notify({ kind: "session.changed", sessionId: "s", nodes: [], cursor: null, title: "Session", objects: [changed] });
    f.requests[1]!.resolve(accepted); await pending;
    const after = f.controller.getSnapshot().data!;
    expect(after.nodes).toBe(before.nodes);
    expect(after.workbench.objects[0]).toBe(changed);
    expect(after.workbench.objects[1]).toBe(before.workbench.objects[1]);
    expect(f.requests.map(item => item.command.type)).toEqual(["watch", "resource.command"]);
    disconnect();
  });

  it("不同对象的调用不互相等待，失败只交给发起入口", async () => {
    const f = fixture(), disconnect = f.open();
    const a = f.controller.execute(command("a")), b = f.controller.execute(command("b"));
    expect(f.requests).toHaveLength(3);
    f.requests[2]!.resolve(accepted); expect((await b).ok).toBe(true);
    const failure: SessionResult = { ok: false, error: { code: "invalid_request", message: "Invalid input." } };
    f.requests[1]!.resolve(failure); expect(await a).toEqual(failure);
    expect(f.controller.getSnapshot()).toMatchObject({ status: "ready", readError: null });
    disconnect();
  });

  it("初始数据之后的变化直接生效，不比较版本或丢弃后重读", () => {
    const f = fixture(), disconnect = f.open();
    f.notify({ kind: "session.changed", sessionId: "s", nodes: [], cursor: null, title: "Renamed", objects: [] });
    f.notify({ kind: "session.progress", sessionId: "s", progress: { busyObjectIds: ["a"], timelineBusy: false, live: [] } });
    expect(f.controller.getSnapshot().data?.title).toBe("Renamed");
    expect(f.controller.getProgress().busyObjectIds).toEqual(["a"]);
    expect(f.requests).toHaveLength(1);
    disconnect();
  });

  // docs/timeline.md：成型记录先交付，随后移除对应流式块；保存节点不丢失。
  it("历史追加与流式块结束按消息顺序交付", () => {
    const f = fixture(), disconnect = f.open();
    const block = { id: "r:0", objectId: "a", responseId: "r", ordinal: 0, kind: "text" as const, text: "Hello", endedAt: null };
    f.notify({ kind: "session.progress", sessionId: "s", progress: { busyObjectIds: ["a"], timelineBusy: false, live: [block] } });
    const node = { id: "n", sessionId: "s", parentId: null, createdAt: "now", source: null, contract: "test/text", data: { text: "Hello" }, model: null, recipient: null };
    f.notify({ kind: "session.changed", sessionId: "s", nodes: [node], cursor: "n", title: "Session", objects: [] });
    expect(f.controller.getSnapshot().data?.nodes).toEqual([node]);
    f.notify({ kind: "session.progress", sessionId: "s", progress: { busyObjectIds: [], timelineBusy: false, live: [] } });
    expect(f.controller.getProgress().live).toEqual([]);
    expect(f.controller.getSnapshot().data?.nodes).toEqual([node]);
    disconnect();
  });

  it("回溯只在调用期间阻止旧路径操作，目标数据由变化消息交付", async () => {
    const f = fixture(), disconnect = f.open();
    const selected = f.controller.branchFrom(null);
    expect(f.controller.getSnapshot().navigating).toBe(true);
    const current = data();
    f.notify({ kind: "session.changed", sessionId: "s", nodes: [], cursor: null, title: "Session", objects: [], workbench: current.workbench });
    f.requests[1]!.resolve(accepted); await selected;
    expect(f.controller.getSnapshot()).toMatchObject({ status: "ready", navigating: false });
    expect(f.requests.map(item => item.command.type)).toEqual(["watch", "select"]);
    disconnect();
  });

  // docs/workbench.md：卸载取消接收旧结果，重开只认新连接的数据。
  it("断开后迟到的打开结果不影响新连接", async () => {
    const f = fixture();
    const oldDisconnect = f.controller.connect(), oldListener = f.listener();
    oldDisconnect();
    const disconnect = f.open();
    oldListener({ kind: "session.opened", sessionId: "s", data: { ...data(), title: "Old" } });
    f.requests[0]!.resolve({ ok: false, error: { code: "unavailable", message: "Old request failed." } }); await flush();
    expect(f.controller.getSnapshot()).toMatchObject({ status: "ready", readError: null, data: { title: "Session" } });
    disconnect();
  });

  it("打开失败独立反馈，主动重试重新取得当前数据", async () => {
    const f = fixture(), disconnect = f.controller.connect();
    f.requests[0]!.resolve({ ok: false, error: { code: "not_found", message: "Missing session." } }); await flush();
    expect(f.controller.getSnapshot()).toMatchObject({ status: "error", missing: true });
    const retry = f.controller.refresh();
    f.notify({ kind: "session.opened", sessionId: "s", data: data() });
    f.requests[1]!.resolve(accepted); await retry;
    expect(f.controller.getSnapshot()).toMatchObject({ status: "ready", readError: null, missing: false });
    disconnect();
  });

  it("最后一个查看者断开后退订，在途调用结束再释放", async () => {
    const f = fixture(), a = f.open(), b = f.controller.connect();
    const pending = f.controller.execute(command("a"));
    a(); expect(f.requests.map(item => item.command.type)).not.toContain("unwatch");
    b(); await flush(); expect(f.release).not.toHaveBeenCalled();
    f.requests[1]!.resolve(accepted); await pending; await flush();
    expect(f.release).toHaveBeenCalledOnce();
    expect(f.requests.at(-1)?.command.type).toBe("unwatch");
  });
});
