import { createContext, createElement, useContext, useSyncExternalStore, type ReactNode } from "react";
import type { Command, WorkbenchSnapshot } from "../../../shared/contracts";

/** 工作台向卡片与更深浮岛提供的环境；卡片节点数据只保留对象与视图状态。 */
export interface WorkbenchEnvironment {
  session: WorkbenchSnapshot;
  ready: boolean;
  busy: boolean;
  historical: boolean;
  run: (command: Command) => Promise<boolean>;
  /** 主代理对话草稿由应用层按任务保存。 */
  draft: string;
  onDraftChange: (value: string) => void;
  onHome: () => void;
}

/**
 * 更深浮岛由 Screen 渲染，不在工作台的 React 子树内；
 * 工作台把最新环境写入 store，浮岛经 WorkbenchScope 订阅同一份环境。
 */
export class WorkbenchStore {
  private value: WorkbenchEnvironment | null = null;
  private listeners = new Set<() => void>();
  get = (): WorkbenchEnvironment | null => this.value;
  set(value: WorkbenchEnvironment): void { this.value = value; this.listeners.forEach(listener => listener()); }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
}

export const WorkbenchContext = createContext<WorkbenchEnvironment | null>(null);

export function WorkbenchScope({ store, children }: { store: WorkbenchStore; children: ReactNode }) {
  const value = useSyncExternalStore(store.subscribe, store.get);
  return value ? createElement(WorkbenchContext.Provider, { value }, children) : null;
}

export function useWorkbench(): WorkbenchEnvironment {
  const value = useContext(WorkbenchContext);
  if (!value) throw new Error("useWorkbench must be used inside a Workbench.");
  return value;
}
