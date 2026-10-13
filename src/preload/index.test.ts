import { beforeAll, describe, expect, it, vi } from "vitest";
import type { DesktopBridge } from "../shared/contracts.ts";
import { objectStreamChannel } from "../shared/object-stream.ts";
import { pluginEventsChannel } from "../shared/plugin-events.ts";

const electron = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(), on: vi.fn(), removeListener: vi.fn(), send: vi.fn(),
}));
vi.mock("electron", () => ({
  contextBridge: { exposeInMainWorld: electron.exposeInMainWorld },
  ipcRenderer: { on: electron.on, removeListener: electron.removeListener, send: electron.send },
  webUtils: {},
}));
let bridge: DesktopBridge;
beforeAll(async () => {
  await import("./index.ts");
  bridge = electron.exposeInMainWorld.mock.calls[0]![1] as DesktopBridge;
});

describe("前端对象流订阅", () => {
  it("按同一信封校验并筛选会话和对象，取消订阅移除原监听器", async () => {
    const listener = vi.fn();
    const stop = bridge.onObjectStream("session", "resource", listener);
    const [channel, receive] = electron.on.mock.calls[0]!;
    expect(channel).toBe(objectStreamChannel);
    const data = new Uint8Array([1, 2]);
    const frame = { kind: "object.stream", sessionId: "session", objectId: "resource", channel: "example.counter/updates", data };
    try {
      for (const invalid of [
        null, { ...frame, kind: "session.progress" }, { ...frame, data: [1, 2] },
        { ...frame, objectId: "" }, { ...frame, channel: 5 }, { ...frame, extra: true },
        { ...frame, sessionId: "other" }, { ...frame, objectId: "other" },
      ]) receive({}, invalid);
      expect(listener).not.toHaveBeenCalled();
      receive({}, frame);
      expect(listener).toHaveBeenCalledExactlyOnceWith(frame.channel, data);
      expect(listener.mock.calls[0]![1]).toBe(data);
    } finally { stop(); }
    expect(electron.removeListener).toHaveBeenCalledExactlyOnceWith(objectStreamChannel, receive);
  });
});

it("事件控制与批次走独立通道，消费方关闭时移除桥监听", async () => {
  const id = crypto.randomUUID(), listener = vi.fn();
  const stop = bridge.events.onFrame(listener);
  const [channel, receive] = electron.on.mock.calls.at(-1)!;
  const subscribe = { type: "subscribe" as const, id, contract: "test.events/notice" };
  try {
    bridge.events.send(subscribe);
    expect(electron.send).toHaveBeenLastCalledWith(pluginEventsChannel, subscribe);
    expect(channel).toBe(pluginEventsChannel);
    receive({}, { type: "ready", id });
    expect(listener).toHaveBeenCalledExactlyOnceWith({ type: "ready", id });
  } finally { stop(); }
  expect(electron.removeListener).toHaveBeenLastCalledWith(pluginEventsChannel, receive);
});
