import type { ModelBlock, ModelLiveBlock, RecordInfo, SessionRecord } from "@asterism-app/sdk/contracts";
import { decodeExecution, ContextSummary, AgentInputMessage, type AgentMessageSender, type AgentInputPart } from "@asterism-app/builtin-api/contracts";
import { turnMetrics, type TurnMeasurement, type TurnMetricsData } from "./turn-metrics.ts";
import type { CompressionActivity, InlineFeedback } from "../feedback.ts";
import type { HistoryBoundary } from "./history-window.ts";
import { isCompletedResponse, participatingBlocks } from "../response-messages.ts";

type DisplayBlock<T = ModelBlock> = T extends ModelBlock ? Omit<T, "source" | "requestParentId" | "continuation" | "completion" | "summary"> : never;
type SavedBlock = DisplayBlock & {
  /** partialContext: the block did not fully participate in later model input; failed: the request generating it failed before it closed. */
  id: string; createdAt: string; partialContext?: boolean; failed?: boolean;
  /** Computed before windowing and display filtering, so a retained response fragment keeps its completion state. */
  responseCompleted?: boolean;
};
export type TimelineItem = SavedBlock | ModelLiveBlock
  | { kind: "message"; id: string; parts: readonly AgentInputPart[]; sender: AgentMessageSender; startsTurn?: boolean }
  | { kind: "summary"; id: string; text: string }
  | { kind: "compression"; id: string; status: CompressionActivity["status"] | "completed" | "boundary"; details?: CompressionActivity["details"] }
  | { kind: "turn-metrics"; id: string; inputId: string; metrics: TurnMetricsData; incomplete: boolean; replyMarkdown: string | null }
  | { kind: "conversation-process"; id: string; content: readonly ("text" | "thinking")[]; tools: readonly Extract<SavedBlock | ModelLiveBlock, { kind: "toolcall" }>[]; incomplete: boolean; open: boolean }
  | ({ kind: "notice" } & InlineFeedback);
/** Saved and live model blocks; notices may carry a responseId but are not blocks. */
export function isModelBlock(item: TimelineItem): item is SavedBlock | ModelLiveBlock {
  return "ordinal" in item;
}
export function timelineKey(item: TimelineItem): string {
  return isModelBlock(item) ? JSON.stringify([item.responseId, item.ordinal]) : item.id;
}
/** Generating: only live blocks (not yet persisted, without createdAt) that have not ended; saved incomplete blocks do not count as generating. */
export function generating(item: TimelineItem): boolean {
  return (item.kind === "text" || item.kind === "thinking") && !("createdAt" in item) && item.endedAt === null;
}
/** Display content excludes provider continuation and request diagnostics; original records remain available to history readers. */
export function savedTimelineBlock(record: Pick<SessionRecord, "id" | "createdAt">, block: ModelBlock): SavedBlock {
  const { source: _source, requestParentId: _parent, continuation: _continuation, completion: _completion, ...display } = block;
  if (display.kind === "thinking") {
    const { summary, ...thinking } = display;
    return { ...thinking, text: thinking.text || summary, id: record.id, createdAt: record.createdAt };
  }
  return { ...display, id: record.id, createdAt: record.createdAt };
}
type ObservedBlock = ModelBlock & { id: string; createdAt: string };
type RecordedItem = ObservedBlock | Extract<TimelineItem, { kind: "message" | "compression" }>;
function item(record: SessionRecord, agentId: string): RecordedItem | null {
  if (record.source?.resource?.id !== agentId) return null;
  const summary = ContextSummary.decode(record);
  if (summary?.status === "known") return { kind: "compression", id: record.id, status: "completed" };
  const message = AgentInputMessage.decode(record);
  if (message?.status === "known") return { kind: "message", id: record.id, parts: message.data.parts, sender: message.data.sender, startsTurn: message.data.startsTurn };
  const execution = decodeExecution(record);
  if (execution?.status === "known") return { ...execution.data.block, id: record.id, createdAt: record.createdAt };
  return null;
}
/** Reading retains display values and anchor identities, not a second copy of raw records and diagnostic payloads. */
export interface ConversationProjection {
  entries: readonly { id: string; value: TimelineItem | null }[];
  keys: ReadonlySet<string>;
  notices: readonly Extract<TimelineItem, { kind: "notice" }>[];
  failedResponses: ReadonlySet<string>;
  turns: readonly TurnMeasurement[];
  boundary: HistoryBoundary | null;
}
export interface SavedTimeline { items: readonly TimelineItem[]; keys: ReadonlySet<string>; tail: TimelineItem | null }
type ProjectionOptions = { boundary?: HistoryBoundary | null; from?: string };

