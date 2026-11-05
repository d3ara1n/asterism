import { z } from "zod";
import { uiTextSchema } from "./i18n.ts";
import { providerSettingsSchema } from "./provider-settings.ts";
import { fileReferencePartSchema } from "./files.ts";

const id = z.string().min(1);
export const messagingProviderTypeSchema = z.strictObject({
  id, owner: id, label: uiTextSchema, settings: providerSettingsSchema,
});
export const messagingConnectionSchema = z.strictObject({
  id, providerId: id, name: z.string().trim().min(1).max(160), enabled: z.boolean(),
  settings: z.record(z.string(), z.string()),
});
/**
 * Connection runtime state. Reconnecting retains the last identity and reports the failure being retried;
 * failed is terminal until the configuration changes or the user reconnects.
 */
export const messagingConnectionStatusSchema = z.enum(["disabled", "unavailable", "connecting", "connected", "reconnecting", "failed"]);
export const messagingConnectionInfoSchema = messagingConnectionSchema.omit({ settings: true }).extend({
  status: messagingConnectionStatusSchema,
  identity: z.string().optional(), error: z.string().optional(),
});
/** Provider-owned addresses and cursors are opaque to the host. */
export const conversationAddressSchema = z.strictObject({
  conversationId: id, threadId: id.optional(),
});
export const conversationSchema = conversationAddressSchema.extend({
  title: z.string(), kind: z.string(), activity: z.string().optional(),
  change: z.enum(["discovered", "messages"]).optional(),
});
/**
 * A sender's relation to the connection: self is the connection's own identity, participant is another party,
 * and system is content produced by the platform rather than authored by a party.
 */
export const messageSenderRoleSchema = z.enum(["self", "participant", "system"]);
export const messageSenderSchema = z.strictObject({ id, name: z.string(), role: messageSenderRoleSchema });
export const messagingFilePartSchema = z.strictObject({
  kind: z.literal("file"), id,
  filename: z.string().optional(), mediaType: z.string(),
  size: z.number().int().nonnegative().optional(),
});
export const messagingTextPartSchema = z.strictObject({ kind: z.literal("text"), text: z.string() });
export const messagingPartSchema = z.discriminatedUnion("kind", [messagingTextPartSchema, messagingFilePartSchema]);
/** Content supplied with a reply, without asserting the original message's identity, author, or time. */
export const messageQuoteSchema = z.strictObject({ parts: z.array(messagingPartSchema) });
export const messageSchema = z.strictObject({
  id, sender: messageSenderSchema, parts: z.array(messagingPartSchema),
  sentAt: z.string(), replyTo: id.optional(), threadId: id.optional(), groupId: id.optional(),
  quote: messageQuoteSchema.optional(),
});
export const messagingFileQuerySchema = conversationAddressSchema.extend({ messageId: id, fileId: id });
export const conversationQuerySchema = z.strictObject({ since: id.optional() });
export const conversationListSchema = z.strictObject({
  conversations: z.array(conversationSchema), cursor: id.optional(), truncated: z.boolean(),
});
const messagePageTargetSchema = z.strictObject({ since: id.optional(), limit: z.number().int().positive().optional() });
const messageIdsTargetSchema = z.strictObject({ messageIds: z.array(id).min(1) });
export const messageReadTargetSchema = z.union([messagePageTargetSchema, messageIdsTargetSchema]);
export const messageQuerySchema = z.union([
  conversationAddressSchema.extend(messagePageTargetSchema.shape),
  conversationAddressSchema.extend(messageIdsTargetSchema.shape),
]);
export const messageListSchema = z.strictObject({
  messages: z.array(messageSchema), cursor: id.optional(), truncated: z.boolean(),
  missingIds: z.array(id).optional(),
});
/** Files are references resolved by the provider when sending; text accompanies them as a caption. */
export const sendMessageSchema = conversationAddressSchema.extend({
  parts: z.array(z.union([messagingTextPartSchema, fileReferencePartSchema])).min(1),
  replyTo: id.optional(),
}).refine(value => value.parts.some(part => part.kind === "file-reference" || part.text.trim()), "A message requires text or a file.");
export const messagingEventSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("conversation.discovered"), conversation: conversationSchema }),
  z.strictObject({ kind: z.literal("messages.received"), conversation: conversationSchema, messages: z.array(messageSchema).min(1) }),
]);
export type MessagingProviderType = z.infer<typeof messagingProviderTypeSchema>;
export type MessagingConnection = z.infer<typeof messagingConnectionSchema>;
export type MessagingConnectionStatus = z.infer<typeof messagingConnectionStatusSchema>;
export type MessagingConnectionInfo = z.infer<typeof messagingConnectionInfoSchema>;
export type ConversationAddress = z.infer<typeof conversationAddressSchema>;
export type MessagingConversation = z.infer<typeof conversationSchema>;
export type MessageSenderRole = z.infer<typeof messageSenderRoleSchema>;
export type MessagingMessage = z.infer<typeof messageSchema>;
export type MessagingFilePart = z.infer<typeof messagingFilePartSchema>;
export type MessagingPart = z.infer<typeof messagingPartSchema>;
export type MessagingFileQuery = z.infer<typeof messagingFileQuerySchema>;
export function messagingText(message: { parts: readonly MessagingPart[] }): string {
  return message.parts.map(part => part.kind === "text" ? part.text : `[File: ${part.filename ?? part.id}]`).join("\n");
}
export type ConversationQuery = z.infer<typeof conversationQuerySchema>;
export type ConversationList = z.infer<typeof conversationListSchema>;
export type MessageQuery = z.infer<typeof messageQuerySchema>;
export type MessageList = z.infer<typeof messageListSchema>;
export type SendMessage = z.infer<typeof sendMessageSchema>;
export type MessagingEvent = z.infer<typeof messagingEventSchema>;
export type ConnectionEvent = { connectionId: string; event: MessagingEvent };
