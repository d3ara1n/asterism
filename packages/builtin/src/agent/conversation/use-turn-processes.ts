import { useCallback, useLayoutEffect, useMemo, useState } from "react";
import type { TimelineItem } from "./timeline";
import { groupTurnProcesses, visibleTurnProcesses } from "./turn-process";
import type { TimelineViewState } from "./view-state";

/** Whole-turn expansion state is retained with the Agent view; resuming removes the summary, and the next settlement defaults to collapsed again. */
export function useTurnProcesses(items: readonly TimelineItem[], viewState: TimelineViewState, running: boolean) {
  const grouped = useMemo(() => groupTurnProcesses(items, running), [items, running]);
  const [open, setOpen] = useState(() => viewState.openProcesses);
  const save = useCallback((value: ReadonlySet<string>) => {
    viewState.openProcesses = value;
    setOpen(value);
  }, [viewState]);
  useLayoutEffect(() => {
    if ([...open].some(id => !grouped.processIds.has(id))) {
      save(new Set([...open].filter(id => grouped.processIds.has(id))));
    }
  }, [grouped, open, save]);
  const timeline = useMemo(() => visibleTurnProcesses(grouped, open), [grouped, open]);
  const toggle = useCallback((id: string) => {
    const next = new Set(open);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    save(next);
  }, [open, save]);
  return { timeline, processOwners: grouped.owners, toggle };
}
