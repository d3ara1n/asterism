import { z } from "zod";
import { defineAction, defineCall, defineCreation, defineImplementation, defineRecord, defineTool,
  conversationAddressSchema, conversationListSchema, messageListSchema, messagingConnectionInfoSchema,
  messageSchema, messageReadTargetSchema, uiTextSchema, messagingFilePartSchema, messagingTextPartSchema, contentRefSchema, fileRefSchema } from "@asterism-app/sdk/contracts";
import { builtin, List, Read, Send, See } from "@asterism-app/builtin-api/contracts";

export const Conversations = builtin.resource("conversations", z.strictObject({}));
export const chatBindingSchema = conversationAddressSchema.extend({ connectionId: z.string().min(1) });
export const Chat = builtin.resource("chat", chatBindingSchema);
/** A platform attachment addressed through this Chat; the Chat's file provider fetches it when consumed. */
export const chatFilePartSchema = messagingFilePartSchema.extend({ ref: fileRefSchema });
const chatPartsSchema = z.array(z.discriminatedUnion("kind", [messagingTextPartSchema, chatFilePartSchema]));
export const chatMessageSchema = messageSchema.extend({
  parts: chatPartsSchema, quote: z.strictObject({ parts: chatPartsSchema }).optional(),
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type ChatFilePart = z.infer<typeof chatFilePartSchema>;
export const chatMessageListSchema = messageListSchema.extend({ messages: z.array(chatMessageSchema) });
export const chatFileLocatorSchema = z.strictObject({ messageId: z.string().min(1), fileId: z.string().min(1) });
/** Image bytes fetched for one operation, with the attachment's reusable reference. */
export const chatImageSchema = chatFileLocatorSchema.extend({
  file: contentRefSchema, ref: fileRefSchema, mediaType: z.string(), filename: z.string().optional(), size: z.number().int().nonnegative(),
});
export type ChatImage = z.infer<typeof chatImageSchema>;
export const ChatMessageSent = defineRecord(builtin.name("chat.message-sent"), { schema: z.codec(
  z.union([chatMessageSchema, messageSchema.omit({ parts: true, quote: true }).extend({ text: z.string() })]), chatMessageSchema, {
    decode: value => "parts" in value ? value : (({ text, ...rest }) => ({ ...rest, parts: [{ kind: "text" as const, text }] }))(value),
    encode: value => chatMessageSchema.parse(value),
  }),
});
export const CreateConversations = defineCreation(Conversations, {
  id: builtin.name("conversations.create"), schema: z.strictObject({}).describe("Create a list of configured messaging connections and their conversations."),
});
export const chatCreateSchema = chatBindingSchema.extend({ title: z.string().trim().min(1).max(160) })
  .describe("A title and an external conversation address. Listing the conversation first is optional.");
export const CreateChat = defineCreation(Chat, { id: builtin.name("chat.create"), schema: chatCreateSchema });
export const subscriptionTargetSchema = z.strictObject({
  connectionId: z.string().min(1), conversationId: z.string().min(1).optional(), threadId: z.string().min(1).optional(),
}).refine(value => !value.threadId || !!value.conversationId, "A thread belongs to a conversation.");
/** title is the display name of the target when the change was made; matching uses only the target. */
export const subscriptionSchema = z.strictObject({ target: subscriptionTargetSchema, enabled: z.boolean(), title: z.string().optional() });
export const SubscriptionChanged = defineRecord(builtin.name("messaging.subscription-changed"), { schema: subscriptionSchema });
export const ConfigureSubscription = defineAction(Conversations, {
  id: builtin.name("conversations.subscribe"), schema: subscriptionSchema,
});
export const Subscribe = defineTool({
  id: builtin.name("tool.subscribe"), name: "subscribe",
  description: "Enable or disable event notifications for a target through a linked resource.",
  guidelines: ["The resource defines its targets and the events each target produces."],
  argsSchema: z.strictObject({ enabled: z.boolean() }).describe("Whether notifications are enabled for this target."),
});
export const ConversationsSubscribe = defineImplementation({
  ...builtin.data("conversations.subscribe-result", subscriptionSchema.describe("The updated notification subscription.")),
  resource: Conversations, tool: Subscribe, targetSchema: subscriptionTargetSchema.describe(
    "A connection subscribes to newly discovered conversations. A conversation, optionally narrowed to a thread, subscribes to incoming messages."),
  effect: "write", execution: "sequential",
});
export const listTargetSchema = z.strictObject({ connectionId: z.string().min(1), since: z.string().min(1).optional() }).nullable();
export const listResultSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("connections"), connections: z.array(messagingConnectionInfoSchema), truncated: z.boolean() }),
  conversationListSchema.extend({ kind: z.literal("conversations"), connectionId: z.string() }),
]);
export const ConversationsList = defineImplementation({
  ...builtin.data("conversations.list", listResultSchema.describe("Configured connections or provider-returned conversations and an optional reusable change cursor.")),
  resource: Conversations, tool: List,
  targetSchema: listTargetSchema.describe("Null lists connections. A connection ID lists its conversations; since compares changes against a returned cursor."),
  effect: "read", execution: "parallel",
});
export const chatReadTargetSchema = messageReadTargetSchema.nullable();
export const ChatRead = defineImplementation({
  ...builtin.data("chat.read", chatMessageListSchema.describe("Messages with attachment file references and any quoted content supplied with a reply. Quoted files belong to the enclosing reply's messageId. ID queries return found messages in requested order, once per resolved message, and missingIds. Page queries return a reusable cursor.")),
  resource: Chat, tool: Read, targetSchema: chatReadTargetSchema.describe("Null reads recent messages; since continues from a returned cursor. messageIds reads specific retained messages within this Chat's conversation and thread."),
  effect: "read", execution: "parallel",
});
export const ChatSend = defineImplementation({
  ...builtin.data("chat.send", chatMessageSchema.describe("The message accepted by the external messaging service.")),
  resource: Chat, tool: Send,
  targetSchema: z.strictObject({ replyTo: z.string().min(1).optional() }).nullable().describe("Send to this conversation. Null sends a message; replyTo quotes a message ID."),
  effect: "write", execution: "sequential",
});
export const ChatSee = defineImplementation({
  ...builtin.data("chat.see", chatImageSchema.describe("The attachment's image content and its reusable file reference.")),
  resource: Chat, tool: See, targetSchema: chatFileLocatorSchema.describe("Select an attachment by messageId and fileId."),
  effect: "read", execution: "parallel",
});
/** latest identifies the most recent observed event while the application runs; views reload their queries when it changes. */
export const viewConnectionSchema = messagingConnectionInfoSchema.extend({
  providerLabel: uiTextSchema.nullable(), latest: z.string().optional(),
});
export const ConversationsView = builtin.data("conversations.view", z.strictObject({
  connections: z.array(viewConnectionSchema), subscriptions: z.array(subscriptionTargetSchema),
}));
export const ChatView = builtin.data("chat.view", chatBindingSchema.extend({
  connection: viewConnectionSchema.nullable(), latest: z.string().optional(),
}));
export const BrowseConversations = defineCall(builtin.name("messaging.browse"), {
  scope: "plugin", input: listTargetSchema, output: listResultSchema,
});
export const ReadChat = defineCall(builtin.name("chat.read"), {
  scope: "object", input: chatReadTargetSchema, output: chatMessageListSchema,
});
export const SendChat = defineAction(Chat, {
  id: builtin.name("chat.send"), schema: z.strictObject({ text: z.string().min(1), replyTo: z.string().min(1).optional() }),
});
export type SubscriptionTarget = z.infer<typeof subscriptionTargetSchema>;
export type ViewConnection = z.infer<typeof viewConnectionSchema>;
