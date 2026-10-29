import { defineCreation, defineAction, defineCall } from "@asterism-app/sdk/contracts";
import { z } from "zod";
import { builtin } from "./identity.ts";
import { userInputPartsSchema } from "./input.ts";
import { agentSelectionSchema } from "./configuration.ts";
import { agentMessageSenderSchema } from "./messaging.ts";

/** Agents are ordinary resources: creation events record only identity; mutable data such as model selection belongs to private resource state. */
export const Agent = builtin.resource("agent", z.object({}));
/** The built-in agent preset selected by default when starting from the home page. */
export const defaultAgentPreset = "worker";
/** Pending input is delivered at request or turn boundaries; execution starts immediately when idle. */
export const agentInputModeSchema = z.enum(["steer", "follow"]);
/** Submissions and drafts share a 16-character Nano ID identity. */
export const submissionIdSchema = z.string().regex(/^[A-Za-z0-9_-]{16}$/u);
export const StartAgentSession = defineCall(builtin.name("session.start"), {
  scope: "plugin", input: z.strictObject({ submissionId: submissionIdSchema, selection: agentSelectionSchema, parts: userInputPartsSchema }),
  output: z.strictObject({ sessionId: z.string().min(1) }),
});
/** title is optional; when omitted, the creation entry point generates a random display name. */
export const agentCreateSchema = z.strictObject({
  selection: agentSelectionSchema,
  title: z.string().trim().min(1).max(160).optional().describe("Display title for the new Agent. When omitted, a random adjective-and-noun name such as HardStone is generated."),
}).describe("Agent configuration and title.");

export const CreateAgent = defineCreation(Agent, { id: builtin.name("agent.create"), schema: agentCreateSchema });
export const SubmitAgentInput = defineAction(Agent, {
  id: builtin.name("agent.submit"),
  schema: z.strictObject({
    submissionId: submissionIdSchema, parts: userInputPartsSchema, mode: agentInputModeSchema,
    sender: agentMessageSenderSchema.default({ kind: "user" }),
  }),
});
export type SubmitAgentInputData = z.infer<typeof SubmitAgentInput.schema>;
export const ContinueAgent = defineAction(Agent, { id: builtin.name("agent.continue"), schema: z.strictObject({}) });
export const ConfigureAgent = defineAction(Agent, {
  id: builtin.name("agent.configure"), schema: z.strictObject({ selection: agentSelectionSchema }),
});
export const CancelAgent = defineAction(Agent, { id: builtin.name("agent.cancel"), schema: z.strictObject({}) });
