import type { SessionSnapshot, Usage } from "@asterism-app/sdk/contracts";
import { AgentInputMessage } from "@asterism-app/builtin-api/contracts";
import { diagnosticHistory, type DiagnosticRequest } from "../diagnostics/history";
import { performanceOverview } from "../diagnostics/performance";
import { cacheUsage } from "../diagnostics/usage";
import { projectTurnState } from "../state-projection";

export const usageFields = ["input", "output", "cacheRead", "cacheWrite", "reasoning"] as const satisfies readonly (keyof Usage)[];

/** Calculates turn summaries from saved requests without writing history. */
function summarizeRequests(requests: readonly DiagnosticRequest[]) {
  const usage = Object.fromEntries(usageFields.map(field => {
    const reported = requests.flatMap(request => {
      const value = request.completion?.usage?.[field];
      return value == null ? [] : [value];
    });
    return [field, { value: reported.length ? reported.reduce((sum, value) => sum + value, 0) : null, count: reported.length }];
  })) as Record<typeof usageFields[number], { value: number | null; count: number }>;
  return { count: requests.length, cache: cacheUsage(requests), usage, performance: performanceOverview(requests) };
}
export type TurnMetricsData = ReturnType<typeof summarizeRequests>;
export interface TurnMeasurement {
  inputId: string;
  nextInputId: string | null;
  incomplete: boolean;
  metrics: TurnMetricsData;
  replyMarkdown: string | null;
  finalResponseId: string | null;
}

/** Preserves historical turns; consecutive input in a batch and steer messages belong to the same turn, and only the currently running turn is hidden. */
export function turnMetrics(snapshot: SessionSnapshot, agentId: string, running: boolean): TurnMeasurement[] {
  const path = snapshot.records.all({ scope: "timeline" });
  const starts = path.flatMap((record, index) => {
    if (record.source?.resource?.id !== agentId) return [];
    const message = AgentInputMessage.decode(record);
    return message?.status === "known" && message.data.startsTurn ? [{ record, index }] : [];
  });
  const requests = diagnosticHistory(snapshot, agentId, "timeline").requests.filter(request => request.kind === "response");
  return starts.flatMap((start, index) => {
    const next = starts[index + 1];
    if (!next && running) return [];
    const current = requests.filter(request => request.sequence > start.record.sequence && (!next || request.sequence < next.record.sequence));
    if (!current.length) return [];
    const incomplete = projectTurnState(path.slice(start.index, next?.index), agentId) !== "completed";
    // Requests are ordered newest first and blocks by ordinal; take only the final response, without falling back to intermediate body text before tool execution.
    const reply = incomplete ? "" : current[0]!.blocks.flatMap(({ block }) =>
      block.kind === "text" ? [block.text] : []).join("\n\n");
    return [{
      inputId: start.record.id, nextInputId: next?.record.id ?? null,
      incomplete,
      metrics: summarizeRequests(current),
      replyMarkdown: reply.trim() ? reply : null,
      finalResponseId: reply.trim() ? current[0]!.responseId : null,
    }];
  });
}
