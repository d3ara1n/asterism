import type { ModelBlock, SessionRecord, SessionSnapshot } from "@asterism/sdk/contracts";
import { Execution, AgentInputMessage } from "@asterism/builtin-api/contracts";
import type { AgentTurnState } from "./state.ts";

/** Overlays this runtime's interruption position on the current path; context projection generates model input independently. */
export function projectAgentTurnState(
  snapshot: Pick<SessionSnapshot, "records">,
  agentId: string,
  interruptions: readonly (string | null)[] = [],
): AgentTurnState {
  return projectTurnState(snapshot.records.all({ scope: "timeline" }), agentId, interruptions);
}

/** The same state rules apply to historical turns; pass that turn's record interval without creating a copy of the history snapshot. */
export function projectTurnState(records: readonly SessionRecord[], agentId: string, interruptions: readonly (string | null)[] = []): AgentTurnState {
  let hasInput = false;
  let responseId: string | null = null;
  let interrupted = false;
  const blocks = new Map<number, ModelBlock>();
  const stopped = new Set(interruptions);
  for (const record of records) {
    if (stopped.has(record.parentId)) interrupted = true;
    if (record.source?.resource?.id !== agentId) continue;
    if (AgentInputMessage.decode(record)?.status === "known") {
      hasInput = true;
      responseId = null;
      blocks.clear();
      interrupted = false;
      continue;
    }
    if (!hasInput) continue;
    const execution = Execution.decode(record);
    if (execution?.status === "known") {
      const block = execution.data.block;
      if (block.responseId !== responseId) {
        responseId = block.responseId;
        blocks.clear();
        interrupted = false;
      }
      blocks.set(block.ordinal, block);
    }
  }
  if (stopped.has(records.at(-1)?.id ?? null)) interrupted = true;
  if (!hasInput) return "empty";
  if (interrupted) return "incomplete";
  const response = [...blocks.values()];
  const terminal = response.find(block => block.completion);
  // Terminal state is saved with the highest-ordinal block; history may stop before all tool results are persisted.
  const completed = terminal?.completion?.finishReason === "stop"
    && terminal.ordinal + 1 === blocks.size
    && response.every(block => block.ordinal < blocks.size && block.complete && block.kind !== "toolcall");
  return completed ? "completed" : "incomplete";
}
