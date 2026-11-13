import { Api, GrammyError, HttpError, InputFile, type ApiClientOptions } from "grammy";
import type { Message } from "grammy/types";
import { z } from "zod";
import { MessagingError, type PluginContext, type MessagingProviderDefinition } from "@asterism-app/sdk/runtime";
import type { MessageSenderRole, MessagingConversation, MessagingMessage, MessagingFilePart } from "@asterism-app/sdk/contracts";
import { ObservedMessages, forgetObservedConnection } from "./observed-store.ts";
import { TelegramAlbums } from "./telegram-albums.ts";
import { telegramMarkdown } from "./telegram-markdown.ts";
import { messagingMessages as messages } from "../messages/messaging.ts";
import { downloadFile, messagingFiles, outgoingMessage, observedFile, providerCall } from "./provider-shared.ts";

// grammY's Node API accepts native signals at its boundary; the adapter below handles the signal it passes on to fetch.
const apiSignal = (signal: AbortSignal) => signal as unknown as NonNullable<Parameters<Api["getMe"]>[0]>;
type ShimSignal = { readonly aborted: boolean; addEventListener(type: "abort", listener: () => void, options?: { once: boolean }): void };
/**
 * grammY's Node build hands fetch the signal of its abort-controller shim, which native fetch rejects before sending.
 * Forward it to a native signal so requests run on native fetch and its host dispatcher, which applies the network proxy.
 */
export function telegramFetch(fetch: typeof globalThis.fetch = globalThis.fetch): ApiClientOptions["fetch"] {
  const adapted = (input: string, init: Omit<RequestInit, "signal"> & { signal?: ShimSignal | null } = {}) => {
    const { signal: source, ...rest } = init;
    if (!source) return fetch(input, rest);
    const controller = new AbortController();
    if (source.aborted) controller.abort(); else source.addEventListener("abort", () => controller.abort(), { once: true });
    return fetch(input, { ...rest, signal: controller.signal });
  };
  return adapted as unknown as ApiClientOptions["fetch"];
}
const longPollSeconds = 30;
/** Bot API delivers album items as consecutive updates; a quiet poll of this length ends the album. */
const albumWaitSeconds = 1;

const mediaLabels: readonly (readonly [keyof Message, string])[] = [
  ["photo", "[Photo]"], ["video", "[Video]"], ["animation", "[Animation]"], ["video_note", "[Video message]"],
  ["voice", "[Voice message]"], ["audio", "[Audio]"], ["sticker", "[Sticker]"], ["location", "[Location]"],
  ["venue", "[Venue]"], ["contact", "[Contact]"], ["poll", "[Poll]"], ["dice", "[Dice]"],
];
type TelegramMedia = Pick<Message, "photo" | "document" | "animation" | "video" | "audio" | "voice" | "video_note" | "sticker">;
function telegramAttachment(message: TelegramMedia): MessagingFilePart | undefined {
  const photo = message.photo?.reduce((best, item) => item.width * item.height > best.width * best.height ? item : best);
  const value = photo ?? message.document ?? message.animation ?? message.video ?? message.audio ?? message.voice ?? message.video_note ?? message.sticker;
  if (!value) return;
  const mediaType = photo ? "image/jpeg" : "mime_type" in value && value.mime_type ? value.mime_type
    : message.voice ? "audio/ogg" : message.video_note ? "video/mp4"
    : message.sticker ? message.sticker.is_video ? "video/webm" : message.sticker.is_animated ? "application/x-tgsticker" : "image/webp"
    : "application/octet-stream";
  return { kind: "file", id: value.file_id, mediaType,
    filename: "file_name" in value && value.file_name ? value.file_name : photo ? "photo.jpg" : `attachment.${mediaType.split("/")[1]}`,
    ...(value.file_size === undefined ? {} : { size: value.file_size }) };
}

/** A selected text quote takes precedence over the original body; media stays addressable on the reply. */
function telegramQuote(message: Message): MessagingMessage["quote"] {
  const original = message.reply_to_message ?? message.external_reply;
  const text = message.quote?.text ?? message.reply_to_message?.text ?? message.reply_to_message?.caption;
  const file = original ? telegramAttachment(original) : undefined;
  const parts: MessagingMessage["parts"] = [
    ...(text ? [{ kind: "text" as const, text }] : []),
    ...(file ? [file] : []),
  ];
  return parts.length ? { parts } : undefined;
}

