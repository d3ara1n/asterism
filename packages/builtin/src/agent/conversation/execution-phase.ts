import type { AgentActivity } from "../feedback";

/** The execution phase shown at the end of the conversation. Compaction takes precedence because a retry cannot run during it. */
export type ExecutionPhase =
  | { kind: "working" }
  | { kind: "compressing" }
  | { kind: "retrying"; attempt: number; max: number }
  | { kind: "waiting"; attempt: number; max: number; seconds: number };

export function executionPhase(activity: AgentActivity | null, compressing: boolean, now: number): ExecutionPhase {
  if (compressing) return { kind: "compressing" };
  if (!activity) return { kind: "working" };
  const { attempt, max, resumeAt } = activity;
  if (resumeAt === null) return { kind: "retrying", attempt, max };
  return { kind: "waiting", attempt, max, seconds: Math.ceil(Math.max(0, resumeAt - now) / 1000) };
}
