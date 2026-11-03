import { z } from "zod";
import { defineTool, fileReferencePartSchema } from "@asterism-app/sdk/contracts";
import { builtin } from "./identity.ts";

const messageResourceSchema = z.strictObject({ sessionId: z.string().min(1), id: z.string().min(1), kind: z.string().min(1) });

/** Agent and event messages retain the source resource and sender name captured with the input; plugins format event facts as message text. */
export const agentMessageSenderSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("user") }),
  z.strictObject({
    kind: z.literal("agent"),
    resource: messageResourceSchema,
    name: z.string().min(1),
    mesh: z.strictObject({
      channel: z.string().min(1),
      id: z.number().int().nonnegative().nullable(),
    }).optional().describe("Mesh channel name and sender's numeric name disambiguator. Null means the sender is not exposed to the channel."),
  }),
  z.strictObject({
    kind: z.literal("event"),
    resource: messageResourceSchema,
    name: z.string().min(1),
  }),
]);
export type AgentMessageSender = z.infer<typeof agentMessageSenderSchema>;

/** The host matches resource types; target is declared by each resource implementation. */
export const Send = defineTool({
  id: builtin.name("tool.send"), name: "send",
  description: "Send text and file references through a linked resource.",
  guidelines: [
    "resource_id selects the messaging resource. Its target schema defines the destination and any reply options.",
    "The resource implementation determines the sending identity and delivery behavior.",
    "A file-reference part carries a FileRef in its ref field. The optional filename specifies the name used for delivery.",
    "Referenced content is resolved by the consuming implementation.",
  ],
  argsSchema: z.strictObject({
    parts: z.array(z.union([
      z.strictObject({ kind: z.literal("text"), text: z.string() }),
      fileReferencePartSchema,
    ])).min(1).max(128)
      .refine(parts => parts.some(part => part.kind !== "text" || part.text.trim().length > 0), "A message requires text or a file reference.")
      .describe("Ordered text and file references. References identify content provided by their original source resources."),
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
