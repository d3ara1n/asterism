import { SocketModeClient } from "@slack/socket-mode";
import { WebClient, WebAPIHTTPError, WebAPIPlatformError, WebAPIRateLimitedError, WebAPIRequestError, LogLevel } from "@slack/web-api";
import { MessagingError, type MessagingProviderDefinition, type PluginContext } from "@asterism-app/sdk/runtime";
import { fileMediaType, type SendMessage } from "@asterism-app/sdk/contracts";
import { messagingMessages as messages } from "../messages/messaging.ts";
import { ObservedMessages, forgetObservedConnection } from "./observed-store.ts";
import { messageObserver, messagingFiles, receiveConnection, scopedFetch, outgoingMessage, observedFile, downloadFile, providerCall, type ObservedMessage } from "./provider-shared.ts";
import { prepareSend } from "./outcome.ts";

interface SlackMessage {
  type?: string; subtype?: string; channel: string; channel_type?: string; ts: string; text?: string;
  user?: string; bot_id?: string; username?: string; thread_ts?: string;
  files?: { id?: string; name?: string; title?: string; mimetype?: string; size?: number }[];
  message?: Omit<SlackMessage, "channel">;
}
const slackText = (text: string) => text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
export function slackMessage(event: SlackMessage, self: { user: string; bot: string }): ObservedMessage | undefined {
  if (event.subtype === "message_deleted") return;
  const value = event.subtype === "message_changed" ? event.message : event;
  if (!value?.ts) return;
  const senderId = value.user ?? value.bot_id ?? "slack";
  const threadId = value.thread_ts && value.thread_ts !== value.ts ? value.thread_ts : undefined;
  const sentAt = new Date(Number(value.ts) * 1000).toISOString();
  const system = !!value.subtype && !["bot_message", "file_share", "me_message", "thread_broadcast"].includes(value.subtype);
  return {
    conversation: { conversationId: event.channel, ...(threadId ? { threadId } : {}),
      title: threadId ? `${event.channel} · ${threadId}` : event.channel, kind: event.channel_type ?? "conversation", activity: sentAt },
    message: { id: value.ts, sender: { id: senderId, name: value.username ?? senderId,
      role: value.user === self.user || value.bot_id === self.bot ? "self" : system ? "system" : "participant" },
      parts: [
        ...(value.text ? [{ kind: "text" as const, text: slackText(value.text) }] : []),
        ...(value.files ?? []).flatMap(file => file.id ? [{ kind: "file" as const, id: file.id,
          filename: file.name ?? file.title ?? file.id, mediaType: fileMediaType({ name: file.name ?? "", type: file.mimetype ?? "" }),
          ...(file.size === undefined ? {} : { size: file.size }) }] : []),
      ],
      sentAt, ...(threadId ? { threadId, replyTo: threadId } : {}) },
  };
}
export function slackError(error: unknown): unknown {
  if (error instanceof WebAPIRateLimitedError)
    return new MessagingError("request_failed", error.message, { cause: error, retryAfterMs: error.retryAfter * 1000 });
  if (error instanceof WebAPIPlatformError) {
    const code = error.data.error;
    return new MessagingError(["internal_error", "fatal_error", "service_unavailable", "request_timeout"].includes(code) ? "request_failed"
      : ["invalid_auth", "not_authed", "token_revoked", "account_inactive", "missing_scope", "not_allowed_token_type", "not_in_channel", "channel_not_found"].includes(code) ? "unavailable"
      : "invalid_input", `Slack: ${code}`, { cause: error });
  }
  if (error instanceof WebAPIHTTPError)
    return new MessagingError(error.statusCode >= 500 ? "request_failed" : "unavailable", error.message, { cause: error });
  if (error instanceof WebAPIRequestError) return new MessagingError("request_failed", error.original.message, { cause: error });
  return error;
}
const call = providerCall(slackError);
const options = { retryConfig: { retries: 0 }, rejectRateLimitedCalls: true, logLevel: LogLevel.ERROR };
export function slackReplyThread(input: Pick<SendMessage, "threadId" | "replyTo">, replyThread?: string): string | undefined {
  const root = replyThread ?? input.replyTo;
  if (input.threadId && root && input.threadId !== root)
    throw new MessagingError("invalid_input", "The Slack reply does not belong to this thread.");
  return input.threadId ?? root;
}
export function slackProvider(plugin: PluginContext): MessagingProviderDefinition {
  return {
    id: "slack-bot", label: messages.slack,
    settings: [
      { kind: "secret", key: "token", label: messages.token, description: messages.slackTokenHint, required: true, helpUrl: "https://api.slack.com/apps" },
      { kind: "secret", key: "appToken", label: messages.slackAppToken, description: messages.slackAppTokenHint, required: true, helpUrl: "https://api.slack.com/apps" },
    ],
    forget: connectionId => forgetObservedConnection(plugin.db(), connectionId),
    async create({ connectionId, settings, signal, publish }) {
      const api = (scope: AbortSignal) => new WebClient(settings.token!, { ...options, fetch: scopedFetch(scope) });
      const auth = await call(signal, () => api(signal).auth.test());
      if (!auth.bot_id || !auth.user_id || !auth.team_id) throw new MessagingError("unavailable", "Slack requires a Bot User OAuth Token (xoxb).");
      const bot = await call(signal, () => api(signal).bots.info({ bot: auth.bot_id }));
      if (!bot.bot?.app_id) throw new MessagingError("unavailable", "Slack did not return the bot's application identity.");
      const appId = bot.bot.app_id;
      const self = { user: auth.user_id, bot: auth.bot_id };
      const store = new ObservedMessages(plugin.db(), JSON.stringify([connectionId, "slack", auth.team_id, self.user]));
      const observe = messageObserver(store, publish);
      return {
        identity: `${auth.team ?? auth.team_id} / ${auth.user ?? self.user}`,
        async receive({ signal, ready }) {
          await receiveConnection(signal, scope => {
            const client = new SocketModeClient({ appToken: settings.appToken!, autoReconnectEnabled: false,
              logLevel: LogLevel.ERROR, clientOptions: { ...options, fetch: scopedFetch(scope.signal) } });
            client.on("connected", ready);
            client.on("disconnected", () => scope.fail(new MessagingError("request_failed", "Slack Socket Mode disconnected.")));
            client.on("error", error => scope.fail(slackError(error)));
            // Acknowledge every envelope, including event types that do not become chat messages.
            client.on("slack_event", ({ type, body, ack }: { type: string; body: {
              api_app_id?: string; team_id?: string; event?: SlackMessage;
            }; ack(): Promise<void> }) => {
              void (async () => {
                if (scope.signal.aborted) return;
                if (type === "events_api" && body.api_app_id !== appId) {
                  await ack();
                  throw new MessagingError("unavailable", "The Slack app-level token and bot token belong to different applications.");
                }
                if (type === "events_api" && body.team_id === auth.team_id && body.event?.type === "message") {
                  const normalized = slackMessage(body.event, self);
                  if (normalized) observe(normalized, body.event.subtype !== "message_changed");
                }
                await ack();
              })().catch(scope.fail);
            });
            return { start: () => call(scope.signal, () => client.start()), stop: () => client.disconnect() };
          });
        },
        async listConversations(query, { signal }) { signal.throwIfAborted(); return store.list(query); },
        async readMessages(query, { signal }) { signal.throwIfAborted(); return store.read(query); },
        async *openFile(query, { signal }) {
          observedFile(store, query);
          const result = await call(signal, () => api(signal).files.info({ file: query.fileId }));
          const file = result.file, address = file?.url_private_download ?? file?.url_private;
          if (!address || file?.is_external) throw new MessagingError("unsupported", "This Slack file is not hosted by Slack.");
          const url = new URL(address);
          if (url.protocol !== "https:" || !(url.hostname === "slack.com" || url.hostname.endsWith(".slack.com")))
            throw new MessagingError("unavailable", "Slack returned an external file host; bot credentials cannot be sent there.");
          yield* downloadFile(url.href, signal, { Authorization: `Bearer ${settings.token!}` });
        },
        async sendMessage(message, { signal }) {
          const input = outgoingMessage(message);
          const web = api(signal);
          const thread = slackReplyThread(input, input.replyTo ? store.message(input.conversationId, input.replyTo)?.threadId : undefined);
          const conversation = store.conversation({ conversationId: input.conversationId, threadId: thread })
            ?? store.conversation({ conversationId: input.conversationId });
          const files = await messagingFiles(plugin, input.files, signal);
          if (!files.length) {
            const sent = await call(signal, () => web.chat.postMessage({ channel: input.conversationId, text: input.text, ...(thread ? { thread_ts: thread } : {}) }));
            if (!sent.ts) throw new Error("Slack accepted the message without returning its timestamp.");
            return observe(slackMessage({ channel: sent.channel ?? input.conversationId, channel_type: conversation?.kind, ts: sent.ts,
              text: sent.message?.text ?? input.text, user: self.user, thread_ts: thread }, self)!, false);
          }
          // Uploads remain private until the single completion request shares them with the conversation.
          const uploaded = await prepareSend(signal, async () => {
            const uploaded: { id: string; title: string }[] = [];
            for (const file of files) {
              const target = await call(signal, () => web.files.getUploadURLExternal({ filename: file.name, length: file.bytes.length }));
              if (!target.upload_url || !target.file_id) throw new MessagingError("request_failed", "Slack did not return a file upload URL.");
              await call(signal, async () => {
                const response = await fetch(target.upload_url!, { method: "POST", body: file.bytes, signal });
                if (!response.ok) throw new MessagingError(response.status >= 500 ? "request_failed" : "invalid_input", `Slack file upload failed (${response.status}).`);
                await response.arrayBuffer();
              });
              uploaded.push({ id: target.file_id, title: file.name });
            }
            return uploaded;
          });
          const completed = await call(signal, () => web.files.completeUploadExternal({ files: [uploaded[0]!, ...uploaded.slice(1)], channel_id: input.conversationId,
            ...(input.text ? { initial_comment: input.text } : {}), ...(thread ? { thread_ts: thread } : {}) }));
          // Slack's upload completion returns files; their shares carry the actual chat message ID.
          try {
            const first = completed.files?.[0];
            const info = await call(signal, () => web.files.info({ file: first?.id ?? uploaded[0]!.id }));
            const shares = info.file?.shares as Record<string, Record<string, { ts?: string }[]>> | undefined;
            const ts = Object.values(shares ?? {}).flatMap(group => group[input.conversationId] ?? []).find(share => share.ts)?.ts;
            if (!ts) throw new Error("Slack shared the files without returning a message timestamp.");
            return observe(slackMessage({ channel: input.conversationId, channel_type: conversation?.kind, ts, text: input.text, user: self.user, thread_ts: thread,
              files: files.map((file, index) => ({ id: uploaded[index]!.id, name: file.name, mimetype: file.mediaType, size: file.bytes.length })) }, self)!, false);
          } catch (error) {
            // Completion has already shared the files: a later lookup failure cannot mean the send was refused.
            throw new Error(`Slack shared the files, but their message could not be read: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
          }
        },
      };
    },
  };
}
