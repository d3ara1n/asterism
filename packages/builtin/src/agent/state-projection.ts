import type { ModelBlock, SessionRecord, SessionSnapshot } from "@asterism-app/sdk/contracts";
import { AgentInputMessage, decodeExecution } from "@asterism-app/builtin-api/contracts";
import type { TurnOutcome } from "./state.ts";
import { isCompletedResponse } from "./response-messages.ts";

/**
 * How a turn ended, read from the response termination written with the response itself, so a cancelled or failed turn
 * keeps its reason after a reload. An incomplete outcome is the residue: no terminal completion was recorded. An
 * interruption position covers the stop that left no response behind, such as cancellation before or between requests.
 */
export function projectTurnOutcome(records: readonly SessionRecord[], agentId: string,
  interruptions: readonly (string | null)[] = []): TurnOutcome {
  const stops = new Set(interruptions);
  let hasInput = false;
  let responseId: string | null = null;
  let stopped = false;
  let termination: Exclude<TurnOutcome, "incomplete"> | null = null;
  const blocks = new Map<number, ModelBlock>();
  for (const record of records) {
    if (stops.has(record.parentId)) stopped = true;
    if (record.source?.resource?.id !== agentId) continue;
    if (AgentInputMessage.decode(record)?.status === "known") {
      hasInput = true;
      responseId = null;
      stopped = false;
      termination = null;
      blocks.clear();
      continue;
    }
    if (!hasInput) continue;
    const execution = decodeExecution(record);
    if (execution?.status !== "known") continue;
    const block = execution.data.block;
    if (block.responseId !== responseId) {
      responseId = block.responseId;
      stopped = false;
      termination = null;
      blocks.clear();
    }
    blocks.set(block.ordinal, block);
    const reason = block.completion?.termination?.reason;
    if (reason) termination = reason;
  }
  if (stops.has(records.at(-1)?.id ?? null)) stopped = true;
  if (!hasInput) return "incomplete";
  // A recorded reason outranks an interruption position: the response itself already said how it ended.
  if (termination === "cancelled" || termination === "failed") return termination;
  if (stopped) return "cancelled";
  return isCompletedResponse([...blocks.values()]) ? "completed" : "incomplete";
}

/** The current path's turn outcome; interruption positions come from this runtime, not from records. */
export function projectAgentTurnOutcome(snapshot: Pick<SessionSnapshot, "records">, agentId: string,
  interruptions: readonly (string | null)[] = []): TurnOutcome | "empty" {
  const input = snapshot.records.last(AgentInputMessage, { scope: "timeline", source: agentId });
  if (!input) return "empty";
  return projectTurnOutcome(snapshot.records.all({ scope: "timeline", from: input.record.id }), agentId, interruptions);
}
