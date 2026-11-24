import { z } from "zod";
import { builtin, agentSelectionSchema } from "@asterism-app/builtin-api/contracts";
import { agentExecutionStateSchema } from "./state.ts";
import { agentDraftSchema } from "./drafts-contract.ts";
import { inlineFeedbackSchema, compressionActivitySchema, agentActivitySchema } from "./feedback.ts";

export const AgentSelection = builtin.data("agent.selection", z.object({
  selection: agentSelectionSchema,
}));
export const AgentSubmissions = builtin.data("agent.submissions", z.record(z.string(), z.literal(true)));
export const AgentDrafts = builtin.data("agent.drafts", z.array(agentDraftSchema));
export const AgentView = builtin.data("agent.card", z.strictObject({
  agentId: z.string(),
  selection: agentSelectionSchema.nullable(),
  executionState: agentExecutionStateSchema,
  executionStartedAt: z.number().nullable(),
  drafts: z.array(agentDraftSchema),
  feedback: z.array(inlineFeedbackSchema),
  compressions: z.array(compressionActivitySchema),
  /** Nodes this runtime saw a task stop after; a stop between requests has no record of its own. */
  interruptions: z.array(z.string().nullable()).default([]),
  activity: agentActivitySchema.nullable().default(null),
}));
