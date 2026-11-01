import type { RendererSessionSnapshot } from "@asterism-app/sdk/renderer";
import type { RecordInfo, SessionRecord } from "@asterism-app/sdk/contracts";
import { agentSummaryRead } from "./context-projection.ts";
import type { ConversationHistoryWindow } from "./conversation/history-window.ts";
import { agentInsightRead, agentMeasurementsRead } from "./context/insight.ts";
import { turnStartRead } from "./input-message.ts";
import { readRecordsAsync, type RecordRead } from "../shared/record-reading.ts";

/** Remote consumers own cancellation; domain read plans are also used by synchronous runtime readers. */
export function readAgentInsight(snapshot: RendererSessionSnapshot, agentId: string, signal?: AbortSignal) {
  return readRecordsAsync(agentInsightRead(snapshot.records.index({ scope: "timeline" }), agentId),
    query => snapshot.records.all(query, { signal }), signal);
}

export function readAgentMeasurements(snapshot: RendererSessionSnapshot, agentId: string, signal?: AbortSignal) {
  return readRecordsAsync(agentMeasurementsRead(snapshot.records.index({ scope: "timeline" }), agentId),
    query => snapshot.records.all(query, { signal }), signal);
}

/** Reading windows belong to the conversation; history and diagnostics choose their own generic record ranges. */
export function readConversation(snapshot: RendererSessionSnapshot, agentId: string, window: ConversationHistoryWindow, signal?: AbortSignal) {
  const index = snapshot.records.index({ scope: "timeline" });
  function* read(): RecordRead<ConversationReading> {
    const summary = yield* agentSummaryRead(index, agentId);
    const range = window.observe(index, summary ? { summaryId: summary.record.id, keptFrom: summary.data.keptFrom } : null);
    // A partially visible turn still owns its full footer, including records preceding the visible window.
    const start = yield* turnStartRead(agentId, range.from);
    const from = start?.id ?? range.from;
    const path = yield { scope: "timeline", ...(from ? { from } : {}) };
    return { path, index, ...range };
  }
  return readRecordsAsync(read(), query => snapshot.records.all(query, { signal }), signal);
}

export interface ConversationReading extends ReturnType<ConversationHistoryWindow["observe"]> {
  path: readonly SessionRecord[];
  index: readonly RecordInfo[];
}
