import { Api, GrammyError, HttpError, type ApiClientOptions } from "grammy";
import type { Message } from "grammy/types";
import { MessagingError, type PluginContext, type MessagingProviderDefinition } from "@asterism-app/sdk/runtime";
import type { MessageSenderRole, MessagingConversation, MessagingMessage } from "@asterism-app/sdk/contracts";
import { TelegramStore, forgetTelegramConnection, telegramAccount } from "./telegram-store.ts";
import { messagingMessages as messages } from "../messages/messaging.ts";

// grammY uses the AbortController shim type in Node; native signals implement the API it consumes.
const apiSignal = (signal: AbortSignal) => signal as unknown as NonNullable<Parameters<Api["getMe"]>[0]>;
const longPollSeconds = 30;

const mediaLabels: readonly (readonly [keyof Message, string])[] = [
  ["photo", "[Photo]"], ["video", "[Video]"], ["animation", "[Animation]"], ["video_note", "[Video message]"],
  ["voice", "[Voice message]"], ["audio", "[Audio]"], ["sticker", "[Sticker]"], ["location", "[Location]"],
  ["venue", "[Venue]"], ["contact", "[Contact]"], ["poll", "[Poll]"], ["dice", "[Dice]"],
];

/** Normalize a Telegram message; selfId is the bot's user ID, so messages it authored carry the self role. */
export function telegramMessage(message: Message, selfId: number): { conversation: MessagingConversation; message: MessagingMessage } {
  const chat = message.chat;
  const title = "title" in chat ? chat.title ?? String(chat.id) : [chat.first_name, chat.last_name].filter(Boolean).join(" ");
  const media = "document" in message && message.document ? `[Document: ${message.document.file_name ?? "file"}]`
    : mediaLabels.find(([key]) => key in message && message[key] !== undefined)?.[1];
  // Messages without authored text or content are platform service messages, such as joins and pins.
  const service = message.text === undefined && message.caption === undefined && media === undefined;
  const role: MessageSenderRole = service ? "system" : message.from?.id === selfId ? "self" : "participant";
  const sender = message.sender_chat ? { id: String(message.sender_chat.id),
    name: ("title" in message.sender_chat ? message.sender_chat.title : message.sender_chat.first_name) ?? String(message.sender_chat.id), role }
    : message.from ? { id: String(message.from.id), name: [message.from.first_name, message.from.last_name].filter(Boolean).join(" "), role }
      : { id: String(chat.id), name: title, role };
  const text = message.text ?? (message.caption ? `${media ?? "[Attachment]"}\n${message.caption}` : media ?? "[Service message]");
  const threadId = message.message_thread_id === undefined ? undefined : String(message.message_thread_id);
  return {
    conversation: { conversationId: String(chat.id), ...(threadId ? { threadId } : {}),
      title: threadId ? `${title} · ${threadId}` : title, kind: chat.type,
      activity: new Date((message.edit_date ?? message.date) * 1000).toISOString() },
    message: { id: String(message.message_id), sender, text,
      sentAt: new Date(message.date * 1000).toISOString(),
      ...(threadId ? { threadId } : {}), ...(message.reply_to_message ? { replyTo: String(message.reply_to_message.message_id) } : {}) },
  };
}

/**
 * Map Bot API failures to messaging codes: rate limits, server errors, and network failures are transient;
 * rejected tokens, conflicting receivers, and inaccessible chats are terminal; malformed requests are invalid input.
 */
export function telegramError(error: unknown): unknown {
  if (error instanceof GrammyError) {
    const options = { cause: error };
    if (error.error_code === 429) return new MessagingError("request_failed", error.description,
      { ...options, ...(error.parameters.retry_after !== undefined ? { retryAfterMs: error.parameters.retry_after * 1000 } : {}) });
    if (error.error_code >= 500) return new MessagingError("request_failed", error.description, options);
    if (error.error_code === 400) return new MessagingError("invalid_input", error.description, options);
    return new MessagingError("unavailable", error.description, options);
  }
  if (error instanceof HttpError) return new MessagingError("request_failed", error.message, { cause: error });
  return error;
}
async function call<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> {
  signal.throwIfAborted();
  try { return await work(); }
  catch (error) { signal.throwIfAborted(); throw telegramError(error); }
}

export function telegramProvider(plugin: PluginContext): MessagingProviderDefinition {
  return {
    id: "telegram-bot", label: messages.telegram,
    settings: [{ kind: "secret", key: "token", label: messages.token, description: messages.tokenHint, required: true,
      helpUrl: "https://core.telegram.org/bots/features#botfather" }],
    forget: connectionId => forgetTelegramConnection(plugin.db(), connectionId),
    async create({ connectionId, settings, signal, publish }) {
      // The host's native fetch dispatcher applies the configured network proxy.
      const api = new Api(settings.token!, { fetch: globalThis.fetch as unknown as ApiClientOptions["fetch"] });
      const me = await call(signal, () => api.getMe(apiSignal(signal)));
      const store = new TelegramStore(plugin.db(), telegramAccount(connectionId, me.id));
      return {
        identity: me.username ? `@${me.username}` : me.first_name,
        async receive({ signal, ready }) {
          // The first poll returns immediately, so acceptance is reported without waiting for the long-poll timeout.
          let timeout = 0;
          while (!signal.aborted) {
            const updates = await call(signal, () => api.getUpdates({ offset: store.offset(), timeout,
              allowed_updates: ["message", "edited_message", "channel_post", "edited_channel_post"] }, apiSignal(signal)));
            if (timeout === 0) { ready(); timeout = longPollSeconds; }
            for (const update of updates) {
              signal.throwIfAborted();
              if (update.update_id < store.offset()) continue;
              const message = update.message ?? update.edited_message ?? update.channel_post ?? update.edited_channel_post;
              if (message) {
                const normalized = telegramMessage(message, me.id);
                const discovered = store.record(normalized.conversation, normalized.message);
                store.advance(update.update_id + 1);
                if (discovered) publish({ kind: "conversation.discovered", conversation: normalized.conversation });
                if (update.message || update.channel_post) publish({ kind: "message.received", ...normalized });
              } else store.advance(update.update_id + 1);
            }
          }
        },
        async listConversations(query, { signal }) { signal.throwIfAborted(); return store.list(query); },
        async readMessages(query, { signal }) { signal.throwIfAborted(); return store.read(query); },
        async sendMessage(input, { signal }) {
          const sent = await call(signal, () => api.sendMessage(input.conversationId, input.text, {
            ...(input.threadId ? { message_thread_id: Number(input.threadId) } : {}),
            ...(input.replyTo ? { reply_parameters: { message_id: Number(input.replyTo) } } : {}),
          }, apiSignal(signal)));
          const normalized = telegramMessage(sent, me.id);
          if (store.record(normalized.conversation, normalized.message))
            publish({ kind: "conversation.discovered", conversation: normalized.conversation });
          return normalized.message;
        },
      };
    },
  };
}
