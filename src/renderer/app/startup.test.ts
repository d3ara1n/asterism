import { describe, expect, it, vi } from "vitest";
import { prepareModules, preparePlugin } from "./startup";
import { pluginNamespace, type EventSubscriber } from "@asterism-app/sdk/contracts";
import { z } from "zod";
import { agentUI } from "@asterism-app/builtin-api/renderer";
import { EventClient } from "../../shared/event-client";
import type { EventFrame } from "../../shared/plugin-events";

const base = { resources: [], cards: [], tools: [] };

describe("Module startup preparation", () => {
  // Subscription closed may precede callback completion; a root preparation failure must not destroy services still needed by the callback.
  it("root preparation failure waits for active event callbacks before releasing shared services", async () => {
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
  // Modules consume services prepared by the root entry; a failed root must not proceed to prepare modules.
  it("prepares the plugin before its modules, and cancels module subscriptions before releasing shared services on shutdown", async () => {
    const order: string[] = [];
    let moduleSignal!: AbortSignal;
    const events: EventSubscriber = { subscribe: () => { throw new Error("Unexpected subscription."); } };
    const { close } = await preparePlugin({
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
});

it("releases module subscriptions and Agent UI registrations on preparation failure, retaining successful modules until application shutdown", async () => {
  const signals: AbortSignal[] = [];
  const events: EventSubscriber = { subscribe: (_contract, options) => {
    signals.push(options.signal!);
    return { ready: Promise.resolve(), closed: new Promise(() => {}), close() {} };
  } };
  const Event = pluginNamespace("test.startup").event("notice", { schema: z.null(), source: "plugin", semantics: { kind: "occurrence" } });
  const lifetime = new AbortController();
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const diagnostics = await prepareModules([
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
    expect(diagnostics).toEqual([{ stage: "module", module: 0, message: "Setup failed." }]);
    expect(signals.map(signal => signal.aborted)).toEqual([true, false]);
    expect(agentUI.getSnapshot().map(entry => entry.id)).toEqual(["test.startup/ready"]);
    lifetime.abort();
    expect(signals.every(signal => signal.aborted)).toBe(true);
    expect(agentUI.getSnapshot()).toEqual([]);
  } finally { error.mockRestore(); lifetime.abort(); }
});
