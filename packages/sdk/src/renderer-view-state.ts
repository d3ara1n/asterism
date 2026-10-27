import { createContext, createElement, useContext, useState, type ReactNode } from "react";

/**
 * List item view state: items in virtualized lists unmount and remount as they scroll; user-modified expansion, tabs, and other
 * state are stored per item in storage supplied by the list owner and restored on remount. Outside an item scope, this behaves like component state.
 */
export type RendererViewStateEntry = Map<string, unknown>;
const Entry = createContext<RendererViewStateEntry | null>(null);

/** The list owner provides stable storage for each item; the same instance must be passed when that item remounts. */
export function RendererViewStateProvider({ value, children }: { value: RendererViewStateEntry; children?: ReactNode }) {
  return createElement(Entry.Provider, { value }, children);
}

/**
 * Read and write one view state value within the current item. key is unique within the item and prefixed with the plugin ID to avoid conflicts with other contributors;
 * when key is null, this is only component state and does not survive remounts. initial is used only when the item has no such value yet.
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
