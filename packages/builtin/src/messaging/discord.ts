import { Client, DiscordAPIError, Events, GatewayIntentBits, HTTPError, Partials, RateLimitError, REST, Routes,
  type APIMessage, type APIUser, type Message, type RESTOptions } from "discord.js";
import { MessagingError, type MessagingProviderDefinition, type PluginContext } from "@asterism-app/sdk/runtime";
import { fileMediaType } from "@asterism-app/sdk/contracts";
import { messagingMessages as messages } from "../messages/messaging.ts";
import { ObservedMessages, forgetObservedConnection } from "./observed-store.ts";
import { messageObserver, messagingFiles, receiveConnection, scopedFetch, downloadFile, outgoingMessage, observedFile, providerCall, type ObservedMessage } from "./provider-shared.ts";
import { prepareSend } from "./outcome.ts";

/** The message facts used by normalization; REST and Gateway payloads each convert into this shape. */
export interface DiscordMessage {
  id: string; content: string; timestamp: string; type: number;
  author: { id: string; name: string };
  attachments: readonly { id: string; filename: string; size: number; contentType?: string }[];
  replyTo?: string;
}
/** A channel as addressed by Asterism: threads keep their parent; direct chats are titled by the other participant. */
export interface DiscordChannel { id: string; name: string; parentId?: string; kind: "channel" | "thread" | "private" }

const userName = (user: { global_name?: string | null; username: string }) => user.global_name || user.username;
const threadTypes = new Set([10, 11, 12]);

export function discordMessage(message: DiscordMessage, selfId: string, channel: DiscordChannel): ObservedMessage {
  const threadId = channel.parentId ? channel.id : undefined;
  return {
    conversation: { conversationId: channel.parentId ?? channel.id, ...(threadId ? { threadId } : {}),
      title: channel.name, kind: channel.kind, activity: message.timestamp },
    message: { id: message.id, parts: [
      ...(message.content ? [{ kind: "text" as const, text: message.content }] : []),
      ...message.attachments.map(file => ({ kind: "file" as const, id: file.id, filename: file.filename, size: file.size,
        mediaType: fileMediaType({ name: file.filename, type: file.contentType ?? "" }) })),
    ],
      sender: { id: message.author.id, name: message.author.name,
        role: message.author.id === selfId ? "self" : [0, 19, 20, 23].includes(message.type) ? "participant" : "system" },
      sentAt: message.timestamp, ...(threadId ? { threadId } : {}),
      ...(message.replyTo ? { replyTo: message.replyTo } : {}) },
  };
}
export function restMessage(message: APIMessage): DiscordMessage {
  return { id: message.id, content: message.content, timestamp: message.timestamp, type: message.type,
    author: { id: message.author.id, name: userName(message.author) },
    attachments: message.attachments.map(file => ({ id: file.id, filename: file.filename, size: file.size,
      ...(file.content_type ? { contentType: file.content_type } : {}) })),
    ...(message.message_reference?.message_id ? { replyTo: message.message_reference.message_id } : {}) };
}
/** REST channel payload fields used for addressing; direct chats list their recipients. */
export interface RestChannel { id: string; type: number; name?: string | null; parent_id?: string | null; recipients?: APIUser[] }
export function restChannel(channel: RestChannel): DiscordChannel {
  if (threadTypes.has(channel.type)) return { id: channel.id, name: channel.name || channel.id, parentId: channel.parent_id!, kind: "thread" };
  if (channel.type === 1) return { id: channel.id, name: channel.recipients?.[0] ? userName(channel.recipients[0]) : channel.id, kind: "private" };
  return { id: channel.id, name: channel.name || channel.id, kind: "channel" };
}
function gatewayMessage(message: Message): DiscordMessage {
  return { id: message.id, content: message.content, timestamp: message.createdAt.toISOString(), type: message.type,
    author: { id: message.author.id, name: message.author.globalName || message.author.username },
    attachments: [...message.attachments.values()].map(file => ({ id: file.id, filename: file.name, size: file.size,
      ...(file.contentType ? { contentType: file.contentType } : {}) })),
    ...(message.reference?.messageId ? { replyTo: message.reference.messageId } : {}) };
}
function gatewayChannel(message: Message, selfId: string): DiscordChannel {
  const channel = message.channel;
  if (channel.isThread()) return { id: channel.id, name: channel.name, parentId: channel.parentId!, kind: "thread" };
  if (!channel.isDMBased()) return { id: channel.id, name: channel.name, kind: "channel" };
  // A partial direct channel may not have its recipient cached; another participant's message names it.
  const recipient = "recipient" in channel ? channel.recipient : null;
  const other = recipient ? recipient.globalName || recipient.username : message.author.id === selfId ? undefined : message.author.globalName || message.author.username;
  return { id: channel.id, name: other ?? channel.id, kind: "private" };
}
export function discordError(error: unknown): unknown {
  if (error instanceof RateLimitError) return new MessagingError("request_failed", error.message, { cause: error, retryAfterMs: error.retryAfter });
  if (error instanceof DiscordAPIError || error instanceof HTTPError) {
    const status = error.status;
    return new MessagingError(status >= 500 ? "request_failed" : status === 401 || status === 403 ? "unavailable" : "invalid_input", error.message, { cause: error });
  }
  return error;
}
const call = providerCall(discordError);
// REST instances have no background sweepers; requests remain usable after a receiver has stopped.
const restOptions = { retries: 0, rejectOnRateLimit: () => true, hashSweepInterval: 0, handlerSweepInterval: 0 };
// Node's fetch supports the Undici bodies used by discord.js; its bundled DOM types do not describe all of them.
const discordFetch = (request: typeof fetch) => request as unknown as RESTOptions["makeRequest"];

