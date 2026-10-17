import { expect, it, vi } from "vitest";
import type { DesktopWindowState } from "../../shared/desktop";
import { getDesktopWindowState, startDesktopWindow } from "./window-state";

// design-system.md：首帧前读到原生状态；读取在途的切换通知不能被旧快照覆盖。
it("先订阅再读取，保留读取期间到达的全屏切换并持续响应退出", async () => {
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
  resolve({ titleBar: "macos", fullScreen: false });
  const stop = await pending;
  try {
    expect(getDesktopWindowState()).toEqual({ titleBar: "macos", fullScreen: true });
    receive({ titleBar: "macos", fullScreen: false });
    expect(getDesktopWindowState().fullScreen).toBe(false);
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
