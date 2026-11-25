import { isModelBlock, timelineKey, type TimelineItem } from "./timeline";

export interface ProcessTimeline {
  items: readonly TimelineItem[];
  /** Maps collapsed items to the trailing summary row, also supporting reading-position navigation after folding. */
  owners: ReadonlyMap<string, string>;
  processIds: ReadonlySet<string>;
}

/** An input after model content closes the current process group, independently of execution turns. */
export function groupConversationProcesses(items: readonly TimelineItem[], running: boolean): ProcessTimeline {
  const result: TimelineItem[] = [];
  const owners = new Map<string, string>();
  const processIds = new Set<string>();
  let pending: TimelineItem[] = [];
  let lastBlock: Extract<TimelineItem, { ordinal: number }> | null = null;
  const finish = (settled: boolean) => {
    const finalReply = lastBlock && "finalReply" in lastBlock && lastBlock.finalReply;
    if (!lastBlock || (!settled && !finalReply)) {
      result.push(...pending);
      pending = [];
      lastBlock = null;
      return;
    }
    // The last response is stable when earlier history is loaded, even if the group's inputs are outside the reading window.
    const id = `conversation-process:${lastBlock.responseId}`;
    const final: Extract<TimelineItem, { kind: "text" }>[] = [];
    const body: TimelineItem[] = [];
    let lastProcess = -1;
    let finalPosition = -1;
    const content = new Set<"text" | "thinking">();
    const tools: Extract<TimelineItem, { kind: "toolcall" }>[] = [];
    const foldableEvents: Extract<TimelineItem, { kind: "notice" | "compression" }>[] = [];
    // Only events bracketed by model output belong to the process. In particular, a standalone compaction can follow the reply.
    let betweenBlocks = false;
    for (const entry of pending) {
      const modelBlock = isModelBlock(entry);
      if (modelBlock) betweenBlocks = entry !== lastBlock;
      if (entry.kind === "text" && finalReply && entry.responseId === lastBlock.responseId) {
        if (finalPosition < 0) finalPosition = body.length;
        final.push(entry);
        continue;
      }
      body.push(entry);
      if (modelBlock) {
        owners.set(timelineKey(entry), id);
        lastProcess = body.length - 1;
        if (entry.kind === "toolcall") tools.push(entry);
        else if ((entry.kind === "text" || entry.kind === "thinking") && entry.text.trim()) content.add(entry.kind);
      } else if (betweenBlocks && (entry.kind === "notice" || entry.kind === "compression")) {
        foldableEvents.push(entry);
      }
    }
    // The final reply keeps its position relative to the body it answered, whatever the folding order.
    final.sort((a, b) => a.ordinal - b.ordinal);
    if (final.length) body.splice(Math.max(finalPosition, lastProcess + 1), 0, ...final);
    if (lastProcess >= 0) {
      processIds.add(id);
      let notices = 0, compressions = 0;
      for (const event of foldableEvents) {
        owners.set(timelineKey(event), id);
        if (event.kind === "notice") notices++;
        else compressions++;
      }
      body.splice(lastProcess + 1, 0, { kind: "conversation-process", id, tools, content: [...content],
        notices, compressions, open: false });
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
