import { beforeAll, describe, expect, it, vi } from "vitest";
import type { DesktopBridge } from "../shared/contracts.ts";
import { connectionPortMessage, connectionRequestChannel } from "../shared/connection.ts";

const electron = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(), on: vi.fn(), removeListener: vi.fn(), send: vi.fn(), postMessage: vi.fn(),
}));
vi.mock("electron", () => ({
  contextBridge: { exposeInMainWorld: electron.exposeInMainWorld },
  ipcRenderer: { on: electron.on, removeListener: electron.removeListener, send: electron.send },
  webUtils: {},
}));
let bridge: DesktopBridge;
let relay: (event: { ports: unknown[] }) => void;
beforeAll(async () => {
  vi.stubGlobal("window", { postMessage: electron.postMessage });
  await import("./index.ts");
  bridge = electron.exposeInMainWorld.mock.calls[0]![1] as DesktopBridge;
  // 模块加载时注册的监听在用例开始前被清理记录，先行取出。
  relay = electron.on.mock.calls.find(([name]) => name === connectionRequestChannel)![1];
});

// 直连交接契约：页面重复请求不能让主进程重建连接（会结束在途调用与订阅）；端口原样转交页面。
describe("任务进程直连交接", () => {
  it("每个页面只发送一次连接请求，端口与不可用通知都转交给页面", () => {
    bridge.connectRuntime();
    bridge.connectRuntime();
    expect(electron.send).toHaveBeenCalledExactlyOnceWith(connectionRequestChannel);
    const port = { kind: "port" };
    relay({ ports: [port] });
    expect(electron.postMessage).toHaveBeenLastCalledWith({ type: connectionPortMessage }, "*", [port]);
    relay({ ports: [] });
    expect(electron.postMessage).toHaveBeenLastCalledWith({ type: connectionPortMessage }, "*", []);
  });
});
