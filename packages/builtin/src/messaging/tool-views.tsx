import { Fragment } from "react";
import type { z } from "zod";
import { Bell, BellOff, Eye, Hash, List, MessageSquare, Paperclip, Send } from "lucide-react";
import { toolRenderer, useI18n, useRendererObject, type ContentReader, type ToolRenderProps } from "@asterism-app/sdk/renderer";
import { fileReferencePartSchema, messagingText, type Json, type MessagingConnectionInfo, type MessagingConversation,
  type MessagingMessage } from "@asterism-app/sdk/contracts";
import { inputFileName } from "@asterism-app/builtin-api/contracts";
import { ToolHeader } from "@asterism-app/ui/tool-header";
import { useToolResourceSubject } from "@asterism-app/ui/tool-content";
import { StreamingPreview } from "@asterism-app/ui/streaming-preview";
import { Badge } from "@asterism-app/ui/ui/badge";
import { Marker, MarkerContent } from "@asterism-app/ui/ui/marker";
import { StatusIcon } from "@asterism-app/ui/ui/status";
import { cn } from "@asterism-app/ui/utils";
import { FilePreview, MessageAttachments, formatFileSize } from "../shared/attachments";
import { partsOf } from "../shared/send-view";
import { inputField, inputText, toolTextTail } from "../shared/tool-preview";
import { TOOL_BODY_LINE_LIMIT } from "../shared/tool-body";
import { mediaMessages } from "../messages/media";
import { messagingMessages as messages } from "../messages/messaging";
import { ConversationsList, ConversationsSubscribe, ChatRead, ChatSend, ChatSee, type ChatMessage } from "./contract";
import { chatFiles, chatTexts, kindIcon, relativeTime, statusLabel, statusTone } from "./presentation";
import { groupTimeline } from "./timeline";

/** Passed as a component so a bodiless phase does not fall back to the default JSON body. */
const noBody = () => null;

function Note({ children }: { children: string }) {
  return <p className="type-caption">{children}</p>;
}
function Omitted({ count }: { count: number }) {
  const i18n = useI18n();
  return count > 0 ? <Note>{i18n.formatMessage(messages.omitted, { count })}</Note> : null;
}

/* ---------- list: connections, or one connection's conversations ---------- */

