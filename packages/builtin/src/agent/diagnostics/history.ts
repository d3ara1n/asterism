import { completionData, type ModelBlock, type ModelCompletion, type ModelInputPart, type SessionRecord, type SessionView } from "@asterism/sdk/contracts";
import { ContextSummary, Execution, AgentRequestContext, AgentInputMessage, type AgentRequestContextData, type AgentMessageSender } from "@asterism/builtin-api/contracts";

export type DiagnosticScope = "timeline" | "session";
export interface DiagnosticRequest {
  id: string; kind: "response" | "compression"; responseId: string | null;
  model: string; modelScope: string | null; createdAt: string; sequence: number;
  requestParentId: string | null; completion: ModelCompletion | null;
  blocks: { record: SessionRecord; block: ModelBlock }[];
  summary: string | null; onTimeline: boolean;
  relatedInput: { id: string; parts: readonly ModelInputPart[]; sender: AgentMessageSender } | null;
  /** Determines only whether the historical projection contains files; multimodal token totals are not presented as a text breakdown. */
  inputHasFiles: boolean | null;
  /** Pre-compression estimate saved by a compression request; null for work requests. */
  tokensBefore: number | null;
  /** Domain extension in this request's completion; null when absent. */
  sent: AgentRequestContextData | null;
}
interface HistoryState { lastFile: number | null; input: DiagnosticRequest["relatedInput"] }
export interface DiagnosticHistory { requests: DiagnosticRequest[]; unreadable: number }

/** Groups actual output blocks by response; temporary execution feedback does not contribute to historical statistics. */
export function diagnosticHistory(snapshot: Pick<SessionView, "records">, agentId: string, scope: DiagnosticScope): DiagnosticHistory {
  const records = snapshot.records.all({ scope });
  const timelineIds = new Set(snapshot.records.all({ scope: "timeline" }).map(record => record.id));
  const byId = new Map(records.map(record => [record.id, record]));
  const history = new Map<string, HistoryState>();
  const requests = new Map<string, DiagnosticRequest>();
  let unreadable = 0;
  const stateAt = (id: string | null): HistoryState => id === null ? { lastFile: -1, input: null } : history.get(id) ?? { lastFile: null, input: null };
  const response = (record: SessionRecord, id: string, model: string, parentId: string | null, modelScope: string | null): DiagnosticRequest => {
    const key = `response:${id}`;
    const existing = requests.get(key);
    if (existing) { existing.onTimeline ||= timelineIds.has(record.id); return existing; }
    const state = stateAt(parentId);
    const request: DiagnosticRequest = {
      id: key, kind: "response", responseId: id, model, modelScope, requestParentId: parentId,
      createdAt: record.createdAt, sequence: record.sequence, completion: null, blocks: [], summary: null, tokensBefore: null, sent: null,
      onTimeline: timelineIds.has(record.id), relatedInput: state.input, inputHasFiles: state.lastFile === null ? null : state.lastFile >= 0,
    };
    requests.set(key, request);
    return request;
  };
  for (const record of records) {
    let state = stateAt(record.parentId);
    if (record.source?.resource?.id !== agentId) { history.set(record.id, state); continue; }
    const input = AgentInputMessage.decode(record);
    const summary = ContextSummary.decode(record);
    const execution = Execution.decode(record);
    if ([input, summary, execution].some(value => value?.status === "unknown")) {
      unreadable++; state = { input: null, lastFile: null };
    }
    if (input?.status === "known") state = {
      input: { id: record.id, parts: input.data.parts, sender: input.data.sender },
      lastFile: input.data.parts.some(part => part.kind === "file") ? record.sequence : state.lastFile,
    };
    if (summary?.status === "known") {
      requests.set(`summary:${record.id}`, {
        id: `summary:${record.id}`, kind: "compression", responseId: null, model: summary.data.model, modelScope: null,
        requestParentId: null, createdAt: record.createdAt, sequence: record.sequence, completion: summary.data.completion,
        tokensBefore: summary.data.tokensBefore, sent: null,
        blocks: [], summary: summary.data.summary, onTimeline: timelineIds.has(record.id),
        relatedInput: state.input, inputHasFiles: false,
      });
      const kept = byId.get(summary.data.keptFrom);
      if (kept && state.lastFile !== null && state.lastFile < kept.sequence) state = { ...state, lastFile: -1 };
    }
    if (execution?.status === "known") {
      const block = execution.data.block;
      const request = response(record, block.responseId, block.source.model, block.requestParentId, block.source.scope);
      if (!request.blocks.some(item => item.block.ordinal === block.ordinal)) request.blocks.push({ record, block });
      if (block.completion) {
        request.completion = block.completion;
        request.sent = completionData(block.completion, AgentRequestContext);
      }
      if (block.complete && block.kind === "toolcall" && block.outcome?.model.some(part => part.kind === "file"))
        state = { ...state, lastFile: record.sequence };
    }
    history.set(record.id, state);
  }
  for (const request of requests.values()) {
    request.blocks.sort((a, b) => a.block.ordinal - b.block.ordinal);
  }
  return { requests: [...requests.values()].sort((a, b) => b.sequence - a.sequence), unreadable };
}
