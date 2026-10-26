import { timelineKey, type TimelineItem } from "./timeline";

export interface ProcessTimeline {
  items: readonly TimelineItem[];
  /** 过程条目到末尾概要行的映射，也用于折叠后的阅读位置定位。 */
  owners: ReadonlyMap<string, string>;
  processIds: ReadonlySet<string>;
}

/** 按输入边界划分轮次；没有响应计量的收束轮也独立分组，正在运行的尾段保持原样。 */
export function groupTurnProcesses(items: readonly TimelineItem[], running: boolean): ProcessTimeline {
  const result: TimelineItem[] = [];
  const owners = new Map<string, string>();
  const processIds = new Set<string>();
  let pending: TimelineItem[] = [];
  let inputId: string | null = null;
  const finish = (settled: boolean) => {
    const footer = pending.find(item => item.kind === "turn-metrics");
    // 阅读起点可落在轮次中间，轮尾保留原输入身份，收纳不依赖用户消息仍可见。
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
    // 压缩可以发生在最终答复之后；正文仍留在原位置一侧，压缩标记始终独立可见。
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

/** 仅移除隐藏条目，不改变条目身份、原有视图与条目内部的开合状态。 */
export function visibleTurnProcesses(grouped: ProcessTimeline, open: ReadonlySet<string>): TimelineItem[] {
  return grouped.items.flatMap(item => {
    const owner = grouped.owners.get(timelineKey(item));
    if (owner && !open.has(owner)) return [];
    return [item.kind === "turn-process" ? { ...item, open: open.has(item.id) } : item];
  });
}
