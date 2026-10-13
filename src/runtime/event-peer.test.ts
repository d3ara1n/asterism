import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { pluginNamespace } from "@atelier/sdk/contracts";
import { EventBus } from "../plugins/events.ts";
import { EventPeer } from "./event-peer.ts";
import { EventClient } from "../shared/event-client.ts";
import { eventFrameSchema, type EventFrame } from "../shared/plugin-events.ts";

const ns = pluginNamespace("test.transport");
const Changed = ns.event("changed", { schema: z.string().transform(value => Number(value)), source: "plugin", semantics: { kind: "occurrence" } });
const Progress = ns.event("progress", { schema: z.object({ job: z.string(), value: z.number() }), source: "plugin", semantics: { kind: "snapshot", key: ["job"] } });
const cleanups: (() => void)[] = [];
function connection() {
  vi.useFakeTimers();
  const bus = new EventBus(); bus.declare(ns.id, Changed);
  const frames: EventFrame[] = []; let receive: (frame: EventFrame) => void = () => {};
  const peer = new EventPeer(bus, frame => { frames.push(frame); receive(eventFrameSchema.parse(structuredClone(frame))); });
  const client = new EventClient({ send: command => peer.receive(structuredClone(command)), onFrame: listener => { receive = listener; return () => { receive = () => {}; }; } });
  cleanups.push(() => { client.close(); peer.close(); bus.close(); });
  return { bus, peer, client, frames };
}
afterEach(() => { cleanups.splice(0).forEach(close => close()); vi.useRealTimers(); });

// 契约依据：逐条转发原始输入并在接收端解码、慢订阅不阻塞其他订阅、latest 在接收端合并、断连不补发。
describe("事件 IPC 转发", () => {
  it("逐条按序转发，schema 转换只在接收端应用一次", async () => {
    const { bus, client, frames } = connection(), values: number[] = [];
    const subscription = client.subscribe(Changed, {}, event => { values.push(event.data); });
    await subscription.ready;
    for (let i = 1; i <= 100; i++) bus.publish(Changed, { plugin: ns.id, resource: null }, String(i));
    await vi.runAllTimersAsync();
    expect(values).toEqual(Array.from({ length: 100 }, (_, i) => i + 1));
    const first = frames.find(frame => frame.type === "event");
    expect(first?.type === "event" && first.event.data).toBe("1");
    subscription.close(); expect(await subscription.closed).toMatchObject({ reason: "closed" });
  });

  it("慢订阅不丢事件也不阻塞其他订阅，断连结束旧订阅且不补发", async () => {
    const { bus, client, peer } = connection(); let release!: () => void;
    const slowValues: number[] = [];
    const slow = client.subscribe(Changed, {}, async event => { slowValues.push(event.data); if (event.data === 0) await new Promise<void>(r => { release = r; }); });
    const fastValues: number[] = [];
    client.subscribe(Changed, {}, event => { fastValues.push(event.data); });
    await slow.ready;
    for (let i = 0; i < 150; i++) bus.publish(Changed, { plugin: ns.id, resource: null }, String(i));
    await vi.advanceTimersByTimeAsync(20);
    expect(fastValues).toHaveLength(150);
    expect(slowValues).toEqual([0]);
    release(); await vi.runAllTimersAsync();
    expect(slowValues).toHaveLength(150);
    peer.close(); client.disconnect();
    expect(await slow.closed).toMatchObject({ reason: "disconnected" });
    const restored: number[] = [];
    const next = client.subscribe(Changed, {}, event => { restored.push(event.data); }); await next.ready;
    await vi.runAllTimersAsync(); expect(restored).toEqual([]);
  });

  it("latest 在接收端合并忙碌期间的同键值", async () => {
    const { bus, client } = connection(); bus.declare(ns.id, Progress);
    let release!: () => void; const values: number[] = [];
    const sub = client.subscribe(Progress, { delivery: "latest" }, async event => {
      values.push(event.data.value); if (event.data.value === 0) await new Promise<void>(r => { release = r; });
    });
    await sub.ready;
    for (let value = 0; value < 10; value++) bus.publish(Progress, { plugin: ns.id, resource: null }, { job: "a", value });
    await vi.advanceTimersByTimeAsync(1);
    release(); await vi.runAllTimersAsync();
    expect(values).toEqual([0, 9]);
  });

  it("未知契约建立失败可观察，已取消的信号直接结束", async () => {
    const { client } = connection();
    const Unknown = ns.event("unknown", { schema: z.number(), source: "plugin", semantics: { kind: "occurrence" } });
    const unknown = client.subscribe(Unknown, {}, () => {});
    await expect(unknown.ready).rejects.toThrow();
    expect(await unknown.closed).toMatchObject({ reason: "unavailable" });
    const cancelled = new AbortController(); cancelled.abort();
    const subscription = client.subscribe(Changed, { signal: cancelled.signal }, () => {});
    expect(await subscription.closed).toMatchObject({ reason: "aborted" });
  });
});
