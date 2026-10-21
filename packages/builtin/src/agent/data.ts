import { z } from "zod";
import { builtin, agentSelectionSchema } from "@atelier/builtin-api/contracts";
import { agentTurnStateSchema } from "./state.ts";
import { agentDraftSchema } from "./drafts-contract.ts";

export const AgentSelection = builtin.data("agent.selection", z.strictObject({
  selection: agentSelectionSchema, revision: z.number().int().nonnegative(),
}));
export const AgentSubmissions = builtin.data("agent.submissions", z.record(z.string(), z.string()));
export const AgentDrafts = builtin.data("agent.drafts", z.array(agentDraftSchema));
export const AgentView = builtin.data("agent.card", z.strictObject({
  agentId: z.string(),
  selection: agentSelectionSchema.nullable(),
  selectionRevision: z.number().int().nonnegative(),
  turnState: agentTurnStateSchema,
  drafts: z.array(agentDraftSchema),
}));
