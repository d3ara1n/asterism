import { describe, expect, it, vi } from "vitest";
import { prepareModules } from "./startup";
import { pluginNamespace, type EventSubscriber } from "@atelier/sdk/contracts";
import { z } from "zod";

const base = { resources: [], cards: [], tools: [] };

describe("模块启动准备", () => {
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

it("模块订阅在准备失败时取消，成功模块的订阅保留到应用关闭", async () => {
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
      { ...base, async prepare({ events }) { events.subscribe(Event, {}, () => {}); throw new Error("Setup failed."); } },
      { ...base, async prepare({ events }) { await events.subscribe(Event, {}, () => {}).ready; } },
    ], events, 100, lifetime.signal);
    expect(signals.map(signal => signal.aborted)).toEqual([true, false]);
    lifetime.abort();
    expect(signals.every(signal => signal.aborted)).toBe(true);
  } finally { error.mockRestore(); lifetime.abort(); }
});
