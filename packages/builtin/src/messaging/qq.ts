import { GatewayConnection, GatewayCloseCode, RATE_LIMIT_DELAY, messagePath, mediaUploadPath, getNextMsgSeq, getMimeType,
  MediaFileType, MAX_UPLOAD_SIZE, sanitizeFileName,
  type InboundMessage, type InboundAttachment, type PersistedSession, type ChatScope, type MessageResponse,
  type UploadMediaResponse } from "@tencent-connect/qqbot-nodejs/protocol";
import { MessagingError, type MessagingProviderDefinition, type PluginContext } from "@asterism-app/sdk/runtime";
import { fileMediaType, type FileReferencePart, type MessagingPart, type MessagingFilePart, type MessagingMessage, type SendMessage } from "@asterism-app/sdk/contracts";
import { imageMediaType } from "../filesystem/image-io.ts";
import { messagingMessages as messages } from "../messages/messaging.ts";
import { ObservedMessages, forgetObservedConnection } from "./observed-store.ts";
import { messageObserver, receiveConnection, observedFile, downloadFile, type ObservedMessage } from "./provider-shared.ts";
import { QQApi } from "./qq-api.ts";
import { definitelyNotSent, PartialMessageDelivery, prepareSend } from "./outcome.ts";

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

const uploadPrefix = "qq-upload:";
type QQSendPart = { kind: "text"; text: string } | { kind: "media"; info: string; file: Omit<MessagingFilePart, "id"> };

async function qqUpload(plugin: Pick<PluginContext, "files">, api: QQApi, path: string, part: FileReferencePart,
  signal: AbortSignal): Promise<Extract<QQSendPart, { kind: "media" }>> {
  const filename = sanitizeFileName(part.filename ?? "file");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of plugin.files.open(part.ref, { signal })) {
    size += chunk.byteLength;
    if (size > MAX_UPLOAD_SIZE) throw new MessagingError("invalid_input", `File '${filename}' exceeds the QQ direct upload limit of ${MAX_UPLOAD_SIZE / (1024 * 1024)} MiB.`);
    chunks.push(chunk);
  }
  if (!size) throw new MessagingError("invalid_input", `File '${filename}' is empty.`);
  const bytes = Buffer.concat(chunks, size);
  const mime = fileMediaType({ name: filename, type: part.mediaType ?? "" });
  const mediaType = imageMediaType(bytes) ?? (mime === "application/octet-stream" ? getMimeType(filename) : mime);
  const fileType = mediaType.startsWith("image/") ? MediaFileType.IMAGE
    : mediaType.startsWith("video/") ? MediaFileType.VIDEO : mediaType.startsWith("audio/") ? MediaFileType.VOICE : MediaFileType.FILE;
  const upload = await api.request<UploadMediaResponse>("POST", path, signal, {
    file_type: fileType, file_data: bytes.toString("base64"), srv_send_msg: false,
    ...(fileType === MediaFileType.FILE ? { file_name: filename } : {}),
  });
  if (typeof upload.file_info !== "string" || !upload.file_info) throw new Error(`QQ did not return a media reference for '${filename}'.`);
  return { kind: "media", info: upload.file_info, file: { kind: "file", mediaType, filename, size } };
}

export function qqProvider(plugin: Pick<PluginContext, "db" | "files">): MessagingProviderDefinition {
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
              account: { accountId: connectionId, appId, clientSecret: settings.appSecret!, markdownSupport: true },
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
          if (file.id.startsWith(uploadPrefix))
            throw new MessagingError("unavailable", "QQ did not return a download URL for this outgoing attachment.");
          yield* downloadFile(file.id.startsWith("//") ? `https:${file.id}` : file.id, signal);
        },
        async sendMessage(message, { signal }) {
          signal.throwIfAborted();
          const { scope, targetId, msgId } = qqTarget(message);
          const encoded = encodeURIComponent(targetId), path = messagePath(scope, encoded);
          // Prepare all media without sending it; a broken attachment must not leave a delivered prefix.
          const parts = await prepareSend(signal, async () => {
            const parts: QQSendPart[] = [];
            let text: string[] = [];
            const flush = () => {
              if (text.some(value => value.trim())) parts.push({ kind: "text", text: text.join("\n") });
              text = [];
            };
            for (const part of message.parts) {
              if (part.kind === "text") { text.push(part.text); continue; }
              flush();
              parts.push(await qqUpload(plugin, api, mediaUploadPath(scope, encoded), part, signal));
            }
            flush();
            return parts;
          });
          const confirmed: MessagingMessage[] = [];
          // QQ deduplicates reply messages by sequence. Allocate distinct values within this send.
          const seq = msgId ? getNextMsgSeq(msgId) : 1;
          for (const [index, part] of parts.entries()) {
            const stoppedBeforeSend = signal.aborted;
            try {
              signal.throwIfAborted();
              const delivery = part.kind === "text" ? { markdown: { content: part.text }, msg_type: 2 }
                : { media: { file_info: part.info }, msg_type: 7 };
              const sent = await api.send<MessageResponse & { attachments?: InboundAttachment[] }>(path, signal, {
                ...delivery, ...(msgId ? { msg_id: msgId, msg_seq: (seq + index) & 0xffff } : part.kind === "media" ? { msg_seq: 1 } : {}),
              });
              if (!sent.id) throw new Error("QQ accepted a message without returning its identity.");
              const sentAt = new Date(typeof sent.timestamp === "number" ? sent.timestamp * 1000 : sent.timestamp).toISOString();
              const attachments = part.kind === "media" ? sent.attachments?.filter(file => file.url) : undefined;
              const sentMessage = observe({
                ...(sent.ext_info?.ref_idx ? { aliases: [sent.ext_info.ref_idx] } : {}),
                conversation: { conversationId: message.conversationId, title: store.conversation(message)?.title ?? targetId,
                  kind: scope === "c2c" ? "private" : "group", activity: sentAt },
                message: { id: sent.id, sender: { id: self.id, name: self.username, role: "self" }, sentAt, ...(msgId ? { replyTo: msgId } : {}),
                  parts: part.kind === "text" ? [part] : attachments?.length ? qqParts(undefined, attachments) : [{ ...part.file, id: `${uploadPrefix}${sent.id}` }] },
              }, false);
              confirmed.push(sentMessage);
            } catch (error) {
              if (!confirmed.length) throw error;
              const detail = error instanceof Error ? error.message : String(error);
              const status = stoppedBeforeSend ? "was not attempted" : definitelyNotSent(error) ? "was not sent" : "may have been sent";
              throw new PartialMessageDelivery(confirmed[0]!,
                `QQ confirmed ${confirmed.length} of ${parts.length} messages (${confirmed.map(item => item.id).join(", ")}). Message ${index + 1} ${status}; later messages were not attempted. ${detail}`, error);
            }
          }
          return confirmed[0]!;
        },
      };
    },
  };
}