type ListProps = ToolRenderProps<z.infer<typeof ConversationsList.schema>>;
function ListHeader({ target, invocation, result }: ListProps) {
  const i18n = useI18n(), data = result?.data;
  const connectionId = inputText(target, "connectionId"), since = inputText(target, "since") !== undefined;
  return <ToolHeader label={i18n.text(messages.conversations)}
    subject={useToolResourceSubject(invocation.resource)} summary={connectionId}
    meta={data && [since && i18n.text(messages.changes), data.kind === "connections"
      ? i18n.formatMessage(messages.connectionCount, { count: data.connections.length, truncated: data.truncated })
      : i18n.formatMessage(messages.conversationCount, { count: data.conversations.length, truncated: data.truncated })].filter(Boolean).join(" · ")} />;
}
function ListBody({ target, result }: ListProps) {
  const i18n = useI18n(), data = result?.data;
  if (!data) return null;
  const rows = data.kind === "connections"
    ? data.connections.map(connection => <ConnectionLine key={connection.id} connection={connection} />)
    : data.conversations.map(conversation => <ConversationLine key={JSON.stringify([conversation.conversationId, conversation.threadId ?? null])}
      conversation={conversation} />);
  if (!rows.length) return <Note>{i18n.text(data.kind === "connections" ? messages.noConnections
    : inputText(target, "since") === undefined ? messages.noConversations : messages.noChanges)}</Note>;
  return <div className="flex min-w-0 flex-col gap-2">
    <ul className="flex min-w-0 flex-col">{rows.slice(0, TOOL_BODY_LINE_LIMIT)}</ul>
    <Omitted count={rows.length - TOOL_BODY_LINE_LIMIT} />
    {data.truncated && <Note>{i18n.text(messages.truncated)}</Note>}
  </div>;
}
/** Status is an icon for every row; its label is visible only when the connection is not connected. */
function ConnectionLine({ connection }: { connection: MessagingConnectionInfo }) {
  const i18n = useI18n(), connected = connection.status === "connected";
  return <li className="flex min-w-0 flex-col py-0.5">
    <div className="flex min-w-0 items-center gap-2">
      <StatusIcon tone={statusTone[connection.status]} className="size-3.5 shrink-0" />
      <span className={cn("min-w-0 truncate", !connection.enabled && "text-muted-foreground")} title={`${connection.name} · ${connection.id}`}>
        {connection.name}</span>
      {connection.identity && <span className="min-w-0 truncate type-caption" title={connection.identity}>{connection.identity}</span>}
      <span className={connected ? "sr-only" : "ml-auto shrink-0 type-caption"}>{i18n.text(statusLabel[connection.status])}</span>
    </div>
    {connection.error && <p className="type-caption truncate pl-5.5 text-destructive" title={connection.error}>{connection.error}</p>}
  </li>;
}
function ConversationLine({ conversation }: { conversation: MessagingConversation }) {
  const i18n = useI18n();
  const Icon = conversation.threadId ? Hash : kindIcon[conversation.kind] ?? MessageSquare;
  return <li className="flex min-w-0 items-center gap-2 py-0.5">
    <Icon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
    <span className="min-w-0 truncate" title={[conversation.title, conversation.conversationId, conversation.threadId].filter(Boolean).join(" · ")}>
      {conversation.title}</span>
    {conversation.change && <Badge variant="secondary" className="px-1.5 py-0 font-normal">
      {i18n.text(conversation.change === "discovered" ? messages.newConversation : messages.newMessages)}</Badge>}
    {conversation.activity && <time dateTime={conversation.activity} className="ml-auto shrink-0 type-caption tabular-nums"
      title={i18n.formatDate(Date.parse(conversation.activity), { dateStyle: "full", timeStyle: "medium" })}>
      {relativeTime(i18n, conversation.activity)}</time>}
  </li>;
}

/* ---------- subscribe: the header states the target and the requested state ---------- */

type SubscribeProps = ToolRenderProps<z.infer<typeof ConversationsSubscribe.schema>>;
function SubscribeHeader({ target, args, invocation, result }: SubscribeProps) {
  const i18n = useI18n(), data = result?.data;
  const requested = inputField(args, "enabled"), enabled = data?.enabled ?? (typeof requested === "boolean" ? requested : undefined);
  const StateIcon = enabled ? Bell : BellOff;
  return <ToolHeader label={i18n.text(messages.notification)}
    subject={useToolResourceSubject(invocation.resource)}
    summary={data?.title ?? inputText(target, "conversationId") ?? inputText(target, "connectionId")}
    meta={enabled !== undefined && <span className="inline-flex items-center gap-1">
      <StateIcon aria-hidden="true" className="size-3" />{i18n.text(enabled ? messages.on : messages.off)}</span>} />;
}

/* ---------- read: a compact transcript grouped by day and sender ---------- */

