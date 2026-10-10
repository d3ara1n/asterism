import type { WorkbenchOperation } from "../session/controller";
import { createContext, createElement, useContext, useSyncExternalStore, type ReactNode } from "react";
import type { WorkbenchSnapshot } from "../../../shared/workbench";
import type { SessionController } from "../session/controller";

/** 工作台向卡片与更深浮岛提供的环境；卡片节点数据只保留对象与视图状态。 */
export interface WorkbenchEnvironment {
  controller: SessionController;
  session: WorkbenchSnapshot;
  ready: boolean;
  busy: boolean;
  historical: boolean;
  run: (command: WorkbenchOperation) => Promise<boolean>;
  /** 代理对话草稿由应用层按代理对象保存；同一会话的多个代理互不共享。 */
  draft: (agentId: string) => string;
  onDraftChange: (agentId: string, value: string) => void;
  onHome: () => void;
}
export type WorkbenchView = WorkbenchEnvironment & {
  /** 打开隐藏卡片并在投影和测量就绪后定位；不改变历史查看位置。 */
  locate: (objectId: string) => Promise<void>;
};

/**
 * 更深浮岛由 Screen 渲染，不在工作台的 React 子树内；
 * 工作台把最新环境写入 store，浮岛经 WorkbenchScope 订阅同一份环境。
 */
export class WorkbenchStore {
  private value: WorkbenchView | null = null;
  private listeners = new Set<() => void>();
  get = (): WorkbenchView | null => this.value;
  set(value: WorkbenchView): void { this.value = value; this.listeners.forEach(listener => listener()); }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
}

export const WorkbenchContext = createContext<WorkbenchView | null>(null);

export function WorkbenchScope({ store, children }: { store: WorkbenchStore; children: ReactNode }) {
  const value = useSyncExternalStore(store.subscribe, store.get);
  return value ? createElement(WorkbenchContext.Provider, { value }, children) : null;
}

export function useWorkbench(): WorkbenchView {
  const value = useContext(WorkbenchContext);
  if (!value) throw new Error("useWorkbench must be used inside a Workbench.");
  return value;
}
