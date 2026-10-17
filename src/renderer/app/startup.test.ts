import { describe, expect, it, vi } from "vitest";
import { prepareModules, preparePlugin } from "./startup";
import { pluginNamespace, type EventSubscriber } from "@atelier/sdk/contracts";
import { z } from "zod";
import { agentUI } from "@atelier/builtin-api/renderer";
import { EventClient } from "../../shared/event-client";
import type { EventFrame } from "../../shared/plugin-events";

const base = { resources: [], cards: [], tools: [] };

describe("模块启动准备", () => {
  // 订阅 closed 可能先于回调结束；根准备失败后也不能提前销毁回调依赖的服务。
  it("根准备失败等待正在执行的事件回调，再释放共享服务", async () => {
    const Event = pluginNamespace("test.root").event("changed", { schema: z.null(), source: "plugin", semantics: { kind: "occurrence" } });
    let receive!: (frame: EventFrame) => void, release!: () => void, started!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const running = new Promise<void>(resolve => { started = resolve; });
    const order: string[] = [];
    const events = new EventClient({
      onFrame(listener) { receive = listener; return () => {}; },
      send(control) {
        if (control.type !== "subscribe") return;
        queueMicrotask(() => {
          receive({ type: "ready", id: control.id });
          receive({ type: "event", id: control.id, event: { contract: { id: Event.id }, emittedAt: "2026-10-18", source: { plugin: "test.root", resource: null }, data: null } });
        });
      },
    });
    let close!: () => Promise<void>;
    try {
      await expect(preparePlugin({
        async prepare({ events }) {
          events.subscribe(Event, {}, async () => { started(); await held; order.push("handler"); });
          await running;
          throw new Error("Root failed.");
        },
        async closing() { order.push("plugin"); },
      }, events, new AbortController().signal, 100, cleanup => { close = cleanup; })).rejects.toThrow("Root failed.");
      expect(order).toEqual([]);
    } finally { release(); if (close) await close(); events.close(); }
    expect(order).toEqual(["handler", "plugin"]);
  });
  // 启动超时只放弃等待，原始 prepare Promise 必须留在插件清理责任中。
  it("模块准备超时后，关闭仍等待其真实退出", async () => {
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const order: string[] = [];
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    let close!: () => Promise<void>;
    try {
      close = await preparePlugin({
        modules: [{ ...base, async prepare() { await held; order.push("module"); } }],
        async closing() { order.push("plugin"); },
      }, { subscribe: () => { throw new Error("Unexpected subscription."); } }, new AbortController().signal, 20);
      const closing = close();
      expect(close()).toBe(closing);
      expect(order).toEqual([]);
      release(); await closing;
      expect(order).toEqual(["module", "plugin"]);
    } finally { release(); if (close) await close(); log.mockRestore(); }
  });
  // plugin-sdk.md：模块消费根入口准备好的服务，失败根不能继续准备模块。
  it("插件准备先于模块，关闭先取消模块订阅再释放共享服务", async () => {
    const order: string[] = [];
    let moduleSignal!: AbortSignal;
    const events: EventSubscriber = { subscribe: () => { throw new Error("Unexpected subscription."); } };
    const close = await preparePlugin({
      async prepare() { order.push("plugin"); },
      modules: [{ ...base, async prepare({ signal }) { moduleSignal = signal; order.push("module"); } }],
      async closing() { expect(moduleSignal.aborted).toBe(true); order.push("close"); },
    }, events, new AbortController().signal);
    expect(order).toEqual(["plugin", "module"]);
    await close(); await close();
    expect(order).toEqual(["plugin", "module", "close"]);
    const module = vi.fn(), cleanup = vi.fn();
    await expect(preparePlugin({
      async prepare() { throw new Error("Root failed."); },
      modules: [{ ...base, prepare: module }], closing: cleanup,
    }, events, new AbortController().signal)).rejects.toThrow("Root failed.");
    await Promise.resolve();
    expect(module).not.toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalledOnce();
  });
  it("失败与超时不阻止启动，超时通知模块停止", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    let signal: AbortSignal | undefined;
    const done = vi.fn(async () => {});
    try {
      await prepareModules([
        { ...base, prepare: async () => { throw new Error("boom"); } },
        { ...base, prepare: context => { signal = context.signal; return new Promise(() => {}); } },
        { ...base, prepare: done },
        base,
      ], { subscribe: () => { throw new Error("Unexpected event subscription."); } }, 20);
      expect(done).toHaveBeenCalled();
      expect(signal?.aborted).toBe(true);
    } finally { error.mockRestore(); }
  });
});

it("模块订阅和 Agent UI 登记在准备失败时释放，成功模块保留到应用关闭", async () => {
  const signals: AbortSignal[] = [];
  const events: EventSubscriber = { subscribe: (_contract, options) => {
    signals.push(options.signal!);
    return { ready: Promise.resolve(), closed: new Promise(() => {}), close() {} };
  } };
  const Event = pluginNamespace("test.startup").event("notice", { schema: z.null(), source: "plugin", semantics: { kind: "occurrence" } });
  const lifetime = new AbortController();
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    await prepareModules([
      { ...base, async prepare({ events, signal }) {
        events.subscribe(Event, {}, () => {});
        agentUI.register({ id: "test.startup/failed", Component: () => null }, { signal });
        throw new Error("Setup failed.");
      } },
      { ...base, async prepare({ events, signal }) {
        agentUI.register({ id: "test.startup/ready", Component: () => null }, { signal });
        await events.subscribe(Event, {}, () => {}).ready;
      } },
    ], events, 100, lifetime.signal);
    expect(signals.map(signal => signal.aborted)).toEqual([true, false]);
    expect(agentUI.getSnapshot().map(entry => entry.id)).toEqual(["test.startup/ready"]);
    lifetime.abort();
    expect(signals.every(signal => signal.aborted)).toBe(true);
    expect(agentUI.getSnapshot()).toEqual([]);
  } finally { error.mockRestore(); lifetime.abort(); }
});