/** Decode and measure while bodies are owned by the read, then release all non-display history. */
export function projectConversation(path: readonly RecordInfo[], agentId: string, options: ProjectionOptions = {},
  bodies: readonly SessionRecord[] = path.filter((record): record is SessionRecord => "data" in record)): ConversationProjection {
  const byId = new Map(bodies.map(record => [record.id, record]));
  const startId = options.from ?? options.boundary?.keptFrom;
  const start = startId ? path.findIndex(record => record.id === startId) : 0;
  const summaryIndex = options.boundary ? path.findIndex(record => record.id === options.boundary!.summaryId) : -1;
  if (start < 0) throw new Error("The conversation compression boundary is not on the current timeline.");
  const values = path.map(info => { const record = byId.get(info.id); return record ? item(record, agentId) : null; });
  const responses = new Map<string, ObservedBlock[]>();
  for (const value of values) {
    if (!value || !("ordinal" in value)) continue;
    const blocks = responses.get(value.responseId) ?? [];
    blocks.push(value); responses.set(value.responseId, blocks);
  }
  const presentation = new Map<string, { partialContext?: boolean; failed?: boolean; responseCompleted: boolean }>();
  const failedResponses = new Set<string>();
  const notices: Extract<TimelineItem, { kind: "notice" }>[] = [];
  for (const [responseId, blocks] of responses) {
    const participating = new Set(participatingBlocks(blocks).map(block => block.ordinal));
    const terminal = blocks.find(block => block.completion?.termination);
    const termination = terminal?.completion?.termination;
    const responseCompleted = isCompletedResponse(blocks);
    for (const block of blocks) {
      const partialContext = !participating.has(block.ordinal) || !block.complete;
      const failed = !block.complete && termination?.reason === "failed";
      presentation.set(timelineKey(block), { responseCompleted, ...(partialContext ? { partialContext: true } : {}), ...(failed ? { failed: true } : {}) });
    }
    if (termination?.reason === "failed") {
      failedResponses.add(responseId);
      const last = blocks.at(-1)!;
      notices.push({ kind: "notice", id: `response-error:${responseId}`, afterNodeId: last.id,
        origin: termination.origin, level: "error", code: termination.code, message: termination.message,
        ...(termination.details ? { details: termination.details } : {}) });
    }
  }
  const keys = new Set<string>();
  const visibleTurns = new Set<string>();
  const entries: { id: string; value: TimelineItem | null }[] = [];
  let inputId: string | null = null;
  for (const [index, record] of path.entries()) {
    const original = values[index]!;
    const value = original && "ordinal" in original
      ? { ...savedTimelineBlock(original, original), ...presentation.get(timelineKey(original)) } : original;
    if (value) keys.add(timelineKey(value));
    if (value?.kind === "message" && value.startsTurn) inputId = value.id;
    if (index < start) continue;
    if (value && value.kind !== "compression" && inputId) visibleTurns.add(inputId);
    entries.push({ id: record.id, value: value?.kind === "compression" && index <= summaryIndex ? null : value });
  }
  return { entries, keys, notices, failedResponses, boundary: options.boundary ?? null,
    turns: turnMetrics(bodies, agentId, false).filter(turn => visibleTurns.has(turn.inputId)) };
}

