import { beforeAll, describe, expect, it, vi } from "vitest";
import type { DesktopBridge } from "../shared/contracts.ts";
import { connectionRequestChannel } from "../shared/connection.ts";

const electron = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(), on: vi.fn(), removeListener: vi.fn(), send: vi.fn(), postMessage: vi.fn(),
}));
vi.mock("electron", () => ({
  contextBridge: { exposeInMainWorld: electron.exposeInMainWorld },
  ipcRenderer: { on: electron.on, removeListener: electron.removeListener, send: electron.send },
  webUtils: {},
}));
let bridge: DesktopBridge;
beforeAll(async () => {
  vi.stubGlobal("window", { postMessage: electron.postMessage });
  await import("./index.ts");
  bridge = electron.exposeInMainWorld.mock.calls[0]![1] as DesktopBridge;
});

// Direct connection handoff contract: repeated page requests cannot recreate main-process connections and end in-flight calls/subscriptions.
describe("Task process direct connection handoff", () => {
  it("sends only one connection request for repeated requests from the same page", () => {
    bridge.connectRuntime();
    bridge.connectRuntime();
    expect(electron.send).toHaveBeenCalledExactlyOnceWith(connectionRequestChannel);
  });
});
