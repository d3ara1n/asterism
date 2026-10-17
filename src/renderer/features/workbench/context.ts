import type { WorkbenchOperation } from "../session/controller";
import { createContext, createElement, useContext, useRef, useSyncExternalStore, type ReactNode } from "react";
import type { WorkbenchSnapshot } from "../../../shared/workbench";
import type { SessionController } from "../session/controller";
import type { WorkbenchCanvas } from "./canvas";

/** 工作台向卡片与更深浮岛提供的环境；卡片节点数据只保留对象与视图状态。 */
export interface WorkbenchEnvironment {
  controller: SessionController;
  session: WorkbenchSnapshot;
  ready: boolean;
  busy: boolean;
  run: (command: WorkbenchOperation) => Promise<boolean>;

}
export type WorkbenchView = WorkbenchEnvironment & {
  canvas: WorkbenchCanvas;
};

/**
 * 更深浮岛与聚焦浮岛由 Screen 渲染，不在工作台的 React 子树内；
 * 应用持有一份 store，当前工作台把最新环境写入其中，浮岛经 WorkbenchScope 订阅。
 */
export class WorkbenchStore {
  private value: WorkbenchView | null = null;
  private listeners = new Set<() => void>();
  get = (): WorkbenchView | null => this.value;
  set(value: WorkbenchView): void { this.value = value; this.listeners.forEach(listener => listener()); }
  /** 撤回仍为当前值的环境；已被其他工作台覆盖时无效。 */
  clear(value: WorkbenchView): void {
    if (this.value !== value) return;
    this.value = null; this.listeners.forEach(listener => listener());
  }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
}

export const WorkbenchContext = createContext<WorkbenchView | null>(null);

/**
 * 浮岛绑定所属会话：只接受该会话的环境，切换会话后保留最后一份，
 * 让退场中的浮岛继续呈现原内容；所属会话的环境就绪前不渲染内容。
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