export function discordProvider(plugin: PluginContext): MessagingProviderDefinition {
  return {
    id: "discord-bot", label: messages.discord,
    settings: [{ kind: "secret", key: "token", label: messages.token, description: messages.discordTokenHint,
      required: true, helpUrl: "https://discord.com/developers/applications" }],
    forget: connectionId => forgetObservedConnection(plugin.db(), connectionId),
    async create({ connectionId, settings, signal, publish }) {
      const rest = new REST({ ...restOptions, makeRequest: discordFetch(fetch) }).setToken(settings.token!);
      const me = await call(signal, () => rest.get(Routes.user("@me"), { signal }) as Promise<APIUser>);
      if (!me.bot) throw new MessagingError("unavailable", "Discord requires a bot token.");
      const store = new ObservedMessages(plugin.db(), JSON.stringify([connectionId, "discord", me.id]));
      const observe = messageObserver(store, publish);
      return {
        identity: me.username,
        async receive({ signal, ready, reconnecting }) {
          await receiveConnection(signal, scope => {
            const client = new Client({
              intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.DirectMessages, GatewayIntentBits.MessageContent],
              partials: [Partials.Channel], rest: { ...restOptions, makeRequest: discordFetch(scopedFetch(scope.signal)) },
            });
            const record = (message: Message, notify: boolean) => {
              if (scope.signal.aborted) return;
              try { observe(discordMessage(gatewayMessage(message), me.id, gatewayChannel(message, me.id)), notify); }
              catch (error) { scope.fail(error); }
            };
            const recovering = new Set<number>();
            const recovered = (shardId: number) => {
              recovering.delete(shardId);
              if (!recovering.size && client.isReady()) ready();
            };
            client.on(Events.ClientReady, () => { recovering.clear(); ready(); });
            client.on(Events.ShardReconnecting, shardId => {
              recovering.add(shardId);
              reconnecting(new Error(`Discord Gateway shard ${shardId} is reconnecting.`));
            });
            client.on(Events.ShardError, (error, shardId) => { recovering.add(shardId); reconnecting(error); });
            client.on(Events.ShardReady, recovered);
            client.on(Events.ShardResume, recovered);
            client.on(Events.MessageCreate, message => record(message, true));
            client.on(Events.MessageUpdate, (_old, message) => { if (!message.partial) record(message, false); });
            client.on(Events.Error, error => scope.fail(discordError(error)));
            // Keep the SDK's session recovery and cache; terminal disconnects end this receiver.
            client.on(Events.ShardDisconnect, event => scope.fail(new MessagingError("unavailable", `Discord Gateway closed (${event.code}). Check the bot token and enabled intents.`)));
            return {
              async start() {
                // login() can remain pending when a shard is destroyed before READY; readiness and errors come from the event handlers.
                void call(scope.signal, () => client.login(settings.token!)).catch(scope.fail);
              },
              stop: () => client.destroy(),
            };
          });
        },
        async listConversations(query, { signal }) { signal.throwIfAborted(); return store.list(query); },
        async readMessages(query, { signal }) { signal.throwIfAborted(); return store.read(query); },
        async *openFile(query, { signal }) {
          const { message: observed } = observedFile(store, query);
          // Attachment URLs are signed and expire; fetching the message returns a current URL.
          const channelId = observed.threadId ?? query.conversationId;
          const message = await call(signal, () => rest.get(Routes.channelMessage(channelId, query.messageId), { signal }) as Promise<APIMessage>);
          const file = message.attachments.find(file => file.id === query.fileId);
          if (!file) throw new MessagingError("unavailable", "The Discord attachment is no longer available.");
          yield* downloadFile(file.url, signal);
        },
        async sendMessage(message, { signal }) {
          const input = outgoingMessage(message);
          if (input.files.length > 10) throw new MessagingError("invalid_input", "Discord sends at most 10 files in one message.");
          if (input.text.length > 2000) throw new MessagingError("invalid_input", "Discord messages contain at most 2,000 characters.");
          const channelId = input.threadId ?? input.conversationId;
          const { channel, files } = await prepareSend(signal, async () => {
            const channel = restChannel(await call(signal, () => rest.get(Routes.channel(channelId), { signal }) as Promise<RestChannel>));
            if (input.threadId && channel.parentId !== input.conversationId)
              throw new MessagingError("invalid_input", "The Discord thread does not belong to this conversation.");
            return { channel, files: await messagingFiles(plugin, input.files, signal) };
          });
          const sent = await call(signal, () => rest.post(Routes.channelMessages(channelId), {
            signal, body: { content: input.text, ...(input.replyTo ? { message_reference: { message_id: input.replyTo, fail_if_not_exists: true } } : {}) },
            ...(files.length ? { files: files.map(file => ({ data: file.bytes, name: file.name })) } : {}),
          }) as Promise<APIMessage>);
          return observe(discordMessage(restMessage(sent), me.id, channel), false);
        },
      };
    },
  };
}
