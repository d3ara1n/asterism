import type { ModelBlock, SessionRecord, SessionSnapshot } from "@asterism-app/sdk/contracts";
import { AgentInputMessage, decodeExecution, executionRecordIds } from "@asterism-app/builtin-api/contracts";
import type { AgentTurnState } from "./state.ts";
import { isFinalReply } from "./response-messages.ts";

/** A turn has a final reply only if the last response answers the latest input, including a steer within the turn. */
export function projectTurnState(records: readonly SessionRecord[], agentId: string): AgentTurnState {
  const blocks: ModelBlock[] = [];
  for (let i = records.length - 1; i >= 0; i--) {
    const record = records[i]!;
    if (record.source?.resource?.id !== agentId) continue;
    if (AgentInputMessage.decode(record)?.status === "known")
      return isFinalReply(blocks) ? "completed" : "incomplete";
    const execution = decodeExecution(record);
    if (execution?.status !== "known") continue;
    const block = execution.data.block;
    if (!blocks.length || block.responseId === blocks[0]!.responseId) blocks.push(block);
  }
  return "empty";
}

/** Project from the last input on the current path; stops and failed attempts do not add a second source of state. */
export function projectAgentTurnState(snapshot: Pick<SessionSnapshot, "records">, agentId: string): AgentTurnState {
  const input = snapshot.records.last(AgentInputMessage, { scope: "timeline", source: agentId });
  if (!input) return "empty";
  return projectTurnState(snapshot.records.all({ scope: "timeline", source: agentId, from: input.record.id,
    contracts: [AgentInputMessage.id, ...executionRecordIds] }), agentId);
}
