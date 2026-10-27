import { describe, expect, it } from "vitest";
import { RunLifecycle } from "./lifecycle.ts";

const object = { sessionId: "session", id: "object", kind: "test.resource/object" };
describe("Shared run lifetime", () => {
  // Read-only queries do not occupy the timeline, but host close still waits for actual completion.
  it("waiting on read-only communication does not occupy the timeline and resource work registers busy separately", async () => {
    const lifecycle = new RunLifecycle(() => {});
    let finishCall!: () => void, finishTask!: () => void;
    const call = lifecycle.group("call").start(() => new Promise<void>(resolve => { finishCall = resolve; }), { object, affectsHistory: false });
    const task = lifecycle.group("task").start(() => new Promise<void>(resolve => { finishTask = resolve; }), { object });
    try {
      expect(lifecycle.activity(object.sessionId)).toEqual({ busy: [object.id] });
      finishTask(); await task.done;
      expect(lifecycle.activity(object.sessionId)).toEqual({ busy: [] });
    } finally {
      finishTask(); finishCall();
      await lifecycle.close();
    }
    await call.done;
    expect(lifecycle.activity(object.sessionId)).toEqual({ busy: [] });
  });
  it.each(["return", "close"] as const)("%s closes the actual iterator while stream consumption is paused, waits for cleanup, and does not cancel the caller's signal", async mode => {
    const lifecycle = new RunLifecycle(() => {}), models = lifecycle.group("model");
    const caller = new AbortController();
    let release!: () => void, cleaned = false, starts = 0;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const stream = models.iterate(async function* () {
      starts++;
      try { yield 1; yield 2; }
      finally { await gate; cleaned = true; }
    }, caller.signal);
    const iterator = stream[Symbol.asyncIterator]();
    expect(await iterator.next()).toEqual({ done: false, value: 1 });
    const closing = mode === "return" ? iterator.return!() : lifecycle.close();
    await Promise.resolve();
    expect(cleaned).toBe(false);
    release(); await closing;
    expect(cleaned).toBe(true);
    expect(caller.signal.aborted).toBe(false);
    expect(await iterator.next()).toMatchObject({ done: true });
    expect(starts).toBe(1);
    await lifecycle.close();
  });
  it("close propagates all cancellations first, retains activities until actual completion, and accepts no new work", async () => {
    const lifecycle = new RunLifecycle(() => {});
    const task = lifecycle.group("task"), model = lifecycle.group("model");
    let release!: () => void;
    const hold = new Promise<void>(resolve => { release = resolve; });
    const work = task.start(async signal => { await hold; expect(signal.aborted).toBe(true); }, { object });
    const child = model.start(async signal => { await hold; expect(signal.aborted).toBe(true); }, { object });
    const closing = lifecycle.close();
    expect(work.signal.aborted).toBe(true);
    expect(child.signal.aborted).toBe(true);
    expect(lifecycle.activity(object.sessionId)).toEqual({ busy: [object.id] });
    expect(() => task.start(async () => {})).toThrow();
    release(); await closing;
    expect(lifecycle.activity(object.sessionId)).toEqual({ busy: [] });
  });
  it("execution failures still finalize and closing one execution group does not stop other groups", async () => {
    const lifecycle = new RunLifecycle(() => {});
    const actions = lifecycle.group("action"), models = lifecycle.group("model");
    await expect(actions.start(async () => { throw new Error("failure"); }, { object }).done).rejects.toThrow("failure");
    expect(actions.activity(object.sessionId)).toEqual([]);
    await actions.close();
    await expect(models.start(async () => "ready", { object }).done).resolves.toBe("ready");
    await lifecycle.close();
  });
});