type ReadProps = ToolRenderProps<z.infer<typeof ChatRead.schema>>;
function ReadHeader({ invocation, result }: ReadProps) {
  const i18n = useI18n(), data = result?.data;
  return <ToolHeader label={i18n.text(messages.read)} subject={useToolResourceSubject(invocation.resource)}
    meta={data && i18n.formatMessage(messages.messageCount, { count: data.messages.length, truncated: data.truncated })} />;
}
function ReadBody({ target, result }: ReadProps) {
  const i18n = useI18n(), object = useRendererObject(), data = result?.data;
  if (!data) return null;
  if (!data.messages.length) return <Note>{i18n.text(inputText(target, "since") === undefined ? messages.noMessages : messages.noNewMessages)}</Note>;
  return <div className="flex min-w-0 flex-col gap-3">
    <Transcript items={data.messages} content={object.content} />
    {data.truncated && <Note>{i18n.text(messages.truncated)}</Note>}
  </div>;
}
/** A day marker opens each local day; consecutive messages of one sender share a name and time line; platform messages are centered captions. */
function Transcript({ items, content }: { items: readonly ChatMessage[]; content: ContentReader }) {
  const i18n = useI18n();
  const byId = new Map(items.map(message => [message.id, message]));
  const nameOf = (message: MessagingMessage) => message.sender.role === "self" ? i18n.text(messages.you) : message.sender.name;
  const groups = groupTimeline(items);
  return <div className="flex min-w-0 flex-col gap-3">{groups.map((group, index) => {
    const first = group.messages[0]!, sentAt = Date.parse(first.sentAt);
    return <Fragment key={first.id}>
      {groups[index - 1]?.day !== group.day && <Marker variant="separator" className="text-xs tabular-nums">
        <MarkerContent>{i18n.formatDate(sentAt, { dateStyle: "medium" })}</MarkerContent></Marker>}
      {group.sender.role === "system"
        ? group.messages.map(message => <p key={message.id} className="type-caption text-center text-balance">{messagingText(message)}</p>)
        : <section className="flex min-w-0 flex-col gap-1.5">
          <header className="flex min-w-0 items-baseline gap-2">
            <span className={cn("min-w-0 truncate font-medium", group.sender.role === "self" && "text-primary-text")}>{nameOf(first)}</span>
            <time dateTime={first.sentAt} className="shrink-0 type-caption tabular-nums"
              title={i18n.formatDate(sentAt, { dateStyle: "full", timeStyle: "medium" })}>
              {i18n.formatDate(sentAt, { hour: "2-digit", minute: "2-digit" })}</time>
          </header>
          {group.messages.map(message => <div key={message.id} className="flex min-w-0 flex-col gap-1">
            {(message.replyTo || message.quote) && <QuoteLine id={message.replyTo} quote={message.quote}
              quoted={message.replyTo ? byId.get(message.replyTo) : undefined} nameOf={nameOf} />}
            <MessageBody message={message} content={content} />
          </div>)}
        </section>}
    </Fragment>;
  })}</div>;
}
/** An embedded quote remains readable when the original message is outside this result. */
function QuoteLine({ id, quote, quoted, nameOf }: {
  id: string | undefined; quote: ChatMessage["quote"]; quoted: ChatMessage | undefined; nameOf(message: MessagingMessage): string;
}) {
  const i18n = useI18n(), object = useRendererObject(), snapshot = quote ?? quoted;
  return <div className="flex min-w-0 flex-col gap-1">
    <p className="type-caption line-clamp-1 border-l-2 border-primary/60 pl-2 wrap-anywhere">
      {quoted ? <>
        <span className="sr-only">{i18n.formatMessage(messages.inReplyTo, { name: nameOf(quoted) })}: </span>
        <span aria-hidden="true" className="font-medium text-foreground">{nameOf(quoted)} </span>
      </> : id ? i18n.formatMessage(messages.replyToId, { id }) : null}
      {snapshot && <> {messagingText(snapshot)}</>}
    </p>
    {quote && <MessageAttachments parts={chatFiles(quote)} content={object.content} />}
  </div>;
}
/** A message without a bubble: attachments first, then its text. */
function MessageBody({ message, content }: { message: ChatMessage; content: ContentReader }) {
  return <div className="flex min-w-0 flex-col gap-1.5">
    <MessageAttachments parts={chatFiles(message)} content={content} />
    {chatTexts(message).map((text, index) => <p key={index} className="type-body whitespace-pre-wrap wrap-anywhere">{text}</p>)}
  </div>;
}

/* ---------- send: the draft streams in; the accepted message replaces it ---------- */