/** Transient feedback and execution state can change without rereading or retaining raw history bodies. */
export function conversationTimeline(projection: ConversationProjection, running: boolean, feedback: readonly InlineFeedback[] = [],
  compressions: readonly CompressionActivity[] = []): SavedTimeline {
  const after = new Map<string | null, TimelineItem[]>();
  for (const notice of projection.notices) after.set(notice.afterNodeId, [...after.get(notice.afterNodeId) ?? [], notice]);
  for (const value of compressions) {
    const items = after.get(value.afterNodeId) ?? [];
    items.push({ kind: "compression", id: value.id, status: value.status, ...(value.details ? { details: value.details } : {}) });
    after.set(value.afterNodeId, items);
  }
  for (const value of feedback) {
    if (value.responseId && projection.failedResponses.has(value.responseId)) continue;
    const items = after.get(value.afterNodeId) ?? [];
    items.push({ ...value, kind: "notice" }); after.set(value.afterNodeId, items);
  }
  const saved: TimelineItem[] = projection.boundary
    ? [{ kind: "compression", id: `compression-boundary:${projection.boundary.summaryId}`, status: "boundary" }]
    : [...(after.get(null) ?? [])];
  for (const entry of projection.entries) {
    if (entry.value) saved.push(entry.value);
    saved.push(...(after.get(entry.id) ?? []));
  }
  const summaries = projection.turns.filter(turn => !running || turn.nextInputId !== null);
  const before = new Map(summaries.map(turn => [turn.nextInputId, turn]));
  const measured = (turn: typeof summaries[number]): TimelineItem => ({
    kind: "turn-metrics", id: `turn-metrics:${turn.inputId}`, inputId: turn.inputId, metrics: turn.metrics, incomplete: turn.incomplete,
    replyMarkdown: turn.replyMarkdown,
  });
  const items = saved.flatMap(value => {
    const turn = value.kind === "message" ? before.get(value.id) : undefined;
    return turn ? [measured(turn), value] : [value];
  });
  const last = before.get(null);
  return { items, keys: projection.keys, tail: last ? measured(last) : null };
}

/** Actual blocks come from the current path; local history readers use the same projection as remote conversation reads. */
export function savedTimeline(path: readonly SessionRecord[], agentId: string, running: boolean, feedback: readonly InlineFeedback[] = [],
  options: ProjectionOptions & { compressions?: readonly CompressionActivity[] } = {}): SavedTimeline {
  return conversationTimeline(projectConversation(path, agentId, options), running, feedback, options.compressions);
}

/** Live blocks follow saved items using response identity; the same block is not displayed twice once persisted. */
export function withLive(saved: SavedTimeline, live: readonly ModelLiveBlock[]): TimelineItem[] {
  const active = new Map(live.map(block => [timelineKey(block), block]));
  return [...saved.items.map(item => isModelBlock(item) && "outcome" in item && item.outcome === null
    ? active.get(timelineKey(item)) ?? item : item),
    ...live.filter(block => !saved.keys.has(timelineKey(block))), ...(saved.tail ? [saved.tail] : [])];
}

export interface LiveTimelineState {
  blocks: readonly ModelLiveBlock[];
  retaining: boolean;
  visible: readonly ModelLiveBlock[];
}
/** Keep removed live blocks only while saved history is catching up; a settled read or path reset releases them. */
export function liveTimeline(previous: LiveTimelineState | null, blocks: readonly ModelLiveBlock[], retaining: boolean): LiveTimelineState {
  if (previous?.blocks === blocks && previous.retaining === retaining) return previous;
  const visible = retaining && previous
    ? [...new Map([...previous.visible, ...blocks].map(block => [timelineKey(block), block])).values()]
    : blocks;
  return { blocks, retaining, visible };
}

/** Items with displayable content; empty thinking blocks occupy no list position, preventing spacing-only empty items in the virtual list. */
export function displayedTimeline(items: readonly TimelineItem[]): TimelineItem[] {
  return items.filter(item => item.kind !== "thinking" || item.text.trim() !== "");
}

/** Items kept mounted in the virtual list: unpersisted live blocks (streaming animations and timing must not replay after unmounting) and the last item (the output-following anchor). */
export function mountedTimelineIndexes(items: readonly TimelineItem[]): number[] {
  const indexes = items.flatMap((item, index) => isModelBlock(item) && !("createdAt" in item) ? [index] : []);
  if (items.length && indexes.at(-1) !== items.length - 1) indexes.push(items.length - 1);
  return indexes;
}
