import { describe, expect, it, vi } from "vitest";
import { resourceCall } from "@asterism-app/sdk/contracts";
import { ContinueAgent } from "@asterism-app/builtin-api/contracts";
import type { SessionBridge, SessionChanged, SessionCommand, SessionResult, SessionData } from "../../../shared/session.ts";
import { SessionController } from "./controller.ts";

function data(): SessionData {
  return { sessionId: "s", title: "Session", cursor: null, nodes: [],
    workbench: { id: "s", title: "Session", objects: [], links: [], views: [], viewport: { x: 0, y: 0, zoom: 1 }, focus: { objectId: null, width: null } },
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

// After opening, receive current data changes directly; local operations neither read complete history nor change workbench loading state.
describe("Current session data", () => {
  it("resource changes replace only the corresponding object, and action receipts do not initiate reads", async () => {
    const f = fixture(), initial = data();
    const object = (id: string) => ({ id, kind: "test/resource", title: id, presentation: { contract: { id: "test/view" }, data: { mode: "none" } }, receivesLinks: false });
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

  it("calls for different objects do not wait for one another, and failures reach only the initiating entry", async () => {
    const f = fixture(), disconnect = f.open();
    const a = f.controller.execute(command("a")), b = f.controller.execute(command("b"));
    expect(f.requests).toHaveLength(3);
    f.requests[2]!.resolve(accepted); expect((await b).ok).toBe(true);
    const failure: SessionResult = { ok: false, error: { code: "invalid_request", message: "Invalid input." } };
    f.requests[1]!.resolve(failure); expect(await a).toEqual(failure);
    expect(f.controller.getSnapshot()).toMatchObject({ status: "ready", readError: null });
    disconnect();
  });

  it("applies changes directly after initial data without comparing versions or discarding and rereading", () => {
    const f = fixture(), disconnect = f.open();
    f.notify({ kind: "session.changed", sessionId: "s", nodes: [], cursor: null, title: "Renamed", objects: [] });
    f.notify({ kind: "session.progress", sessionId: "s", busyObjectIds: ["a"], timelineBusy: false, live: null });
    expect(f.controller.getSnapshot().data?.title).toBe("Renamed");
    expect(f.controller.getActivity().busyObjectIds).toEqual(["a"]);
    expect(f.requests).toHaveLength(1);
    disconnect();
  });

  // Deliver finalized records first, then remove the corresponding streaming blocks; saved nodes are not lost.
  it("delivers history appends and streaming block endings in message order", () => {
    const f = fixture(), disconnect = f.open();
    const block = { id: "r:0", objectId: "a", responseId: "r", ordinal: 0, kind: "text" as const, text: "Hello", endedAt: null };
    f.notify({ kind: "session.progress", sessionId: "s", busyObjectIds: ["a"], timelineBusy: false, live: { order: [block.id], changes: [{ id: block.id, kind: "put", block }] } });
    const node = { id: "n", sessionId: "s", parentId: null, createdAt: "now", source: null, contract: "test/text", data: { text: "Hello" }, model: null, recipient: null };
    f.notify({ kind: "session.changed", sessionId: "s", nodes: [node], cursor: "n", title: "Session", objects: [] });
    expect(f.controller.getSnapshot().data?.nodes).toEqual([node]);
    f.notify({ kind: "session.progress", sessionId: "s", busyObjectIds: [], timelineBusy: false, live: { order: [], changes: [] } });
    expect(f.controller.liveOf("a")).toEqual([]);
    expect(f.controller.getSnapshot().data?.nodes).toEqual([node]);
    disconnect();
  });

  // Streaming progress: input-phase tool arguments are transmitted only as argumentsText deltas, and the frontend derives previews; only appended argument text is sent.
  it("derives input-phase tool arguments on the frontend from appended argument text, then uses complete backend arguments upon entering ready", () => {
    const f = fixture(), disconnect = f.open();
    const block = { id: "r:0", objectId: "a", responseId: "r", ordinal: 0, kind: "toolcall" as const, name: "write", argumentsText: '{"path":"a.txt","content":"hel',
      arguments: null, state: "input" as const, invocation: null, result: null };
    f.notify({ kind: "session.progress", sessionId: "s", busyObjectIds: ["a"], timelineBusy: false, live: { order: [block.id], changes: [{ id: block.id, kind: "put", block }] } });
    expect(f.controller.liveOf("a")[0]).toMatchObject({ arguments: { path: "a.txt", content: "hel" } });
    f.notify({ kind: "session.progress", sessionId: "s", busyObjectIds: ["a"], timelineBusy: false, live: { order: [block.id], changes: [{ id: block.id, kind: "update", ops: [{ path: ["argumentsText"], append: 'lo"}' }] }] } });
    expect(f.controller.liveOf("a")[0]).toMatchObject({ argumentsText: '{"path":"a.txt","content":"hello"}', arguments: { path: "a.txt", content: "hello" } });
    f.notify({ kind: "session.progress", sessionId: "s", busyObjectIds: ["a"], timelineBusy: false, live: { order: [block.id], changes: [{ id: block.id, kind: "update", ops: [{ path: ["state"], set: "ready" }, { path: ["arguments"], set: { path: "b.txt" } }] }] } });
    expect(f.controller.liveOf("a")[0]).toMatchObject({ state: "ready", arguments: { path: "b.txt" } });
    disconnect();
  });

  // Streaming deltas arrive token by token: if other objects' live blocks and running states acquire new identities each time, all cards and busy subscribers rerender.
  it("a delta for one object preserves the identities of other objects' live blocks and unchanged running state", () => {
    const f = fixture(), disconnect = f.open();
    const a = { id: "r:0", objectId: "a", responseId: "r", ordinal: 0, kind: "text" as const, text: "A", endedAt: null };
    const b = { id: "q:0", objectId: "b", responseId: "q", ordinal: 0, kind: "text" as const, text: "B", endedAt: null };
    f.notify({ kind: "session.progress", sessionId: "s", busyObjectIds: ["a", "b"], timelineBusy: false,
      live: { order: [a.id, b.id], changes: [{ id: a.id, kind: "put", block: a }, { id: b.id, kind: "put", block: b }] } });
    const liveA = f.controller.liveOf("a"), liveB = f.controller.liveOf("b"), activity = f.controller.getActivity();
    f.notify({ kind: "session.progress", sessionId: "s", busyObjectIds: ["b", "a"], timelineBusy: false,
      live: { order: [a.id, b.id], changes: [{ id: a.id, kind: "update", ops: [{ path: ["text"], append: "+" }] }] } });
    expect(f.controller.liveOf("a")).not.toBe(liveA);
    expect(f.controller.liveOf("a")[0]).toMatchObject({ text: "A+" });
    expect(f.controller.liveOf("b")).toBe(liveB);
    expect(f.controller.getActivity()).toBe(activity);
    f.notify({ kind: "session.progress", sessionId: "s", busyObjectIds: ["a"], timelineBusy: false, live: null });
    expect(f.controller.getActivity()).toEqual({ busyObjectIds: ["a"], timelineBusy: false });
    expect(f.controller.liveOf("b")).toBe(liveB);
    disconnect();
  });

  it("rewinding blocks old-path operations only during the call, with target data delivered through change messages", async () => {
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

  // Unmounting cancels receipt of old results; reopening accepts only data from the new connection.
  it("a late open result after disconnection does not affect the new connection", async () => {
    const f = fixture();
    const oldDisconnect = f.controller.connect(), oldListener = f.listener();
    oldDisconnect();
    const disconnect = f.open();
    oldListener({ kind: "session.opened", sessionId: "s", data: { ...data(), title: "Old" } });
    f.requests[0]!.resolve({ ok: false, error: { code: "unavailable", message: "Old request failed." } }); await flush();
    expect(f.controller.getSnapshot()).toMatchObject({ status: "ready", readError: null, data: { title: "Session" } });
    disconnect();
  });

  it("reports open failures independently, and explicit retries retrieve current data again", async () => {
    const f = fixture(), disconnect = f.controller.connect();
    f.requests[0]!.resolve({ ok: false, error: { code: "not_found", message: "Missing session." } }); await flush();
    expect(f.controller.getSnapshot()).toMatchObject({ status: "error", missing: true });
    const retry = f.controller.refresh();
    f.notify({ kind: "session.opened", sessionId: "s", data: data() });
    f.requests[1]!.resolve(accepted); await retry;
    expect(f.controller.getSnapshot()).toMatchObject({ status: "ready", readError: null, missing: false });
    disconnect();
  });

  it("unsubscribes after the last viewer disconnects and releases after in-flight calls finish", async () => {
    const f = fixture(), a = f.open(), b = f.controller.connect();
    const pending = f.controller.execute(command("a"));
    a(); expect(f.requests.map(item => item.command.type)).not.toContain("unwatch");
    b(); await flush(); expect(f.release).not.toHaveBeenCalled();
    f.requests[1]!.resolve(accepted); await pending; await flush();
    expect(f.release).toHaveBeenCalledOnce();
    expect(f.requests.at(-1)?.command.type).toBe("unwatch");
  });
});
