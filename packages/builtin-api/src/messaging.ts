import { z } from "zod";
import { defineTool } from "@asterism-app/sdk/contracts";
import { builtin } from "./identity.ts";

/** The sender retains the communication resource and agent name; recipient addressing is declared by the resource tool implementation. */
export const agentMessageSenderSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("user") }),
  z.strictObject({
    kind: z.literal("agent"),
    resource: z.strictObject({ sessionId: z.string().min(1), id: z.string().min(1), kind: z.string().min(1) }),
    name: z.string().min(1),
    mesh: z.strictObject({
      channel: z.string().min(1),
      id: z.number().int().nonnegative().nullable(),
    }).optional().describe("Mesh channel name and sender's numeric name disambiguator. Null means the sender is not exposed to the channel."),
  }),
]);
export type AgentMessageSender = z.infer<typeof agentMessageSenderSchema>;

/** The host matches resource types; target is declared by each resource implementation. */
export const Send = defineTool({
  id: builtin.name("tool.send"), name: "send",
  description: "Send a message to an Agent through a linked resource.",
  guidelines: [
    "resource_id selects the messaging resource. Its target schema describes recipient selection.",
    "The runtime supplies the sender's resource address and Agent name.",
    "Accepted messages enter the next request boundary while the recipient is running, or start execution while idle.",
    "Acceptance confirms delivery to the input queue; the recipient processes the message independently.",
  ],
  argsSchema: z.strictObject({
    message: z.string().min(1).refine(value => value.trim().length > 0, "A message must contain text.")
      .describe("Message text for the recipient Agent."),
  }).describe("The message to send."),
});

export const sendResultSchema = z.strictObject({ name: z.string() })
  .describe("Recipient Agent name for the accepted message. Processing proceeds independently.");
export type SendResult = z.infer<typeof sendResultSchema>;

export const GetProfile = defineTool({
  id: builtin.name("tool.get_profile"), name: "get_profile",
  description: "Read an Agent's name, configured type, and task description through a resource.",
  guidelines: ["Null target selects your own profile on this resource. Other targets follow the resource's addressing schema."],
  argsSchema: z.strictObject({}).describe("Empty parameter object."),
});
export const SetProfile = defineTool({
  id: builtin.name("tool.set_profile"), name: "set_profile",
  description: "Set your own task description on this resource.",
  guidelines: ["The runtime identifies the caller. Name and configured Agent type come from the Agent.",
    "Descriptions belong to this resource. An empty description clears your description."],
  argsSchema: z.strictObject({
    description: z.string().trim().max(1000).describe("A brief description of your current task. Empty text clears it."),
  }).describe("Your task description on this resource."),
});
