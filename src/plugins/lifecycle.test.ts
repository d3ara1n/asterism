import { describe, expect, it } from "vitest";
import { RunLifecycle } from "./lifecycle.ts";

const object = { sessionId: "session", id: "object", kind: "test.resource/object" };
describe("共享运行生命周期", () => {
  // 关联同一对象的查询不能遮掉真实执行；执行结束后的查询仍须受收束保护。
  it("通信与任务重叠时分别投影执行和未收束活动", async () => {
    const lifecycle = new RunLifecycle(() => {});
    let finishCall!: () => void, finishTask!: () => void;
    const call = lifecycle.group("call").start(() => new Promise<void>(resolve => { finishCall = resolve; }), { object });
    const task = lifecycle.group("task").start(() => new Promise<void>(resolve => { finishTask = resolve; }), { object });
    try {
      expect(lifecycle.activity(object.sessionId)).toEqual({ unsettled: [object.id], executing: [object.id] });
      finishTask(); await task.done;
      expect(lifecycle.activity(object.sessionId)).toEqual({ unsettled: [object.id], executing: [] });
    } finally {
      finishTask(); finishCall();
      await lifecycle.close();
    }
    await call.done;
    expect(lifecycle.activity(object.sessionId)).toEqual({ unsettled: [], executing: [] });
  });
  it.each(["return", "close"] as const)("流暂停消费时 %s 关闭真实迭代器，等待清理但不取消调用方信号", async mode => {
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
  it("关闭先传播所有取消，活动直到实际结束才移除，关闭后不再受理", async () => {
    const lifecycle = new RunLifecycle(() => {});
    const task = lifecycle.group("task"), model = lifecycle.group("model");
    let release!: () => void;
    const hold = new Promise<void>(resolve => { release = resolve; });
    const work = task.start(async signal => { await hold; expect(signal.aborted).toBe(true); }, { object });
    const child = model.start(async signal => { await hold; expect(signal.aborted).toBe(true); }, { object });
    const closing = lifecycle.close();
    expect(work.signal.aborted).toBe(true);
    expect(child.signal.aborted).toBe(true);
    expect(lifecycle.activity(object.sessionId)).toEqual({ unsettled: [object.id], executing: [object.id] });
    expect(() => task.start(async () => {})).toThrow();
    release(); await closing;
    expect(lifecycle.activity(object.sessionId)).toEqual({ unsettled: [], executing: [] });
  });
  it("执行失败仍收束；关闭一个执行组不停止其他组", async () => {
    const lifecycle = new RunLifecycle(() => {});
    const actions = lifecycle.group("action"), models = lifecycle.group("model");
    await expect(actions.start(async () => { throw new Error("failure"); }, { object }).done).rejects.toThrow("failure");
    expect(actions.activity(object.sessionId)).toEqual([]);
    await actions.close();
    await expect(models.start(async () => "ready", { object }).done).resolves.toBe("ready");
    await lifecycle.close();
  });
});
