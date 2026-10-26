import { useCallback, useRef, useState } from "react";
import { timelineKey, type TimelineItem } from "./timeline";

/** 退场条目仍占有虚拟列表中的有效位置，Motion 完成后才释放；离屏条目直接移除。 */
export function retainExitingItems(
  previous: readonly TimelineItem[], target: readonly TimelineItem[],
  mounted: ReadonlySet<string>, owners: ReadonlyMap<string, string>,
): TimelineItem[] {
  const keys = new Set(target.map(timelineKey));
  const positions = new Map(target.map((item, index) => [timelineKey(item), index]));
  const previousKeys = new Set(previous.map(timelineKey));
  const completedCompression = target.find(item => item.kind === "compression" && item.status === "completed" && !previousKeys.has(timelineKey(item)));
  const before = new Map<string | null, TimelineItem[]>();
  let next: string | null = null;
  for (let index = previous.length - 1; index >= 0; index--) {
    const item = previous[index]!, key = timelineKey(item);
    if (keys.has(key)) { next = key; continue; }
    if (!mounted.has(key)) continue;
    // 自动收束会新增概要行，退场过程仍在它上方。
    const owner = owners.get(key);
    const replacement = owner && keys.has(owner) ? owner
      : item.kind === "compression" && item.status === "running" && completedCompression ? timelineKey(completedCompression) : null;
    // 中途补充等仍可见的后继若更靠前，过程继续留在它之前，退场期间也保持阅读顺序。
    const anchor = replacement && (next === null || positions.get(replacement)! < positions.get(next)!) ? replacement : next;
    const entries = before.get(anchor) ?? [];
    entries.unshift(item);
    before.set(anchor, entries);
  }
  return [...target.flatMap(item => [...(before.get(timelineKey(item)) ?? []), item]), ...(before.get(null) ?? [])];
}

/** 只协调虚拟列表的条目存在性；动画时序及中途反向由 AnimatePresence 负责。 */
export function useTimelinePresence(target: readonly TimelineItem[], owners: ReadonlyMap<string, string>, reducedMotion: boolean) {
  const mounted = useRef(new Set<string>());
  const entering = useRef(new Set<string>());
  const [state, setState] = useState(() => ({ target, items: target }));
  let items = state.items;
  if (state.target !== target || (reducedMotion && state.items !== target)) {
    const previousKeys = new Set(state.target.map(timelineKey));
    const targetKeys = new Set(target.map(timelineKey));
    const entrances = new Set([...entering.current].filter(key => targetKeys.has(key)));
    for (const item of target) {
      const key = timelineKey(item);
      if (!previousKeys.has(key) && (owners.has(key) || item.kind === "turn-process" || item.kind === "compression"))
        entrances.add(key);
    }
    entering.current = reducedMotion ? new Set() : entrances;
    items = reducedMotion ? target : retainExitingItems(state.items, target, mounted.current, owners);
    setState({ target, items });
  }
  const onMount = useCallback((key: string) => {
    mounted.current.add(key);
    entering.current.delete(key);
    return () => { mounted.current.delete(key); };
  }, []);
  const onExitComplete = useCallback((key: string) => {
    setState(current => current.target.some(item => timelineKey(item) === key) ? current
      : { ...current, items: current.items.filter(item => timelineKey(item) !== key) });
  }, []);
  const skipEntrances = useCallback(() => { entering.current.clear(); }, []);
  return { items, entering: entering.current, onMount, onExitComplete, skipEntrances };
}
