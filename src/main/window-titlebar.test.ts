import { EventEmitter } from "node:events";
import type { BrowserWindow, IpcMainInvokeEvent } from "electron";
import { expect, it, vi } from "vitest";
import { desktopWindowChangedChannel, desktopWindowGetChannel } from "../shared/desktop.ts";
import { serveDesktopWindow } from "./window-titlebar.ts";

const ipc = vi.hoisted(() => ({ handle: vi.fn(), removeHandler: vi.fn() }));
vi.mock("electron", () => ({ ipcMain: ipc }));

// design-system.md：全屏状态来自原生窗口，重读与事件必须一致；architecture.md：只允许受信主框架读取。
it("提供当前全屏快照与原生切换通知，关闭后释放 IPC 与窗口监听", () => {
  let fullScreen = true;
  const send = vi.fn();
  const window = Object.assign(new EventEmitter(), {
    isFullScreen: () => fullScreen,
    isDestroyed: () => false,
    webContents: { send, isDestroyed: () => false },
  });
  const trusted = {} as IpcMainInvokeEvent;
  const stop = serveDesktopWindow(window as unknown as BrowserWindow, "overlay", event => event === trusted);
  const [channel, read] = ipc.handle.mock.calls.at(-1)!;
  try {
    expect(channel).toBe(desktopWindowGetChannel);
    // 在全屏内刷新页面时，没有新的 enter 事件，仍须取得 true。
    expect(read(trusted)).toEqual({ titleBar: "overlay", fullScreen: true });
    expect(read({})).toBeNull();
    fullScreen = false;
    window.emit("leave-full-screen");
    expect(send).toHaveBeenLastCalledWith(desktopWindowChangedChannel, { titleBar: "overlay", fullScreen: false });
    fullScreen = true;
    window.emit("enter-full-screen");
    expect(send).toHaveBeenLastCalledWith(desktopWindowChangedChannel, read(trusted));
  } finally { stop(); }
  expect(ipc.removeHandler).toHaveBeenLastCalledWith(desktopWindowGetChannel);
  expect(window.listenerCount("enter-full-screen")).toBe(0);
  expect(window.listenerCount("leave-full-screen")).toBe(0);
});
