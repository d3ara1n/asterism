import { completionData, type ModelInputPart, type ModelItem, type SessionSnapshot, type SessionRecord, type ModelBlock, type RecordInfo } from "@asterism-app/sdk/contracts";
import { contextMessages, agentContextRead, agentSummaryRead, type AgentContext } from "../context-projection.ts";
import { decodeExecution, executionRecordIds, AgentRequestContext, AgentInputMessage, type AgentRequestContextData } from "@asterism-app/builtin-api/contracts";
import { readRecords, type RecordRead } from "../../shared/record-reading.ts";

/** Fixed categories and display order for conversation composition. */
export const conversationCategories = ["user", "agentMessage", "eventMessage", "assistant", "thinking", "toolcall", "result", "context", "summary"] as const;
export type ConversationCategory = typeof conversationCategories[number];

export interface ContextInsight {
  /** Reported input from this agent's latest work request; null when no measurement is available. */
  usage: { input: number; model: string; scope: string; compressedAfter: boolean } | null;
  conversation: { characters: Record<ConversationCategory, number>; total: number; files: number };
  /** Terminal extension from the same work request used for window usage. */
  system: { responseId: string; diagnostics: AgentRequestContextData } | null;
}

/** Character counts use Unicode code points, matching request diagnostics. */
export const characters = (text: string) => [...text].length;

function addParts(parts: readonly ModelInputPart[], category: ConversationCategory, target: ContextInsight["conversation"]) {
  for (const part of parts) {
    if (part.kind === "text") target.characters[category] += characters(part.text);
    else target.files++;
  }
}
function addItem(item: ModelItem, inputCategory: "user" | "agentMessage" | "eventMessage", target: ContextInsight["conversation"]) {
  if (item.kind === "input" || item.kind === "context")
    return addParts(item.parts, item.kind === "input" ? inputCategory : "context", target);
  if (item.kind === "result") return addParts(item.outcome.model, "result", target);
  if (item.kind !== "output") return;
  for (const part of item.parts) {
    if (part.kind === "text") target.characters.assistant += characters(part.text);
    else if (part.kind === "thinking") target.characters.thinking += characters(part.text || part.summary);
    else target.characters.toolcall += characters(JSON.stringify(part.arguments));
  }
}

/** Reads only the current path; conversation composition reuses the next request's model projection, while window usage and the system section use only saved actual measurements. */
export function contextInsight(snapshot: Pick<SessionSnapshot, "records">, agentId: string): ContextInsight {
  return readRecords(agentInsightRead(snapshot.records.index({ scope: "timeline" }), agentId), snapshot.records.all);
}
export function* agentInsightRead(index: readonly RecordInfo[], agentId: string): RecordRead<ContextInsight> {
  const context = yield* agentContextRead(index, agentId);
  const measurement = contextMeasurement(context.path, agentId) ?? (yield* latestMeasurementRead(agentId, context.path[0]?.id));
  return contextInsightFromRecords(context, measurement);
}
export function* agentMeasurementsRead(index: readonly RecordInfo[], agentId: string): RecordRead<Pick<ContextInsight, "usage" | "system">> {
  const summary = yield* agentSummaryRead(index, agentId);
  return contextMeasurements(summary, yield* latestMeasurementRead(agentId));
}
function* latestMeasurementRead(agentId: string, before?: string): RecordRead<ContextMeasurement | null> {
  let limit = 1;
  for (;;) {
    const records = yield { scope: "timeline", contracts: executionRecordIds, source: agentId, before, edge: "last", limit };
    const measurement = contextMeasurement(records, agentId);
    if (measurement || !records.length) return measurement;
    before = records[0]!.id;
    limit = 32;
  }
}
interface ContextMeasurement { record: SessionRecord; block: ModelBlock }
function contextMeasurement(records: readonly SessionRecord[], agentId: string): ContextMeasurement | null {
  for (let index = records.length - 1; index >= 0; index--) {
    const record = records[index]!;
    if (record.source?.resource?.id !== agentId) continue;
    const execution = decodeExecution(record);
    if (execution?.status === "known" && execution.data.block.completion) return { record, block: execution.data.block };
  }
  return null;
}
function contextInsightFromRecords(context: AgentContext, measurement: ContextMeasurement | null): ContextInsight {
  const conversation: ContextInsight["conversation"] = {
    characters: Object.fromEntries(conversationCategories.map(category => [category, 0])) as Record<ConversationCategory, number>,
    total: 0, files: 0,
  };
  if (context.summary) {
    // Summary measurements include the prompt envelope actually projected.
    const summary = contextMessages(context)[0]!;
    if (summary.kind === "context") addParts(summary.parts, "summary", conversation);
  }
  for (const group of context.groups) {
    const input = AgentInputMessage.decode(context.path[group.first]!);
    const sender = input?.status === "known" ? input.data.sender.kind : "user";
    const category = sender === "user" ? "user" : sender === "agent" ? "agentMessage" : "eventMessage";
    group.items.forEach(item => addItem(item, category, conversation));
  }
  conversation.total = conversationCategories.reduce((sum, category) => sum + conversation.characters[category], 0);
  return { conversation, ...contextMeasurements(context.summary, measurement) };
}
function contextMeasurements(summary: AgentContext["summary"], measurement: ContextMeasurement | null): Pick<ContextInsight, "usage" | "system"> {
  let usage: ContextInsight["usage"] = null, system: ContextInsight["system"] = null;
  if (measurement?.block.completion) {
    const { block, record } = measurement;
    const compressedAfter = summary !== null && summary.record.sequence > record.sequence;
    const diagnostics = completionData(block.completion, AgentRequestContext);
    if (diagnostics) system = { responseId: block.responseId, diagnostics };
    const input = block.completion?.usage?.input;
    if (input != null) usage = { input, model: block.source.model, scope: block.source.scope, compressedAfter };
  }
  return { usage, system };
}

/** Allocates tiles by largest remainder, with at least one tile per nonzero category; details provide exact values. */
export function allocateTiles(values: readonly number[], tiles: number): number[] {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return values.map(() => 0);
  const exact = values.map(value => value / total * tiles);
  const counts = exact.map((value, index) => values[index]! > 0 ? Math.max(1, Math.floor(value)) : 0);
  let rest = tiles - counts.reduce((sum, value) => sum + value, 0);
  const order = exact.map((value, index) => ({ index, remainder: value - Math.floor(value) })).filter(({ index }) => values[index]! > 0);
  order.sort((a, b) => b.remainder - a.remainder);
  for (let i = 0; rest > 0 && order.length; i = (i + 1) % order.length, rest--) counts[order[i]!.index]!++;
  // Reclaim tiles from the largest category when minimum allocations exceed the total.
  while (rest < 0) { const largest = counts.indexOf(Math.max(...counts)); counts[largest]!--; rest++; }
  return counts;
}
