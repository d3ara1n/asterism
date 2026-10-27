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
  // Listeners registered at module load have their records cleared before tests begin; retrieve them first.
  relay = electron.on.mock.calls.find(([name]) => name === connectionRequestChannel)![1];
});

// Direct connection handoff contract: repeated page requests cannot recreate main-process connections and end in-flight calls/subscriptions; ports pass through unchanged.
describe("Task process direct connection handoff", () => {
  it("sends one connection request per page and forwards ports and unavailable notifications to the page", () => {
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
