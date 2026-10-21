import { z } from "zod";
import { defineTool } from "@atelier/sdk/contracts";
import { builtin } from "./identity.ts";

/** 发送者保留通信资源与代理名称；接收定位由资源工具实现声明。 */
export const agentMessageSenderSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("user") }),
  z.strictObject({
    kind: z.literal("agent"),
    resource: z.strictObject({ sessionId: z.string().min(1), id: z.string().min(1), kind: z.string().min(1) }),
    name: z.string().min(1),
  }),
]);
export type AgentMessageSender = z.infer<typeof agentMessageSenderSchema>;

/** 资源类型匹配由宿主完成，target 由各资源实现声明。 */
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
