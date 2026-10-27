import type { z } from "zod";
import type { ModelLiveBlock, SessionSnapshot, SessionRecord, ModelInputPart } from "@asterism-app/sdk/contracts";
import { ContextSummary, Execution, AgentInputMessage, type AgentMessageSender } from "@asterism-app/builtin-api/contracts";
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
/** Generating: only live blocks (not yet persisted, without createdAt) that have not ended; saved incomplete blocks do not count as generating. */
export function generating(item: TimelineItem): boolean {
  return (item.kind === "text" || item.kind === "thinking") && !("createdAt" in item) && item.endedAt === null;
}
/** Conversation and diagnostics share display conversion for historical blocks; summary-style thinking remains readable without rewriting original records. */
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
/** Combines history and temporary feedback, preserving item identity during streaming deltas so the UI can skip rerenders by reference. */
export interface SavedTimeline { items: readonly TimelineItem[]; keys: ReadonlySet<string>; tail: TimelineItem | null }

/** Actual blocks come from the current path, temporary feedback is inserted after existing nodes, and turn summaries sit at turn ends. */
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

/** Live blocks follow saved items using response identity; the same block is not displayed twice once persisted. */
export function withLive(saved: SavedTimeline, live: readonly ModelLiveBlock[]): TimelineItem[] {
  return [...saved.items, ...live.filter(block => !saved.keys.has(timelineKey(block))), ...(saved.tail ? [saved.tail] : [])];
}

/** Items with displayable content; empty thinking blocks occupy no list position, preventing spacing-only empty items in the virtual list. */
export function displayedTimeline(items: readonly TimelineItem[]): TimelineItem[] {
  return items.filter(item => item.kind !== "thinking" || item.text.trim() !== "");
}

/** Items kept mounted in the virtual list: unpersisted live blocks (streaming animations and timing must not replay after unmounting) and the last item (the output-following anchor). */
export function mountedTimelineIndexes(items: readonly TimelineItem[]): number[] {
  const indexes = items.flatMap((item, index) => "responseId" in item && !("createdAt" in item) ? [index] : []);
  if (items.length && indexes.at(-1) !== items.length - 1) indexes.push(items.length - 1);
  return indexes;
}
