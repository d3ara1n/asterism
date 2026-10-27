import { useSyncExternalStore } from "react";
import type { DesktopWindowBridge, DesktopWindowState } from "../../shared/desktop";

let current: DesktopWindowState | undefined;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const publish = (state: DesktopWindowState) => { current = state; listeners.forEach(listener => listener()); };

/** Subscribe before reading ahead of the first frame, and directly adopt the current state received. */
export async function startDesktopWindow(bridge: DesktopWindowBridge): Promise<() => void> {
  const stop = bridge.onChanged(publish);
  try {
    const initial = await bridge.get();
    publish(initial);
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