type SendProps = ToolRenderProps<z.infer<typeof ChatSend.schema>>;
function SendHeader({ phase, target, invocation, result }: SendProps) {
  const i18n = useI18n(), replyTo = inputText(target, "replyTo");
  return <ToolHeader label={i18n.text(messages.send)} subject={useToolResourceSubject(invocation.resource)}
    meta={[replyTo && i18n.formatMessage(messages.replyToId, { id: replyTo }),
      phase === "settled" && result.kind === "succeeded" && i18n.text(messages.sent)].filter(Boolean).join(" · ")} />;
}
function SendBody({ args, result, phase }: SendProps) {
  const object = useRendererObject(), data = result?.data;
  if (data) return <MessageBody message={data} content={object.content} />;
  const draft = <DraftParts args={args} />;
  return phase === "input" ? <StreamingPreview>{draft}</StreamingPreview> : draft;
}
function DraftParts({ args }: { args: Json }) {
  return <div className="flex min-w-0 flex-col gap-1.5">{partsOf(args).map((part, index) => {
    if (inputText(part, "kind") === "text") {
      const text = inputText(part, "text");
      return text ? <p key={index} className="type-body whitespace-pre-wrap wrap-anywhere">{toolTextTail(text)}</p> : null;
    }
    const file = fileReferencePartSchema.safeParse(part);
    return file.success ? <p key={index} className="flex min-w-0 items-center gap-1.5 type-caption">
      <Paperclip aria-hidden="true" className="size-3 shrink-0" /><span className="truncate">{inputFileName(file.data)}</span>
    </p> : null;
  })}</div>;
}

/* ---------- see: the attachment's name and size, then its preview ---------- */

type SeeProps = ToolRenderProps<z.infer<typeof ChatSee.schema>>;
function SeeHeader({ target, invocation, result }: SeeProps) {
  const i18n = useI18n(), data = result?.data;
  return <ToolHeader label={i18n.text(mediaMessages.preview)}
    subject={useToolResourceSubject(invocation.resource)}
    summary={data?.filename ?? inputText(target, "fileId")}
    meta={data && formatFileSize(i18n, data.size)} />;
}
function SeeBody({ result }: SeeProps) {
  const object = useRendererObject(), image = result?.data;
  return image ? <FilePreview content={object.content} part={{ kind: "file", file: image.file, ref: image.ref,
    mediaType: image.mediaType, size: image.size, ...(image.filename ? { filename: image.filename } : {}) }} /> : null;
}

export const messagingToolRenderers = [
  toolRenderer(ConversationsList, {
    label: messages.conversations, icon: <List className="size-3.5" />,
    input: { headerRenderer: ListHeader },
    execution: { headerRenderer: ListHeader, bodyRenderer: noBody },
    result: { headerRenderer: ListHeader, bodyRenderer: ListBody },
  }),
  toolRenderer(ConversationsSubscribe, {
    label: messages.notification, icon: <Bell className="size-3.5" />,
    input: { headerRenderer: SubscribeHeader },
    execution: { headerRenderer: SubscribeHeader, bodyRenderer: noBody },
    result: { headerRenderer: SubscribeHeader, bodyRenderer: noBody },
  }),
  toolRenderer(ChatRead, {
    label: messages.read, icon: <MessageSquare className="size-3.5" />,
    input: { headerRenderer: ReadHeader },
    execution: { headerRenderer: ReadHeader, bodyRenderer: noBody },
    result: { headerRenderer: ReadHeader, bodyRenderer: ReadBody },
  }),
  toolRenderer(ChatSee, {
    label: mediaMessages.preview, icon: <Eye className="size-3.5" />,
    input: { headerRenderer: SeeHeader },
    execution: { headerRenderer: SeeHeader, bodyRenderer: noBody },
    result: { headerRenderer: SeeHeader, bodyRenderer: SeeBody },
  }),
  toolRenderer(ChatSend, {
    label: messages.send, icon: <Send className="size-3.5" />,
    input: { headerRenderer: SendHeader, bodyRenderer: SendBody, streaming: ({ args }) => partsOf(args).length > 0 },
    execution: { headerRenderer: SendHeader, bodyRenderer: SendBody },
    result: { headerRenderer: SendHeader, bodyRenderer: SendBody },
  }),
];
