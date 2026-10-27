import type { WorkbenchOperation } from "../session/controller";
import { createContext, createElement, useContext, useRef, useSyncExternalStore, type ReactNode } from "react";
import type { WorkbenchSnapshot } from "../../../shared/workbench";
import type { SessionController } from "../session/controller";
import type { WorkbenchCanvas } from "./canvas";

/** Environment provided by the workbench to cards and deeper islands; card node data retains only objects and view state. */
export interface WorkbenchEnvironment {
  controller: SessionController;
  session: WorkbenchSnapshot;
  ready: boolean;
  run: (command: WorkbenchOperation) => Promise<boolean>;

}
export type WorkbenchView = WorkbenchEnvironment & {
  canvas: WorkbenchCanvas;
};

/**
 * Deeper islands and the focus island are rendered by Screen outside the workbench's React subtree;
 * the application holds a store, the current workbench writes its latest environment into it, and islands subscribe through WorkbenchScope.
 */
export class WorkbenchStore {
  private value: WorkbenchView | null = null;
  private listeners = new Set<() => void>();
  get = (): WorkbenchView | null => this.value;
  set(value: WorkbenchView): void { this.value = value; this.listeners.forEach(listener => listener()); }
  /** Withdraw the environment only if it is still current; no effect after another workbench has replaced it. */
  clear(value: WorkbenchView): void {
    if (this.value !== value) return;
    this.value = null; this.listeners.forEach(listener => listener());
  }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
}

export const WorkbenchContext = createContext<WorkbenchView | null>(null);

/**
 * Islands are bound to their session: accept only that session's environment and retain the last one after switching sessions,
 * allowing exiting islands to continue showing their original content; render nothing until their session's environment is ready.
 */
export function WorkbenchScope({ store, sessionId, children }: { store: WorkbenchStore; sessionId: string; children: ReactNode }) {
  const current = useSyncExternalStore(store.subscribe, store.get);
  const pinned = useRef<WorkbenchView | null>(null);
  if (current?.session.id === sessionId) pinned.current = current;
  const value = pinned.current;
  return value ? createElement(WorkbenchContext.Provider, { value }, children) : null;
}

export function useWorkbench(): WorkbenchView {
  const value = useContext(WorkbenchContext);
  if (!value) throw new Error("useWorkbench must be used inside a Workbench.");
  return value;
}
