import { timelineKey, type TimelineItem } from "./timeline";

export interface ProcessTimeline {
  items: readonly TimelineItem[];
  /** Maps process items to the trailing summary row, also supporting reading-position navigation after folding. */
  owners: ReadonlyMap<string, string>;
  processIds: ReadonlySet<string>;
}

/** Groups turns by input boundaries; settled turns without response measurements are still grouped separately, while the running tail remains unchanged. */
export function groupTurnProcesses(items: readonly TimelineItem[], running: boolean): ProcessTimeline {
  const result: TimelineItem[] = [];
  const owners = new Map<string, string>();
  const processIds = new Set<string>();
  let pending: TimelineItem[] = [];
  let inputId: string | null = null;
  const finish = (settled: boolean) => {
    const footer = pending.find(item => item.kind === "turn-metrics");
    // Reading may begin mid-turn; the turn end retains the original input identity, so folding does not require the user message to remain visible.
    const turnId = inputId ?? footer?.inputId;
    if (!turnId || !settled) {
      result.push(...pending);
      pending = [];
      return;
    }
    const id = `turn-process:${turnId}`;
    const final: Extract<TimelineItem, { kind: "text" }>[] = [];
    const body: TimelineItem[] = [];
    let lastProcess = -1;
    let finalPosition = -1;
    let toolCount = 0;
    for (const entry of pending) {
      if (entry.kind === "turn-metrics") continue;
      if (entry.kind === "text" && entry.responseId === footer?.finalResponseId) {
        if (finalPosition < 0) finalPosition = body.length;
        final.push(entry);
        continue;
      }
      body.push(entry);
      if (entry.kind === "text" || entry.kind === "thinking" || entry.kind === "toolcall") {
        owners.set(timelineKey(entry), id);
        lastProcess = body.length - 1;
        if (entry.kind === "toolcall") toolCount++;
      }
    }
    // Compression can follow the final reply; body text stays on its original side of the marker, and compression markers remain independently visible.
    final.sort((a, b) => a.ordinal - b.ordinal);
    if (final.length) body.splice(Math.max(finalPosition, lastProcess + 1), 0, ...final);
    if (lastProcess >= 0) {
      processIds.add(id);
      body.splice(lastProcess + 1, 0, { kind: "turn-process", id, toolCount, incomplete: footer?.incomplete ?? true, open: false });
    }
    result.push(...body, ...(footer ? [footer] : []));
    pending = [];
  };
  for (const item of items) {
    if (item.kind === "message" && item.startsTurn) {
      finish(true);
      inputId = item.id;
    }
    pending.push(item);
  }
  finish(!running);
  return { items: result, owners, processIds };
}

/** Removes hidden items only, without changing item identity, existing views, or internal expansion state. */
export function visibleTurnProcesses(grouped: ProcessTimeline, open: ReadonlySet<string>): TimelineItem[] {
  return grouped.items.flatMap(item => {
    const owner = grouped.owners.get(timelineKey(item));
    if (owner && !open.has(owner)) return [];
    return [item.kind === "turn-process" ? { ...item, open: open.has(item.id) } : item];
  });
}
