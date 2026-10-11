import { describe, expect, it } from "vitest";
import { RunLifecycle } from "./lifecycle.ts";

const object = { sessionId: "session", id: "object", kind: "test.resource/object" };
describe("共享运行生命周期", () => {
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
    expect(lifecycle.activity(object.sessionId)).toEqual([object.id]);
    expect(() => task.start(async () => {})).toThrow(/closing/);
    release(); await closing;
    expect(lifecycle.activity(object.sessionId)).toEqual([]);
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
