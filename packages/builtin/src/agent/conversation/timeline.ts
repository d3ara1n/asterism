import type { z } from "zod";
import type { ModelLiveBlock, SessionSnapshot, SessionRecord, ModelInputPart } from "@asterism/sdk/contracts";
import { ContextSummary, Execution, AgentInputMessage, type AgentMessageSender } from "@asterism/builtin-api/contracts";
import { turnMetrics, type TurnMetricsData } from "./turn-metrics";
import type { CompressionActivity, InlineFeedback } from "../feedback";
import type { HistoryBoundary } from "./history-window";

type SavedBlock = Extract<z.infer<typeof Execution.schema>, { type: "block" }>["block"] & {
  id: string; createdAt: string;
};
export type TimelineItem = SavedBlock | ModelLiveBlock
  | { kind: "message"; id: string; parts: readonly ModelInputPart[]; sender: AgentMessageSender; startsTurn?: boolean }
  | { kind: "summary"; id: string; text: string }
  | { kind: "compression"; id: string; status: CompressionActivity["status"] | "completed" | "boundary" }
  | { kind: "turn-metrics"; id: string; inputId: string; metrics: TurnMetricsData; incomplete: boolean; replyMarkdown: string | null; finalResponseId: string | null }
  | { kind: "turn-process"; id: string; toolCount: number; incomplete: boolean; open: boolean }
  | ({ kind: "notice" } & InlineFeedback);
export function timelineKey(item: TimelineItem): string {
  return "responseId" in item ? JSON.stringify([item.responseId, item.ordinal]) : item.id;
}
/** 正在生成：只有实时块（尚未落库、无 createdAt）且未结束；已保存的未完成块不算生成中。 */
export function generating(item: TimelineItem): boolean {
  return (item.kind === "text" || item.kind === "thinking") && !("createdAt" in item) && item.endedAt === null;
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
  if (record.source?.resource?.id !== agentId) return null;
  const summary = ContextSummary.decode(record);
  if (summary?.status === "known") return { kind: "compression", id: record.id, status: "completed" };
  const message = AgentInputMessage.decode(record);
  if (message?.status === "known") return { kind: "message", id: record.id, parts: message.data.parts, sender: message.data.sender, startsTurn: message.data.startsTurn };
  const execution = Execution.decode(record);
  if (execution?.status === "known") return savedTimelineBlock(record, execution.data.block);
  return null;
}
/** 历史与临时反馈的组合：流式增量期间保持条目身份，供界面按引用跳过重渲染。 */
export interface SavedTimeline { items: readonly TimelineItem[]; keys: ReadonlySet<string>; tail: TimelineItem | null }

/** 真实块来自当前路径，临时反馈插在已有节点之后；轮次概要位于轮尾。 */
export function savedTimeline(snapshot: SessionSnapshot, agentId: string, running: boolean, feedback: readonly InlineFeedback[] = [],
  options: { boundary?: HistoryBoundary | null; compressions?: readonly CompressionActivity[] } = {}): SavedTimeline {
  const path = snapshot.records.all({ scope: "timeline" });
  const start = options.boundary ? path.findIndex(record => record.id === options.boundary!.keptFrom) : 0;
  const summaryIndex = options.boundary ? path.findIndex(record => record.id === options.boundary!.summaryId) : -1;
  if (start < 0 || (options.boundary && summaryIndex < start))
    throw new Error("The conversation compression boundary is not on the current timeline.");
  const after = new Map<string | null, TimelineItem[]>();
  for (const value of options.compressions ?? []) {
    const items = after.get(value.afterNodeId) ?? [];
    items.push({ kind: "compression", id: value.id, status: value.status });
    after.set(value.afterNodeId, items);
  }
  for (const value of feedback) {
    const items = after.get(value.afterNodeId) ?? [];
    items.push({ ...value, kind: "notice" });
    after.set(value.afterNodeId, items);
  }
  const keys = new Set<string>();
  const visibleTurns = new Set<string>();
  let inputId: string | null = null;
  const saved: TimelineItem[] = options.boundary
    ? [{ kind: "compression", id: `compression-boundary:${options.boundary.summaryId}`, status: "boundary" }]
    : [...(after.get(null) ?? [])];
  for (const [index, record] of path.entries()) {
    const value = item(record, agentId);
    if (value) keys.add(timelineKey(value));
    if (value?.kind === "message" && value.startsTurn) inputId = value.id;
    if (index < start) continue;
    if (value && value.kind !== "compression" && inputId) visibleTurns.add(inputId);
    if (value && !(value.kind === "compression" && index <= summaryIndex)) saved.push(value);
    saved.push(...(after.get(record.id) ?? []));
  }
  const summaries = turnMetrics(snapshot, agentId, running).filter(turn => visibleTurns.has(turn.inputId));
  const before = new Map(summaries.map(turn => [turn.nextInputId, turn]));
  const measured = (turn: typeof summaries[number]): TimelineItem => ({
    kind: "turn-metrics", id: `turn-metrics:${turn.inputId}`, inputId: turn.inputId, metrics: turn.metrics, incomplete: turn.incomplete,
    replyMarkdown: turn.replyMarkdown,
    finalResponseId: turn.finalResponseId,
  });
  const items = saved.flatMap(value => {
    const turn = value.kind === "message" ? before.get(value.id) : undefined;
    return turn ? [measured(turn), value] : [value];
  });
  const last = before.get(null);
  return { items, keys, tail: last ? measured(last) : null };
}

/** 实时块以响应身份接续在已保存条目之后；已落库的同一块不重复展示。 */
export function withLive(saved: SavedTimeline, live: readonly ModelLiveBlock[]): TimelineItem[] {
  return [...saved.items, ...live.filter(block => !saved.keys.has(timelineKey(block))), ...(saved.tail ? [saved.tail] : [])];
}

/** 有可显示内容的条目；空思考块不占列表位置，避免虚拟列表留下只有间距的空项。 */
export function displayedTimeline(items: readonly TimelineItem[]): TimelineItem[] {
  return items.filter(item => item.kind !== "thinking" || item.text.trim() !== "");
}

/** 虚拟列表中始终挂载的条目：尚未落库的实时块（流式动画与计时不能随卸载重放）与末项（跟随输出的锚点）。 */
export function mountedTimelineIndexes(items: readonly TimelineItem[]): number[] {
  const indexes = items.flatMap((item, index) => "responseId" in item && !("createdAt" in item) ? [index] : []);
  if (items.length && indexes.at(-1) !== items.length - 1) indexes.push(items.length - 1);
  return indexes;
}
