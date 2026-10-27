import { expect, it, vi } from "vitest";
import type { DesktopWindowState } from "../../shared/desktop";
import { getDesktopWindowState, startDesktopWindow } from "./window-state";

// Subscribe before reading ahead of the first frame; adopt the initial read and events in the order received.
it("subscribes before reading and directly adopts each received window state", async () => {
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

// Refreshing in fullscreen does not guarantee another event; the initial read must establish the correct layout on its own.
it("uses the current snapshot even without a change notification and releases the subscription on read failure", async () => {
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