/** Normalize a Telegram message; selfId is the bot's user ID, so messages it authored carry the self role. */
export function telegramMessage(message: Message, selfId: number): { conversation: MessagingConversation; message: MessagingMessage } {
  const chat = message.chat;
  const title = "title" in chat ? chat.title ?? String(chat.id) : [chat.first_name, chat.last_name].filter(Boolean).join(" ");
  const media = "document" in message && message.document ? `[Document: ${message.document.file_name ?? "file"}]`
    : mediaLabels.find(([key]) => key in message && message[key] !== undefined)?.[1];
  // Messages without authored text or content are platform service messages, such as joins and pins.
  const service = message.text === undefined && message.caption === undefined && media === undefined;
  const role: MessageSenderRole = message.from?.id === selfId ? "self" : service ? "system" : "participant";
  const sender = message.sender_chat ? { id: String(message.sender_chat.id),
    name: ("title" in message.sender_chat ? message.sender_chat.title : message.sender_chat.first_name) ?? String(message.sender_chat.id), role }
    : message.from ? { id: String(message.from.id), name: [message.from.first_name, message.from.last_name].filter(Boolean).join(" "), role }
      : { id: String(chat.id), name: title, role };
  const file = telegramAttachment(message), text = message.text ?? message.caption, quote = telegramQuote(message);
  const threadId = message.message_thread_id === undefined ? undefined : String(message.message_thread_id);
  return {
    conversation: { conversationId: String(chat.id), ...(threadId ? { threadId } : {}),
      title: threadId ? `${title} · ${threadId}` : title, kind: chat.type,
      activity: new Date((message.edit_date ?? message.date) * 1000).toISOString() },
    message: { id: String(message.message_id), sender, parts: [
      ...(text ? [{ kind: "text" as const, text }] : []),
      ...(file ? [file] : text ? [] : [{ kind: "text" as const, text: media ?? "[Service message]" }]),
    ],
      sentAt: new Date(message.date * 1000).toISOString(),
      ...(message.media_group_id ? { groupId: message.media_group_id } : {}),
      ...(threadId ? { threadId } : {}), ...(message.reply_to_message ? { replyTo: String(message.reply_to_message.message_id) } : {}),
      ...(quote ? { quote } : {}) },
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
  if (error instanceof HttpError) {
    // grammY's message names only the method; the underlying cause explains network and proxy failures.
    const cause = error.error instanceof Error ? error.error.message : error.error === undefined ? "" : String(error.error);
    return new MessagingError("request_failed", cause ? `${error.message} ${cause}` : error.message, { cause: error });
  }
  return error;
}
const call = providerCall(telegramError);

const mediaGroupLimit = 10;
/** Bot API upload limits: photos up to 10 MB, other files up to 50 MB. */
const photoLimit = 10 * 1024 * 1024, fileLimit = 50 * 1024 * 1024;
const photoTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const extensionTypes: Readonly<Record<string, string>> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
/** Still images within the photo limit are sent as photos; other content, including GIFs, is sent as a document. */
export function telegramSendsPhoto(file: { filename?: string; mediaType?: string }, size: number): boolean {
  const extension = file.filename?.split(".").at(-1)?.toLowerCase();
  const type = file.mediaType?.toLowerCase() ?? (extension ? extensionTypes[extension] : undefined);
  return !!type && photoTypes.has(type) && size <= photoLimit;
}

export function telegramProvider(plugin: PluginContext): MessagingProviderDefinition {
  return {
    id: "telegram-bot", label: messages.telegram,
    settings: [{ kind: "secret", key: "token", label: messages.token, description: messages.tokenHint, required: true,
      helpUrl: "https://core.telegram.org/bots/features#botfather" }],
    forget: connectionId => forgetObservedConnection(plugin.db(), connectionId),
    async create({ connectionId, settings, signal, publish }) {
      const api = new Api(settings.token!, { fetch: telegramFetch() });
      const me = await call(signal, () => api.getMe(apiSignal(signal)));
      const store = new ObservedMessages(plugin.db(), JSON.stringify([connectionId, "telegram", String(me.id)]));
      let offset = z.strictObject({ offset: z.number().int().nonnegative() }).parse(store.state("receiver") ?? { offset: 0 }).offset;
      const advance = (value: number) => { store.setState("receiver", { offset: value }); offset = value; };
      return {
        identity: me.username ? `@${me.username}` : me.first_name,
        async receive({ signal, ready }) {
          // Album items arrive as separate updates; publish the album once no item has arrived for a short window.
          const pending = new TelegramAlbums(store);
          const flush = (keep: ReadonlySet<string>) => {
            for (const event of pending.flush(keep)) publish(event);
          };
          // The first poll returns immediately, so acceptance is reported without waiting for the long-poll timeout.
          let timeout = 0;
          try {
            while (!signal.aborted) {
              const updates = await call(signal, () => api.getUpdates({ offset, timeout: pending.size ? albumWaitSeconds : timeout,
                allowed_updates: ["message", "edited_message", "channel_post", "edited_channel_post"] }, apiSignal(signal)));
              if (timeout === 0) { ready(); timeout = longPollSeconds; }
              const touched = new Set<string>();
              for (const update of updates) {
                signal.throwIfAborted();
                if (update.update_id < offset) continue;
                const message = update.message ?? update.edited_message ?? update.channel_post ?? update.edited_channel_post;
                if (message) {
                  const normalized = telegramMessage(message, me.id), group = message.media_group_id;
                  if (message.reply_to_message) {
                    const quoted = telegramMessage(message.reply_to_message as Message, me.id);
                    // A reply can supply a message that privacy settings never delivered on its own.
                    if (!store.message(quoted.conversation.conversationId, quoted.message.id)) {
                      const retained = store.observe(quoted.conversation, quoted.message);
                      if (retained.discovered) publish({ kind: "conversation.discovered", conversation: quoted.conversation });
                    }
                  }
                  const recorded = store.observe(normalized.conversation, normalized.message);
                  advance(update.update_id + 1);
                  if (recorded.discovered) publish({ kind: "conversation.discovered", conversation: normalized.conversation });
                  // Edits update the retained message; only newly observed messages become events.
                  if (!(update.message || update.channel_post) || !recorded.inserted) continue;
                  if (!group) { publish({ kind: "messages.received", conversation: normalized.conversation, messages: [normalized.message] }); continue; }
                  touched.add(pending.touch(normalized.conversation, group));
                } else advance(update.update_id + 1);
              }
              flush(touched);
            }
          } finally { flush(new Set()); }
        },
        async listConversations(query, { signal }) { signal.throwIfAborted(); return store.list(query); },
        async readMessages(query, { signal }) { signal.throwIfAborted(); return store.read(query); },
        async *openFile(query, { signal }) {
          const { file: attachment } = observedFile(store, query);
          const file = await call(signal, () => api.getFile(attachment.id, apiSignal(signal)));
          if (!file.file_path) throw new MessagingError("unavailable", "Telegram did not return a downloadable file path.");
          yield* downloadFile(`https://api.telegram.org/file/bot${settings.token!}/${file.file_path}`, signal);
        },
        async sendMessage(message, { signal }) {
          const input = outgoingMessage(message);
          const text = telegramMarkdown(input.text);
          const options = {
            ...(input.threadId ? { message_thread_id: Number(input.threadId) } : {}),
            ...(input.replyTo ? { reply_parameters: { message_id: Number(input.replyTo) } } : {}),
          };
          const caption = text ? { caption: text, parse_mode: "HTML" as const } : {};
          const files = input.files;
          if (files.length > mediaGroupLimit) throw new MessagingError("invalid_input", `Telegram sends at most ${mediaGroupLimit} files in one message.`);
          // Files are read before the request, so a missing source fails without sending anything.
          const resolved = await messagingFiles(plugin, files, signal, { bytes: fileLimit, label: "Telegram's 50 MB upload limit" });
          const uploads = resolved.map(file => ({
            file: new InputFile(file.bytes, file.name),
            photo: telegramSendsPhoto({ filename: file.name, mediaType: file.mediaType }, file.bytes.length),
          }));
          const [first] = uploads;
          const sent = await call(signal, async () => {
            if (!first) return api.sendMessage(input.conversationId, text, { ...options, parse_mode: "HTML" }, apiSignal(signal));
            if (uploads.length === 1) return first.photo
              ? api.sendPhoto(input.conversationId, first.file, { ...options, ...caption }, apiSignal(signal))
              : api.sendDocument(input.conversationId, first.file, { ...options, ...caption }, apiSignal(signal));
            // A media group mixes photos only with photos; any other file sends the whole group as documents.
            const extra = (index: number) => index === 0 ? caption : {};
            const media = uploads.every(upload => upload.photo)
              ? uploads.map((upload, index) => ({ type: "photo" as const, media: upload.file, ...extra(index) }))
              : uploads.map((upload, index) => ({ type: "document" as const, media: upload.file, ...extra(index) }));
            return api.sendMediaGroup(input.conversationId, media, options, apiSignal(signal));
          });
          // Every returned item retains its platform ID; the send receipt identifies the first message.
          let result: MessagingMessage | undefined;
          for (const item of (Array.isArray(sent) ? sent : [sent]) as Message[]) {
            const normalized = telegramMessage(item, me.id);
            const recorded = store.observe(normalized.conversation, normalized.message);
            if (recorded.discovered) publish({ kind: "conversation.discovered", conversation: normalized.conversation });
            result ??= normalized.message;
          }
          return result!;
        },
      };
    },
  };
}
