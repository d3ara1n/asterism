import { createContext, createElement, useContext, useState, type ReactNode } from "react";

/**
 * 列表条目的视图状态：虚拟化列表中的条目随滚动卸载与重新挂载，用户改动过的展开、选项卡等
 * 状态按条目保存在列表所有者提供的存储中，重新挂载时恢复。不在条目作用域内时与组件状态相同。
 */
export type RendererViewStateEntry = Map<string, unknown>;
const Entry = createContext<RendererViewStateEntry | null>(null);

/** 列表所有者为每个条目提供稳定的存储；同一条目重新挂载时须传入同一个实例。 */
export function RendererViewStateProvider({ value, children }: { value: RendererViewStateEntry; children?: ReactNode }) {
  return createElement(Entry.Provider, { value }, children);
}

/**
 * 读写当前条目内的一项视图状态。key 在条目内唯一，以插件 ID 为前缀避免与其他贡献者冲突；
 * key 为 null 时只作组件状态，不随重新挂载保留。initial 只在条目尚无该项时取值。
 */
export function useRendererViewState<T>(key: string | null, initial: T | (() => T)): [T, (value: T) => void] {
  const entry = useContext(Entry);
  const stored = key !== null && entry !== null;
  const [value, setLocal] = useState<T>(() => {
    if (stored && entry.has(key)) return entry.get(key) as T;
    const created = typeof initial === "function" ? (initial as () => T)() : initial;
    if (stored) entry.set(key, created);
    return created;
  });
  const set = (next: T) => {
    if (stored) entry.set(key, next);
    setLocal(next);
  };
  return [value, set];
}
