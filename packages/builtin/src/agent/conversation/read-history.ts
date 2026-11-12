import type { RendererSessionSnapshot } from "@asterism-app/sdk/renderer";
import type { RecordInfo } from "@asterism-app/sdk/contracts";
import { AgentInputMessage, ContextSummary, executionRecordIds } from "@asterism-app/builtin-api/contracts";
import { agentSummaryRead } from "../context-projection";
import { turnStartRead } from "../input-message";
import { readRecordsAsync, type RecordRead } from "../../shared/record-reading";
import type { ConversationHistoryWindow } from "./history-window";
import { projectConversation, type ConversationProjection } from "./timeline";

/** Reading windows belong to the conversation; history and diagnostics choose their own generic record ranges. */
export function readConversation(snapshot: RendererSessionSnapshot, agentId: string, window: ConversationHistoryWindow, signal?: AbortSignal) {
  const index = snapshot.records.index({ scope: "timeline" });
  function* read(): RecordRead<ConversationReading> {
    const summary = yield* agentSummaryRead(index, agentId);
    const range = window.observe(index, summary ? { summaryId: summary.record.id, keptFrom: summary.data.keptFrom } : null);
    // A partially visible turn still owns its full footer, including records preceding the visible window.
    const start = yield* turnStartRead(agentId, range.from);
    const from = start?.id ?? range.from;
    const query = { scope: "timeline" as const, ...(from ? { from } : {}) };
    const path = snapshot.records.index(query);
    // Metadata keeps every positional anchor; unrelated resource bodies never enter the conversation read.
    const bodies = yield { ...query, source: agentId, contracts: [AgentInputMessage.id, ContextSummary.id, ...executionRecordIds] };
    return { projection: projectConversation(path, agentId, range, bodies), index, ...range };
  }
  return readRecordsAsync(read(), query => snapshot.records.all(query, { signal }), signal);
}

export interface ConversationReading extends ReturnType<ConversationHistoryWindow["observe"]> {
  projection: ConversationProjection;
  index: readonly RecordInfo[];
}
