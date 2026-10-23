import { z } from "zod";
import { defineAction } from "@atelier/sdk/contracts";
import { Agent, builtin, userInputPartsSchema, agentMessageSenderSchema } from "@atelier/builtin-api/contracts";

/** 草稿箱属于资源当前数据；界面动作只在内置包内共享。 */
export const draftModeSchema = z.enum(["none", "steer", "follow"]);
export const agentDraftSchema = z.object({
  id: z.string().uuid(),
  mode: draftModeSchema,
  parts: userInputPartsSchema,
  sender: agentMessageSenderSchema,
});
export type AgentDraft = z.infer<typeof agentDraftSchema>;
export type DraftMode = AgentDraft["mode"];
export const SaveAgentDraft = defineAction(Agent, {
  id: builtin.name("agent.draft.save"),
  schema: z.strictObject({ submissionId: z.string().uuid(), parts: userInputPartsSchema }),
});
export const SetAgentDraftMode = defineAction(Agent, {
  id: builtin.name("agent.draft.mode"),
  schema: z.strictObject({ id: z.string().uuid(), mode: draftModeSchema }),
});
export const ExchangeAgentDraft = defineAction(Agent, {
  id: builtin.name("agent.draft.exchange"),
  schema: z.strictObject({
    submissionId: z.string().uuid(), id: z.string().uuid(),
    replacement: userInputPartsSchema.nullable(),
  }),
});
export const DiscardAgentDraft = defineAction(Agent, {
  id: builtin.name("agent.draft.discard"),
  schema: z.strictObject({ id: z.string().uuid() }),
});
export const MoveAgentDraft = defineAction(Agent, {
  id: builtin.name("agent.draft.move"),
  schema: z.strictObject({ id: z.string().uuid(), before: z.string().uuid().nullable() }),
});
