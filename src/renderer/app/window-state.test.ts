import { expect, it, vi } from "vitest";
import type { DesktopWindowState } from "../../shared/desktop";
import { getDesktopWindowState, startDesktopWindow } from "./window-state";

// design-system.md：首帧前先订阅再读取，初始读取与事件按收到的顺序采用。
it("先订阅再读取，直接采用每次收到的窗口状态", async () => {
  let receive!: (state: DesktopWindowState) => void;
  let resolve!: (state: DesktopWindowState) => void;
  const unsubscribe = vi.fn();
  const pending = startDesktopWindow({
    get: () => {
      expect(receive).toBeTypeOf("function");
      return new Promise<DesktopWindowState>(done => { resolve = done; });
    },
    onChanged: listener => { receive = listener; return unsubscribe; },
  });
  receive({ titleBar: "macos", fullScreen: true });
  expect(getDesktopWindowState().fullScreen).toBe(true);
  resolve({ titleBar: "macos", fullScreen: false });
  const stop = await pending;
  try {
    expect(getDesktopWindowState()).toEqual({ titleBar: "macos", fullScreen: false });
    receive({ titleBar: "macos", fullScreen: true });
    expect(getDesktopWindowState().fullScreen).toBe(true);
  } finally { stop(); }
  expect(unsubscribe).toHaveBeenCalledOnce();
});

// 全屏内刷新不保证再次收到事件，初始读取必须能单独建立正确布局。
it("没有切换通知时也使用当前快照，读取失败时释放订阅", async () => {
  const stop = await startDesktopWindow({
    get: async () => ({ titleBar: "overlay", fullScreen: true }),
    onChanged: () => () => {},
  });
  try { expect(getDesktopWindowState()).toEqual({ titleBar: "overlay", fullScreen: true }); }
  finally { stop(); }
  const unsubscribe = vi.fn();
  await expect(startDesktopWindow({
    get: async () => { throw new Error("Window unavailable."); },
    onChanged: () => unsubscribe,
  })).rejects.toThrow("Window unavailable.");
  expect(unsubscribe).toHaveBeenCalledOnce();
});
