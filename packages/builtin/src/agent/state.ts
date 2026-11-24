import { z } from "zod";

/**
 * How a turn ended. The reason comes from the response termination, which is written with the response itself, so a
 * cancelled or failed turn keeps its reason after a reload. incomplete is the residue: the turn stopped with no recorded
 * reason, such as a response that ended without a terminal completion.
 */
export const turnOutcomeSchema = z.enum(["completed", "failed", "cancelled", "incomplete"]);
export type TurnOutcome = z.infer<typeof turnOutcomeSchema>;

/**
 * Which endings the turn boundary states. A completed turn needs nothing, and an incomplete one is already named by
 * its own measurements and process summary. A stop or a failure is an ending of its own and is said once at the
 * boundary; the incident block beside it describes what went wrong rather than that the turn ended.
 */
export function explainsOutcome(outcome: TurnOutcome): boolean {
  return outcome === "cancelled" || outcome === "failed";
}

/** The Agent's own turn state for resume and input decisions; the finer reason stays a presentation concern. */
export const agentTurnStateSchema = z.enum(["empty", "completed", "incomplete"]);
export type AgentTurnState = z.infer<typeof agentTurnStateSchema>;
export const agentExecutionStateSchema = z.enum(["empty", "completed", "incomplete", "running"]);
export type AgentExecutionState = z.infer<typeof agentExecutionStateSchema>;

/** One projection serves both: a failed or cancelled turn is incomplete for editing purposes. */
export function turnState(outcome: TurnOutcome): AgentTurnState {
  return outcome === "completed" ? "completed" : "incomplete";
}

/** The Agent reads the execution loop and history in the same projection. */
export function agentExecutionState(outcome: TurnOutcome | "empty", running: boolean): AgentExecutionState {
  if (running) return "running";
  return outcome === "empty" ? "empty" : turnState(outcome);
}
