import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { pluginNamespace, type EventEnvelope } from "@atelier/sdk/contracts";
import { EventBus } from "./events.ts";

const ns = pluginNamespace("test.events");
const Progress = ns.event("progress", { schema: z.object({ job: z.string(), value: z.number() }), source: "resource", semantics: { kind: "snapshot", key: ["job"] } });
const Notice = ns.event("notice", { schema: z.number(), source: "plugin", semantics: { kind: "occurrence" } });
const source = (id: string) => ({ plugin: "test.publisher", resource: { sessionId: "unopened", id, kind: "test.publisher/download" } });
const buses: EventBus[] = [];
function open() { const bus = new EventBus(); buses.push(bus); bus.declare(ns.id, Progress); bus.declare(ns.id, Notice); return bus; }
afterEach(() => { buses.splice(0).forEach(bus => bus.close()); });

// 契约依据：具型订阅按契约与来源过滤、异步按序不丢、latest 只合并待交付同键值、handler 失败只结束自身。
describe("全局事件路由与投递", () => {
  it("只向匹配契约和来源投递，发布栈不执行消费者，all 按序完整", async () => {
    const bus = open(), all: EventEnvelope[] = [], foreign = vi.fn();
    bus.listen(Progress, {}, packet => { all.push(packet.event); });
    bus.listen(Progress, { source: { sessionId: "other" } }, foreign);
    bus.listen(Notice, {}, foreign);
    const input = { job: "job", value: 1 };
    bus.publish(Progress, source("a"), input); input.value = 999;
    bus.publish(Progress, source("b"), { job: "job", value: 2 });
    bus.publish(Progress, source("a"), { job: "job", value: 3 });
    expect(all).toEqual([]);
    await vi.waitFor(() => expect(all).toHaveLength(3));
    expect(all.map(e => e.data)).toEqual([{ job: "job", value: 1 }, { job: "job", value: 2 }, { job: "job", value: 3 }]);
    expect(foreign).not.toHaveBeenCalled();
  });

  it("latest 在消费者忙时只保留同来源同键的最新值，不串资源", async () => {
    const bus = open(), seen: [string | undefined, number][] = [];
    let release!: () => void;
    const gate = new Promise<void>(r => { release = r; });
    bus.listen(Progress, { delivery: "latest" }, async packet => {
      seen.push([packet.event.source?.resource?.id, (packet.event.data as { value: number }).value]);
      if (seen.length === 1) await gate;
    });
    bus.publish(Progress, source("a"), { job: "job", value: 0 });
    await vi.waitFor(() => expect(seen).toHaveLength(1));
    for (let value = 1; value <= 100; value++) bus.publish(Progress, source("a"), { job: "job", value });
    bus.publish(Progress, source("b"), { job: "job", value: 7 });
    release();
    await vi.waitFor(() => expect(seen).toHaveLength(3));
    expect(seen).toEqual([["a", 0], ["a", 100], ["b", 7]]);
  });

  it("慢消费者不丢事件也不拖住其他订阅", async () => {
    const bus = open(), from = { plugin: ns.id, resource: null }, slow: unknown[] = [], fast: unknown[] = [];
    let release!: () => void;
    const gate = new Promise<void>(r => { release = r; });
    bus.listen(Notice, {}, async packet => { await gate; slow.push(packet.event.data); });
    bus.listen(Notice, {}, packet => { fast.push(packet.event.data); });
    for (let i = 0; i < 2000; i++) bus.publish(Notice, from, i);
    await vi.waitFor(() => expect(fast).toHaveLength(2000));
    expect(slow).toEqual([]);
    release();
    await vi.waitFor(() => expect(slow).toHaveLength(2000));
    expect(slow).toEqual(fast);
  });

  it("handler 失败只结束自己的订阅；无效载荷、契约实例和来源在发布时拒绝", async () => {
    const bus = open(), from = { plugin: ns.id, resource: null }, other: unknown[] = [];
    const failed = bus.listen(Notice, {}, () => { throw new Error("failure"); });
    bus.listen(Notice, {}, packet => { other.push(packet.event.data); });
    bus.publish(Notice, from, 1); bus.publish(Notice, from, 2);
    expect(await failed.closed).toMatchObject({ reason: "consumer_failed" });
    await vi.waitFor(() => expect(other).toEqual([1, 2]));
    expect(() => bus.publish(Notice, from, "x")).toThrow("Invalid event payload");
    expect(() => bus.listen(Notice, { delivery: "latest" }, () => {})).toThrow();
    expect(() => bus.publish({ ...Progress }, source("a"), { job: "job", value: 1 })).toThrow("declared");
    expect(() => bus.publish(Progress, from, { job: "job", value: 1 })).toThrow("source");
  });

  it("取消发出信号但等回调真正结束才收束", async () => {
    const bus = open(), from = { plugin: ns.id, resource: null };
    let signal!: AbortSignal, release!: () => void;
    const slow = bus.listen(Notice, {}, async (_packet, current) => { signal = current; await new Promise<void>(r => { release = r; }); });
    bus.publish(Notice, from, 1);
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    slow.close();
    expect(await slow.closed).toMatchObject({ reason: "closed" });
    await Promise.resolve(); expect(signal.aborted).toBe(true);
    let settled = false; void slow.settle().then(() => { settled = true; });
    await Promise.resolve(); expect(settled).toBe(false);
    release(); await slow.settle(); expect(settled).toBe(true);
  });
});
