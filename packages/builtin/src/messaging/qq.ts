import { GatewayConnection, GatewayCloseCode, RATE_LIMIT_DELAY, messagePath, getNextMsgSeq,
  type InboundMessage, type InboundAttachment, type PersistedSession, type ChatScope, type MessageResponse } from "@tencent-connect/qqbot-nodejs/protocol";
import { MessagingError, type MessagingProviderDefinition, type PluginContext } from "@asterism-app/sdk/runtime";
import { fileMediaType, type MessagingPart, type SendMessage } from "@asterism-app/sdk/contracts";
import { messagingMessages as messages } from "../messages/messaging.ts";
import { ObservedMessages, forgetObservedConnection } from "./observed-store.ts";
import { messageObserver, outgoingMessage, receiveConnection, observedFile, downloadFile, type ObservedMessage } from "./provider-shared.ts";
import { QQApi } from "./qq-api.ts";

/** Scope is part of the address: a user openid and a group openid are separate identities. */
export function qqTarget(input: Pick<SendMessage, "conversationId" | "threadId" | "replyTo">) {
  if (input.threadId) throw new MessagingError("unsupported", "QQ private and group chats do not have threads.");
  const match = /^(c2c|group):(.+)$/.exec(input.conversationId);
  if (!match) throw new MessagingError("invalid_input", "A QQ conversation ID must be c2c:<user_openid> or group:<group_openid>.");
  return { scope: match[1] as ChatScope, targetId: match[2]!, msgId: input.replyTo };
}

function qqParts(content?: string, attachments: readonly InboundAttachment[] = []): MessagingPart[] {
  return [
    ...(content ? [{ kind: "text" as const, text: content }] : []),
    ...attachments.map(file => ({ kind: "file" as const, id: file.url,
      mediaType: fileMediaType({ name: file.filename ?? "", type: file.content_type }),
      ...(file.filename ? { filename: file.filename } : {}), ...(file.size === undefined ? {} : { size: file.size }) })),
  ];
}

export function qqMessage(input: InboundMessage, selfId: string): ObservedMessage | undefined {
  if (input.kind !== "c2c" && input.kind !== "group") return;
  const targetId = input.kind === "c2c" ? input.senderId : input.groupOpenid!;
  // QQ supplies the quoted fragment in the first element of a type-103 message.
  const element = input.msgType === 103 ? input.msgElements?.[0] : undefined;
  const quotedParts = element ? qqParts(element.content, element.attachments) : [];
  return {
    ...(input.msgIdx ? { aliases: [input.msgIdx] } : {}),
    conversation: { conversationId: `${input.kind}:${targetId}`, title: input.kind === "c2c" ? input.senderName ?? targetId : targetId,
      kind: input.kind === "c2c" ? "private" : "group", activity: input.timestamp },
    message: { id: input.messageId, sender: { id: input.senderId, name: input.senderName ?? input.senderId,
      role: input.senderId === selfId ? "self" : "participant" }, sentAt: input.timestamp,
      ...(input.refMsgIdx ? { replyTo: input.refMsgIdx } : {}),
      parts: qqParts(input.content, input.attachments),
      ...(quotedParts.length ? { quote: { parts: quotedParts } } : {}) },
  };
}

export function qqProvider(plugin: PluginContext): MessagingProviderDefinition {
  return {
    id: "qq-bot", label: messages.qq,
    settings: [
      { kind: "text", key: "appId", label: messages.qqAppId, description: messages.qqAppIdHint, required: true },
      { kind: "secret", key: "appSecret", label: messages.qqAppSecret, description: messages.qqAppSecretHint, required: true, helpUrl: "https://q.qq.com/qqbot/" },
    ],
    forget: connectionId => forgetObservedConnection(plugin.db(), connectionId),
    async create({ connectionId, settings, signal, publish }) {
      const appId = settings.appId!;
      const api = new QQApi(appId, settings.appSecret!);
      const self = await api.request<{ id: string; username: string }>("GET", "/users/@me", signal);
      const store = new ObservedMessages(plugin.db(), JSON.stringify([connectionId, "qq", appId]));
      const observe = messageObserver(store, publish);
      let session: PersistedSession | null = null;
      return {
        identity: self.username,
        async receive({ signal, ready }) {
          await receiveConnection(signal, scope => {
            const client = new GatewayConnection({
              account: { accountId: connectionId, appId, clientSecret: settings.appSecret!, markdownSupport: false },
              abortSignal: scope.signal, intents: 1 << 25, reconnect: { maxAttempts: 0 },
              session: { load: () => session, save: value => { session = value; }, clear: () => { session = null; } },
              getAccessToken: () => api.accessToken(scope.signal), clearTokenCache: () => api.clearToken(),
              getGatewayUrl: async () => (await api.request<{ url: string }>("GET", "/gateway", scope.signal)).url,
              onReady: ready, onResumed: ready, onError: scope.fail,
              onDisconnected: ({ code, reason }) => {
                api.clearToken();
                const terminal = code === GatewayCloseCode.INSUFFICIENT_INTENTS || code === GatewayCloseCode.DISALLOWED_INTENTS;
                scope.fail(new MessagingError(terminal ? "unavailable" : "request_failed", `QQ Gateway closed (${code}): ${reason}`,
                  code === GatewayCloseCode.RATE_LIMITED ? { retryAfterMs: RATE_LIMIT_DELAY } : {}));
              },
              onMessage: message => {
                if (scope.signal.aborted) return;
                try { const normalized = qqMessage(message, self.id); if (normalized) observe(normalized); }
                catch (error) { scope.fail(error); }
              },
            });
            // The host owns retries; the SDK keeps protocol session state through its persistence port.
            return { start: () => client.start() };
          });
        },
        async listConversations(query, { signal }) { signal.throwIfAborted(); return store.list(query); },
        async readMessages(query, { signal }) { signal.throwIfAborted(); qqTarget(query); return store.read(query); },
        async *openFile(query, { signal }) {
          qqTarget(query);
          const { file } = observedFile(store, query);
          yield* downloadFile(file.id.startsWith("//") ? `https:${file.id}` : file.id, signal);
        },
        async sendMessage(message, { signal }) {
          signal.throwIfAborted();
          const input = outgoingMessage(message), target = qqTarget(input);
          if (input.files.length) throw new MessagingError("unsupported", "The QQ provider currently sends text messages only.");
          const sent = await api.send<MessageResponse>(messagePath(target.scope, encodeURIComponent(target.targetId)), signal, {
            content: input.text, msg_type: 0,
            ...(target.msgId ? { msg_id: target.msgId, msg_seq: getNextMsgSeq(target.msgId) } : {}),
          });
          if (!sent.id) throw new Error("QQ accepted the message without returning its identity.");
          const sentAt = new Date(typeof sent.timestamp === "number" ? sent.timestamp * 1000 : sent.timestamp).toISOString();
          const previous = store.conversation(input);
          return observe({
            ...(sent.ext_info?.ref_idx ? { aliases: [sent.ext_info.ref_idx] } : {}),
            conversation: { conversationId: input.conversationId, title: previous?.title ?? target.targetId,
              kind: target.scope === "c2c" ? "private" : "group", activity: sentAt },
            message: { id: sent.id, sender: { id: self.id, name: self.username, role: "self" },
              parts: [{ kind: "text", text: input.text }], sentAt, ...(input.replyTo ? { replyTo: input.replyTo } : {}) },
          }, false);
        },
      };
    },
  };
}
