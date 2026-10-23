import type { z } from "zod";
import type { ModelLiveBlock, SessionSnapshot, SessionRecord, ModelInputPart } from "@atelier/sdk/contracts";
import { ContextSummary, Execution, Notice, AgentInputMessage, type AgentMessageSender } from "@atelier/builtin-api/contracts";
import { turnMetrics, type TurnMetricsData } from "./turn-metrics";

type SavedBlock = Extract<z.infer<typeof Execution.schema>, { type: "block" }>["block"] & {
  id: string; createdAt: string;
};
export type TimelineItem = SavedBlock | ModelLiveBlock
  | { kind: "message"; id: string; parts: readonly ModelInputPart[]; sender: AgentMessageSender }
  | { kind: "summary"; id: string; text: string }
  | { kind: "turn-metrics"; id: string; metrics: TurnMetricsData; incomplete: boolean; replyMarkdown: string | null }
  | ({ kind: "notice"; id: string } & z.infer<typeof Notice.schema>);
export function timelineKey(item: TimelineItem): string {
  return "responseId" in item ? JSON.stringify([item.responseId, item.ordinal]) : item.id;
}
/** 对话与诊断共用历史块的展示转换；摘要式思考也能阅读，原始记录不改写。 */
export function savedTimelineBlock(record: Pick<SessionRecord, "id" | "createdAt">,
  block: Extract<z.infer<typeof Execution.schema>, { type: "block" }>["block"]): SavedBlock {
  return {
    ...block, id: record.id, createdAt: record.createdAt,
    ...(block.kind === "thinking" ? { text: block.text || block.summary } : {}),
  };
}
function item(record: SessionRecord, agentId: string): TimelineItem | null {
  const notice = Notice.decode(record);
  if (notice?.status === "known" && (!record.source?.resource || record.source?.resource.id === agentId)) return { kind: "notice", id: record.id, ...notice.data };
  if (record.source?.resource?.id !== agentId) return null;
  const summary = ContextSummary.decode(record);
  if (summary?.status === "known") return { kind: "summary", id: record.id, text: summary.data.summary };
  const message = AgentInputMessage.decode(record);
  if (message?.status === "known") return { kind: "message", id: record.id, parts: message.data.parts, sender: message.data.sender };
  const execution = Execution.decode(record);
  if (execution?.status === "known" && execution.data.type === "diagnostic")
    return { ...execution.data, kind: "notice", id: record.id };
  if (execution?.status === "known" && execution.data.type === "block") return savedTimelineBlock(record, execution.data.block);
  return null;
}
/** 已保存部分：只随快照与运行状态变化，流式增量期间保持条目身份，供界面按引用跳过重渲染。 */
export interface SavedTimeline { items: readonly TimelineItem[]; keys: ReadonlySet<string>; tail: TimelineItem | null }

/** 所有已保存块直接来自当前路径；轮次概要插在下一轮输入之前，末轮概要作为尾项。 */
export function savedTimeline(snapshot: SessionSnapshot, agentId: string, running: boolean): SavedTimeline {
  const path = snapshot.records.all({ scope: "timeline" });
  const saved = path.flatMap(record => { const value = item(record, agentId); return value ? [value] : []; });
  const summaries = turnMetrics(snapshot, agentId, running);
  const before = new Map(summaries.map(turn => [turn.nextInputId, turn]));
  const measured = (turn: typeof summaries[number]): TimelineItem => ({
    kind: "turn-metrics", id: `turn-metrics:${turn.inputId}`, metrics: turn.metrics, incomplete: turn.incomplete,
    replyMarkdown: turn.replyMarkdown,
  });
  const items = saved.flatMap(value => {
    const turn = value.kind === "message" ? before.get(value.id) : undefined;
    return turn ? [measured(turn), value] : [value];
  });
  const last = before.get(null);
  return { items, keys: new Set(saved.map(timelineKey)), tail: last ? measured(last) : null };
}

/** 实时块以响应身份接续在已保存条目之后；已落库的同一块不重复展示。 */
export function withLive(saved: SavedTimeline, live: readonly ModelLiveBlock[]): TimelineItem[] {
  return [...saved.items, ...live.filter(block => !saved.keys.has(timelineKey(block))), ...(saved.tail ? [saved.tail] : [])];
}

export function conversationTimeline(snapshot: SessionSnapshot, agentId: string, live: readonly ModelLiveBlock[], running = live.length > 0): TimelineItem[] {
  return withLive(savedTimeline(snapshot, agentId, running), live);
}
