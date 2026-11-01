import type { SessionRecord, SessionSnapshot, ModelBlock, ModelItem, RecordInfo, Decoded } from "@asterism-app/sdk/contracts";
import type { z } from "zod";
import { ContextSummary, Execution, AgentInputMessage } from "@asterism-app/builtin-api/contracts";
import { projectInputMessage } from "./input-message.ts";
import { responseMessages } from "./response-messages.ts";
import { readRecords, type RecordRead } from "../shared/record-reading.ts";

/** Projection depends only on pure contracts; background requests and the frontend context panel share the same rules, and the background entry point converts failures to plugin errors. */
export class ContextProjectionError extends Error {}
/** A response and all its tool results are indivisible; indices address AgentContext.path. */
export interface ContextGroup { items: ModelItem[]; first: number; last: number }
export interface AgentContext {
  path: readonly SessionRecord[];
  groups: ContextGroup[];
  summary: { record: SessionRecord; data: z.infer<typeof ContextSummary.schema> } | null;
}
function summaryItem(summary: string): ModelItem {
  return { kind: "context", parts: [{ kind: "text", text: `The following summary describes earlier conversation. Recent messages follow it.\n<summary>\n${summary}\n</summary>` }] };
}
export function contextMessages(context: AgentContext): ModelItem[] {
  return [...(context.summary ? [summaryItem(context.summary.data.summary)] : []), ...context.groups.flatMap(group => group.items)];
}
export function projectForAgent(snapshot: Pick<SessionSnapshot, "records">, agentId: string): ModelItem[] {
  return contextMessages(projectAgentContext(snapshot, agentId));
}
/** Groups responses by request starting point without changing event order; boundaries are checked on the full path so request starting points are preserved. */
export function projectAgentContext(snapshot: Pick<SessionSnapshot, "records">, agentId: string): AgentContext {
  return readRecords(agentContextRead(snapshot.records.index({ scope: "timeline" }), agentId), snapshot.records.all);
}

export function* agentSummaryRead(index: readonly RecordInfo[], agentId: string): RecordRead<AgentContext["summary"]> {
  const [record] = yield { scope: "timeline", contracts: [ContextSummary.id], source: agentId, edge: "last", limit: 1 };
  const summary = contextSummary(record ? ContextSummary.decode(record) : null);
  validateContextBoundary(index, summary);
  return summary;
}

/** Local requests and remote readers execute the same selection and boundary validation. */
export function* agentContextRead(index: readonly RecordInfo[], agentId: string): RecordRead<AgentContext> {
  const summary = yield* agentSummaryRead(index, agentId);
  const path = yield { scope: "timeline", ...(summary ? { from: summary.data.keptFrom } : {}) };
  const preceding = boundaryPrelude(index, path, agentId, summary);
  const prelude = preceding.length ? yield { scope: "timeline", ids: preceding } : [];
  return projectContextRecords([...prelude, ...path], agentId, summary, index);
}

function contextSummary(value: Decoded<z.infer<typeof ContextSummary.schema>> | null): AgentContext["summary"] {
  if (value?.status === "unknown") throw new ContextProjectionError("The context summary could not be decoded.");
  return value;
}
function validateContextBoundary(index: readonly RecordInfo[], summary: AgentContext["summary"]): void {
  if (!summary) return;
  const boundary = index.findIndex(record => record.id === summary.data.keptFrom);
  const end = index.findIndex(record => record.id === summary.record.id);
  if (boundary < 0 || end <= boundary)
    throw new ContextProjectionError("The context summary retained boundary is not a preceding record on this path.");
}

/** A response may start before the retained interval. Read only its intervening positions to validate the cut in projected order. */
function boundaryPrelude(index: readonly RecordInfo[], path: readonly SessionRecord[], agentId: string, summary: AgentContext["summary"]): string[] {
  if (!summary) return [];
  const positions = new Map(index.map((record, position) => [record.id, position]));
  const boundary = positions.get(summary.data.keptFrom)!;
  let start = boundary;
  for (const record of path) {
    if (record.source?.resource?.id !== agentId) continue;
    const execution = Execution.decode(record);
    if (execution?.status !== "known" || !execution.data.block.complete) continue;
    const origin = execution.data.block.requestParentId;
    const position = origin === null ? -1 : positions.get(origin);
    if (position !== undefined) start = Math.min(start, position + 1);
  }
  return index.slice(start, boundary).map(record => record.id);
}

/** Body projection operates on the retained interval; ancestry validation uses the complete metadata path. */
function projectContextRecords(path: readonly SessionRecord[], agentId: string, summary: AgentContext["summary"],
  index: readonly RecordInfo[]): AgentContext {
  const positions = new Map(index.map((record, position) => [record.id, position]));
  const local = new Map(path.map((record, position) => [record.id, position]));
  const responses = new Map<string, { record: SessionRecord; block: ModelBlock }[]>();
  for (const record of path) {
    if (record.source?.resource?.id !== agentId) continue;
    const decoded = Execution.decode(record);
    if (decoded?.status !== "known" || !decoded.data.block.complete) continue;
    const block = decoded.data.block;
    const blocks = responses.get(block.responseId) ?? [];
    blocks.push({ record, block }); responses.set(block.responseId, blocks);
  }
  const after = new Map<string | null, { record: SessionRecord; block: ModelBlock }[][]>();
  for (const blocks of responses.values()) {
    const origin = blocks[0]!.block.requestParentId;
    const position = origin === null ? -1 : positions.get(origin);
    if (position === undefined || blocks.some(item => item.block.requestParentId !== origin || position >= positions.get(item.record.id)!))
      throw new ContextProjectionError("Response request origin is not a preceding record on this path.");
    const groups = after.get(origin) ?? [];
    blocks.sort((a, b) => a.block.ordinal - b.block.ordinal);
    groups.push(blocks); after.set(origin, groups);
  }
  const groups: ContextGroup[] = [];
  const emit = (origin: string | null) => {
    for (const blocks of after.get(origin) ?? []) {
      const items = responseMessages(blocks.map(({ block }) => block));
      const indices = blocks.map(({ record }) => local.get(record.id)!);
      if (items.length) groups.push({ items, first: Math.min(...indices), last: Math.max(...indices) });
    }
  };
  emit(null);
  for (const origin of after.keys()) if (origin !== null && !local.has(origin)) emit(origin);
  for (const [index, record] of path.entries()) {
    const message = AgentInputMessage.decode(record);
    if (message?.status === "known" && record.source?.resource?.id === agentId)
      groups.push({ first: index, last: index, items: [projectInputMessage(message.data)] });
    const context = record.context;
    if (context && (context.recipient === null || context.recipient === agentId))
      groups.push({ first: index, last: index, items: [{ kind: "context", parts: [{ kind: "text", text: context.text }] }] });
    emit(record.id);
  }
  if (!summary) return { path, summary, groups };
  const boundary = local.get(summary.data.keptFrom)!;
  let retaining = false;
  for (const group of groups) {
    if (group.first >= boundary) retaining = true;
    else if (group.last >= boundary || retaining)
      throw new ContextProjectionError("The context summary boundary splits a response or reorders context.");
  }
  return { path, summary, groups: groups.filter(group => group.first >= boundary) };
}
