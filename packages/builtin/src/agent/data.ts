import { z } from "zod";
import { builtin, agentSelectionSchema } from "@atelier/builtin-api/contracts";
import { agentExecutionStateSchema } from "./state.ts";
import { agentDraftSchema } from "./drafts-contract.ts";
import { inlineFeedbackSchema } from "./feedback.ts";

export const AgentSelection = builtin.data("agent.selection", z.object({
  selection: agentSelectionSchema,
}));
export const AgentSubmissions = builtin.data("agent.submissions", z.record(z.string(), z.literal(true)));
export const AgentDrafts = builtin.data("agent.drafts", z.array(agentDraftSchema));
export const AgentView = builtin.data("agent.card", z.strictObject({
  agentId: z.string(),
  selection: agentSelectionSchema.nullable(),
  executionState: agentExecutionStateSchema,
  drafts: z.array(agentDraftSchema),
  feedback: z.array(inlineFeedbackSchema),
}));
