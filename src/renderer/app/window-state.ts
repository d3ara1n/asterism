import { useSyncExternalStore } from "react";
import type { DesktopWindowBridge, DesktopWindowState } from "../../shared/desktop";

let current: DesktopWindowState | undefined;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const publish = (state: DesktopWindowState) => { current = state; listeners.forEach(listener => listener()); };

/** 首帧前读取；先订阅再读取，避免全屏切换被迟到的初始快照覆盖。 */
export async function startDesktopWindow(bridge: DesktopWindowBridge): Promise<() => void> {
  let changed = false;
  const stop = bridge.onChanged(state => { changed = true; publish(state); });
  try {
    const initial = await bridge.get();
    if (!changed) publish(initial);
    return stop;
  } catch (error) {
    stop();
    throw error;
  }
}

export function getDesktopWindowState(): DesktopWindowState {
  if (!current) throw new Error("Desktop window state has not been initialized.");
  return current;
}

export function useDesktopWindow(): DesktopWindowState {
  return useSyncExternalStore(subscribe, getDesktopWindowState);
}
