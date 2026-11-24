import { isModelBlock, timelineKey, type TimelineItem } from "./timeline";

export interface ProcessTimeline {
  items: readonly TimelineItem[];
  /** Maps collapsed items to the trailing summary row, also supporting reading-position navigation after folding. */
  owners: ReadonlyMap<string, string>;
  processIds: ReadonlySet<string>;
}

/**
 * Consecutive inputs share a conversation group. Any input after model content closes that group, independently of execution turns.
 *
 * Folding follows one rule: whatever occurred while a group succeeded folds with it. Notices and compaction markers are not
 * judged by importance or origin, because a group that truly blocked never succeeds and never folds, so its notices stay
 * visible. The summary row reports what it hides, so the account survives without occupying the reading flow.
 */
export function groupConversationProcesses(items: readonly TimelineItem[], running: boolean): ProcessTimeline {
  const result: TimelineItem[] = [];
  const owners = new Map<string, string>();
  const processIds = new Set<string>();
  let pending: TimelineItem[] = [];
  let lastBlock: Extract<TimelineItem, { ordinal: number }> | null = null;
  // A group keeps its fold only when its last response completed; unfinished work stays open for reading.
  const finish = (settled: boolean) => {
    if (!lastBlock || !settled) {
      result.push(...pending);
      pending = [];
      lastBlock = null;
      return;
    }
    // The last response is stable when earlier history is loaded, even if the group's inputs are outside the reading window.
    const id = `conversation-process:${lastBlock.responseId}`;
    const completed = "responseCompleted" in lastBlock && lastBlock.responseCompleted === true;
    const final: Extract<TimelineItem, { kind: "text" }>[] = [];
    const body: TimelineItem[] = [];
    let lastProcess = -1;
    let finalPosition = -1;
    const content = new Set<"text" | "thinking">();
    const tools: Extract<TimelineItem, { kind: "toolcall" }>[] = [];
    const events: TimelineItem[] = [];
    for (const entry of pending) {
      if (entry.kind === "text" && completed && entry.responseId === lastBlock.responseId) {
        if (finalPosition < 0) finalPosition = body.length;
        final.push(entry);
        continue;
      }
      body.push(entry);
      if (isModelBlock(entry)) {
        owners.set(timelineKey(entry), id);
        lastProcess = body.length - 1;
        if (entry.kind === "toolcall") tools.push(entry);
        else if ((entry.kind === "text" || entry.kind === "thinking") && entry.text.trim()) content.add(entry.kind);
      } else if (completed && (entry.kind === "notice" || entry.kind === "compression")) {
        // Events fold only together with the process that owns them; the summary row reports each count.
        events.push(entry);
      }
    }
    // The final reply keeps its position relative to the body it answered, whatever the folding order.
    final.sort((a, b) => a.ordinal - b.ordinal);
    if (final.length) body.splice(Math.max(finalPosition, lastProcess + 1), 0, ...final);
    if (lastProcess >= 0) {
      processIds.add(id);
      body.splice(lastProcess + 1, 0, { kind: "conversation-process", id, tools, content: [...content], incomplete: !completed,
        notices: events.filter(entry => entry.kind === "notice").length,
        compressions: events.filter(entry => entry.kind === "compression").length, open: false });
      for (const entry of events) owners.set(timelineKey(entry), id);
    }
    result.push(...body);
    pending = [];
    lastBlock = null;
  };
  for (const item of items) {
    if (item.kind === "message" && lastBlock) finish(true);
    pending.push(item);
    if (isModelBlock(item)) lastBlock = item;
  }
  finish(!running);
  return { items: result, owners, processIds };
}

/** Removes hidden items only, without changing item identity, existing views, or internal expansion state. */
export function visibleConversationProcesses(grouped: ProcessTimeline, open: ReadonlySet<string>): TimelineItem[] {
  return grouped.items.flatMap(item => {
    const owner = grouped.owners.get(timelineKey(item));
    if (owner && !open.has(owner)) return [];
    return [item.kind === "conversation-process" ? { ...item, open: open.has(item.id) } : item];
  });
}
