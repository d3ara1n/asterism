import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { z } from "zod";
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "motion/react";
import { ArrowLeft, Bell, BellOff, CornerUpLeft, Eye, Hash, List, Megaphone, MessageSquare, RefreshCw, Send, Settings, User, Users, X,
  type LucideIcon } from "lucide-react";
import { cardRenderer, creationEntry, recordRenderer, toolRenderer, useI18n, useRendererCalls, useRendererObject, useRendererSettings,
  type CreationInputProps, type I18n, type RendererModule, type RendererReceipt, type ContentReader, type ToolRenderProps } from "@asterism-app/sdk/renderer";
import { messagingText, type MessagingConversation, type MessagingConnectionInfo, type MessagingConnectionStatus, type MessagingMessage } from "@asterism-app/sdk/contracts";
import { AttachmentGroup } from "@asterism-app/ui/ui/attachment";
import { FilePreview } from "../shared/attachments";
import { mediaMessages } from "../messages/media";
import { Button } from "@asterism-app/ui/ui/button";
import { IconButton } from "@asterism-app/ui/ui/icon-button";
import { Toggle } from "@asterism-app/ui/ui/toggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "@asterism-app/ui/ui/tooltip";
import { Textarea } from "@asterism-app/ui/ui/textarea";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@asterism-app/ui/ui/item";
import { ListRow } from "@asterism-app/ui/ui/list-row";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia } from "@asterism-app/ui/ui/empty";
import { Spinner } from "@asterism-app/ui/ui/spinner";
import { StatusIcon, StatusText, type StatusTone } from "@asterism-app/ui/ui/status";
import { ChoiceField, TextField } from "@asterism-app/ui/configuration-forms";
import { cn } from "@asterism-app/ui/utils";
import { CreationForm } from "../shared/creation-form";
import { conversationsCard, chatCard } from "../shared/card-appearance";
import { messagingMessages as messages } from "../messages/messaging";
import { Conversations, Chat, CreateConversations, CreateChat, chatCreateSchema, ConversationsView, ChatView,
  BrowseConversations, ReadChat, SendChat, ChatMessageSent, ConfigureSubscription, SubscriptionChanged,
  ConversationsList, ConversationsSubscribe, ChatRead, ChatSend, ChatSee, type SubscriptionTarget, type ViewConnection, type ChatMessage } from "./contract";
import { subscriptionKey } from "./subscriptions";
import { groupTimeline, relativeUnit } from "./timeline";

const statusTone: Record<MessagingConnectionStatus, StatusTone> = {
  connected: "success", connecting: "progress", reconnecting: "warning", failed: "error", disabled: "neutral", unavailable: "neutral",
};
const statusLabel = {
  connected: messages.connected, connecting: messages.connecting, reconnecting: messages.reconnecting,
  failed: messages.disconnected, disabled: messages.disabled, unavailable: messages.unavailable,
} satisfies Record<MessagingConnectionStatus, unknown>;
const kindIcon: Record<string, LucideIcon> = { private: User, group: Users, supergroup: Users, channel: Megaphone };
const addressTarget = (connectionId: string, address: { conversationId: string; threadId?: string }): SubscriptionTarget =>
  ({ connectionId, conversationId: address.conversationId, ...(address.threadId ? { threadId: address.threadId } : {}) });

function relativeTime(i18n: I18n, iso: string) {
  const { value, unit } = relativeUnit(Date.parse(iso), Date.now());
  return new Intl.RelativeTimeFormat(i18n.locale, { numeric: "auto", style: "short" }).format(value, unit);
}
function receiptError(i18n: I18n, receipt: RendererReceipt) {
  return receipt.ok ? null : receipt.error.display ? i18n.text(receipt.error.display) : receipt.error.message;
}
/**
 * Pending operations keyed by their target: an entry ignores repeated input while it runs,
 * and other controls stay usable, so one action does not disable the whole view.
 */
function useOperations() {
  const i18n = useI18n();
  const active = useRef(new Set<string>());
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  async function run(key: string, work: () => Promise<RendererReceipt | void>): Promise<boolean> {
    if (active.current.has(key)) return false;
    active.current.add(key); setPending(new Set(active.current)); setError(null);
    try {
      const receipt = await work();
      const failure = receipt ? receiptError(i18n, receipt) : null;
      setError(failure);
      return failure === null;
    } catch (error) {
      setError(error instanceof Error ? error.message : i18n.text(messages.failed));
      return false;
    } finally { active.current.delete(key); setPending(new Set(active.current)); }
  }
  return { pending: (key: string) => pending.has(key), error, run, clear: () => setError(null) };
}
/** Status that explains itself: failure details follow the label when present. */
function ConnectionStatus({ connection }: { connection: Pick<MessagingConnectionInfo, "status" | "error"> }) {
  const i18n = useI18n();
  const detail = connection.error;
  return <StatusText tone={statusTone[connection.status]} className="max-w-full">
    <span className="truncate" title={detail || undefined}>{i18n.text(statusLabel[connection.status])}{detail ? ` · ${detail}` : ""}</span>
  </StatusText>;
}
function NotifyToggle({ label, pressed, pending, onChange }: { label: string; pressed: boolean; pending: boolean; onChange(value: boolean): void }) {
  return <Tooltip>
    <TooltipTrigger asChild>
      <Toggle size="sm" aria-label={label} aria-busy={pending || undefined} pressed={pressed} onPressedChange={onChange}
        className="text-muted-foreground data-[state=on]:text-foreground">
        {pending ? <Spinner aria-hidden="true" /> : pressed ? <Bell /> : <BellOff />}
      </Toggle>
    </TooltipTrigger>
    <TooltipContent>{label}</TooltipContent>
  </Tooltip>;
}
function ErrorLine({ error }: { error: string | null }) {
  return error ? <p role="alert" className="type-caption px-1 text-destructive">{error}</p> : null;
}

const pageVariants = {
  enter: (direction: number) => ({ opacity: 0, x: direction * 8 }),
  center: { opacity: 1, x: 0, transition: { duration: 0.18, ease: [0, 0, 0.2, 1] } },
  exit: (direction: number) => ({ opacity: 0, x: direction * -8, transition: { duration: 0.1, ease: [0.4, 0, 1, 1] } } as const),
} as const;
/** Directional page transition: opening slides in from the right, going back slides toward it. */
function Page({ children, direction }: { children: ReactNode; direction: number }) {
  const present = useIsPresent(), reducedMotion = useReducedMotion();
  return <motion.div inert={!present} custom={direction} variants={pageVariants} initial={reducedMotion ? false : "enter"}
    animate={reducedMotion ? { opacity: 1, x: 0, transition: { duration: 0 } } : "center"}
    exit={reducedMotion ? { opacity: 0, x: 0, transition: { duration: 0 } } : "exit"}
    className="flex min-h-0 min-w-0 flex-1 flex-col">
    {children}
  </motion.div>;
}

/* ---------- Conversations: messaging providers, then a provider's observed conversations ---------- */

function ConversationsCard({ data }: { data: z.infer<typeof ConversationsView.schema> }) {
  const object = useRendererObject(), i18n = useI18n(), settings = useRendererSettings(), operations = useOperations();
  const retained = object.retained.get("asterism.builtin/conversations-selection", () => ({ id: null as string | null }));
  const [selectedId, setSelectedId] = useState(retained.id);
  const direction = useRef<1 | -1>(1);
  const select = (id: string | null) => {
    direction.current = id === null ? -1 : 1;
    retained.id = id; setSelectedId(id); operations.clear();
  };
  const selected = data.connections.find(connection => connection.id === selectedId) ?? null;
  const notify = (target: SubscriptionTarget, title: string, label: string) => {
    const key = subscriptionKey(target);
    return <NotifyToggle label={label} pending={operations.pending(key)}
      pressed={data.subscriptions.some(value => subscriptionKey(value) === key)}
      onChange={enabled => void operations.run(key, () => object.invoke(ConfigureSubscription, { target, enabled, title }))} />;
  };

  if (!data.connections.length) return <div className="nodrag nopan flex min-h-0 flex-1 flex-col justify-center p-3">
    <Empty>
      <EmptyHeader><EmptyMedia variant="icon"><MessageSquare /></EmptyMedia>
        <EmptyDescription>{i18n.text(messages.noConnections)}</EmptyDescription></EmptyHeader>
      <EmptyContent><Button size="sm" variant="outline" onClick={() => settings.openHost("providers")}>
        <Settings data-icon="inline-start" />{i18n.text(messages.openSettings)}</Button></EmptyContent>
    </Empty>
  </div>;
  return <div className="nodrag nopan relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
    <AnimatePresence initial={false} mode="popLayout" custom={direction.current}>
      <Page key={selected ? `connection:${selected.id}` : "list"} direction={direction.current}>
        {selected ? <ConnectionConversations connection={selected} back={() => select(null)} notify={notify} error={operations.error} />
          : <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto p-2">
            <ItemGroup>{data.connections.map(connection => <ListRow key={connection.id} inactive={connection.status === "disabled"}
              onOpen={() => select(connection.id)} mediaVariant="icon"
              media={<StatusIcon tone={statusTone[connection.status]} className="size-4" />} title={connection.name}
              description={[connection.identity, connection.providerLabel && i18n.text(connection.providerLabel)].filter(Boolean).join(" · ") || undefined}
              details={connection.status !== "connected" ? <ConnectionStatus connection={connection} /> : undefined}
              actions={notify({ connectionId: connection.id }, connection.name,
                i18n.formatMessage(messages.subscribeConnection, { name: connection.name }))} />)}</ItemGroup>
            <ErrorLine error={operations.error} />
          </div>}
      </Page>
    </AnimatePresence>
  </div>;
}

/** Observed conversations are read-only rows; Chats are created explicitly by a user or an Agent. */
function ConnectionConversations({ connection, back, notify, error }: {
  connection: ViewConnection; back(): void; error: string | null;
  notify(target: SubscriptionTarget, title: string, label: string): ReactNode;
}) {
  const calls = useRendererCalls(), i18n = useI18n();
  const [dialogs, setDialogs] = useState<MessagingConversation[] | null>(null);
  const [loading, setLoading] = useState(true), [loadError, setLoadError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const usable = connection.enabled && connection.status !== "unavailable";
  // Reload on each observed event, status change, and explicit refresh; the current list stays visible meanwhile.
  useEffect(() => {
    setLoadError(null);
    if (!usable) { setDialogs(null); setLoading(false); return; }
    const controller = new AbortController();
    setLoading(true);
    calls.invoke(BrowseConversations, { connectionId: connection.id }, { signal: controller.signal }).then(result => {
      if (!controller.signal.aborted && result.kind === "conversations") setDialogs(result.conversations);
    }, error => { if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : i18n.text(messages.failed)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [calls, connection.id, connection.latest, connection.status, revision, usable]);
  return <>
    <header className="flex min-w-0 items-center gap-1 border-b px-1.5 py-1.5">
      <IconButton size="icon-xs" label={i18n.text(messages.back)} onClick={back}><ArrowLeft /></IconButton>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="type-section truncate">{connection.name}</span>
        <ConnectionStatus connection={connection} />
      </div>
      <IconButton size="icon-xs" label={i18n.text(messages.refresh)} aria-busy={loading || undefined} disabled={!usable}
        onClick={() => { if (!loading) setRevision(revision + 1); }}>
        {loading && dialogs ? <Spinner aria-hidden="true" /> : <RefreshCw />}
      </IconButton>
      {notify({ connectionId: connection.id }, connection.name, i18n.formatMessage(messages.subscribeConnection, { name: connection.name }))}
    </header>
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto p-2">
      {loading && dialogs === null && !loadError && <div className="flex justify-center py-6"><Spinner aria-hidden="true" /></div>}
      {dialogs?.length === 0 && <p className="type-caption px-1 py-4 text-center text-balance">{i18n.text(messages.empty)}</p>}
      {dialogs && dialogs.length > 0 && <ItemGroup>{dialogs.map(dialog => {
        const target = addressTarget(connection.id, dialog), Icon = dialog.threadId ? Hash : kindIcon[dialog.kind] ?? MessageSquare;
        return <Item key={subscriptionKey(target)} size="sm">
          <ItemMedia variant="icon"><Icon /></ItemMedia>
          <ItemContent className="min-w-0">
            <ItemTitle className="max-w-full truncate" title={dialog.title}>{dialog.title}</ItemTitle>
            {dialog.activity && <ItemDescription className="truncate">{relativeTime(i18n, dialog.activity)}</ItemDescription>}
          </ItemContent>
          <ItemActions>{notify(target, dialog.title, i18n.formatMessage(messages.subscribeConversation, { name: dialog.title }))}</ItemActions>
        </Item>;
      })}</ItemGroup>}
      <ErrorLine error={loadError ?? error} />
    </div>
  </>;
}

/* ---------- Chat: message timeline and composer ---------- */

type ChatPart = ChatMessage["parts"][number];
type ChatFile = Extract<ChatPart, { kind: "file" }>;
/** Consecutive attachments share one group; text parts keep their position between them. */
function MessageParts({ message, content }: { message: ChatMessage; content: ContentReader }) {
  const segments: (Exclude<ChatPart, ChatFile> | ChatFile[])[] = [];
  for (const part of message.parts) {
    const last = segments.at(-1);
    if (part.kind === "text") segments.push(part);
    else if (Array.isArray(last)) last.push(part);
    else segments.push([part]);
  }
  return <div className="flex min-w-0 flex-col gap-2">{segments.map((segment, index) => Array.isArray(segment)
    ? <AttachmentGroup key={index}>{segment.map(part => <FilePreview key={part.id} content={content} part={{ kind: "file-reference", ref: part.ref,
      mediaType: part.mediaType, ...(part.filename ? { filename: part.filename } : {}), ...(part.size === undefined ? {} : { size: part.size }) }} />)}</AttachmentGroup>
    : <p key={index} className="type-body whitespace-pre-wrap break-words">{segment.text}</p>)}</div>;
}
function MessagesResult({ result }: ToolRenderProps<z.infer<typeof ChatRead.schema>>) {
  const object = useRendererObject(), i18n = useI18n();
  return <div className="flex flex-col gap-3">{result?.data?.messages.map(message => <div key={message.id} className="flex flex-col gap-1">
    <span className="type-caption text-muted-foreground">{message.sender.name} · {i18n.formatDate(Date.parse(message.sentAt), { dateStyle: "medium", timeStyle: "short" })}</span>
    <MessageParts message={message} content={object.content} />
  </div>)}</div>;
}
function SentResult({ result }: ToolRenderProps<z.infer<typeof ChatSend.schema>>) {
  const object = useRendererObject();
  return result?.data ? <MessageParts message={result.data} content={object.content} /> : null;
}
function SeenResult({ result }: ToolRenderProps<z.infer<typeof ChatSee.schema>>) {
  const object = useRendererObject(), image = result?.data;
  return image ? <FilePreview content={object.content} part={{ kind: "file", file: image.file, ref: image.ref,
    mediaType: image.mediaType, size: image.size, ...(image.filename ? { filename: image.filename } : {}) }} /> : null;
}
function ChatCard({ data }: { data: z.infer<typeof ChatView.schema> }) {
  const object = useRendererObject(), calls = useRendererCalls(), i18n = useI18n(), operations = useOperations();
  const [items, setItems] = useState<ChatMessage[] | null>(null), [loadError, setLoadError] = useState<string | null>(null);
  const [text, setText] = useState(""), [replyTo, setReplyTo] = useState<MessagingMessage | null>(null);
  const log = useRef<HTMLOListElement>(null), pinned = useRef(true);
  const status = data.connection?.status ?? "unavailable";
  const usable = !!data.connection?.enabled && status !== "unavailable";
  // Reload on mount, on each observed event for this conversation, and when the connection becomes usable.
  useEffect(() => {
    setLoadError(null);
    if (!usable) { setItems(null); setReplyTo(null); return; }
    const controller = new AbortController();
    calls.invoke(ReadChat, null, { object: object.ref, signal: controller.signal }).then(result => {
      if (!controller.signal.aborted) setItems(result.messages);
    }, error => { if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : i18n.text(messages.failed)); });
    return () => controller.abort();
  }, [calls, object.ref.id, data.connectionId, data.latest, status === "connected", usable]);
  // Stay at the newest message unless the reader has scrolled away from it.
  useLayoutEffect(() => {
    const element = log.current;
    if (element && pinned.current) element.scrollTop = element.scrollHeight;
  }, [items]);
  const byId = new Map((items ?? []).map(message => [message.id, message]));
  const nameOf = (message: MessagingMessage) => message.sender.role === "self" ? i18n.text(messages.you) : message.sender.name;
  // Sending keeps the composer in place: the draft is read-only and repeated submits are ignored, without dimming the card.
  const sending = operations.pending("send");
  const send = () => {
    if (!usable || !text.trim()) return;
    void operations.run("send", async () => {
      const receipt = await object.invoke(SendChat, { text, ...(replyTo ? { replyTo: replyTo.id } : {}) });
      if (receipt.ok) { setText(""); setReplyTo(null); pinned.current = true; }
      return receipt;
    });
  };
  return <div className="nodrag nopan flex min-h-0 flex-1 flex-col">
    <header className="flex min-w-0 flex-col border-b px-3 py-1.5">
      <span className="type-caption truncate">
        {[data.connection?.name ?? data.connectionId, data.connection?.identity].filter(Boolean).join(" · ")}
      </span>
      {status !== "connected" && <ConnectionStatus connection={data.connection ?? { status }} />}
    </header>
    <ol ref={log} role="log" aria-label={i18n.text(messages.chat)}
      className="flex min-h-0 flex-1 select-text flex-col gap-3 overflow-auto px-3 py-2"
      onScroll={event => { const element = event.currentTarget; pinned.current = element.scrollHeight - element.scrollTop - element.clientHeight < 24; }}>
      {usable && items === null && !loadError && <li className="flex flex-1 items-center justify-center"><Spinner aria-hidden="true" /></li>}
      {items?.length === 0 && <li className="type-caption flex flex-1 items-center justify-center">{i18n.text(messages.noMessages)}</li>}
      {groupTimeline(items ?? []).map((group, index, groups) => {
        const first = group.messages[0]!, newDay = groups[index - 1]?.day !== group.day;
        const day = newDay && <li className="type-caption self-center tabular-nums">
          {i18n.formatDate(Date.parse(first.sentAt), { dateStyle: "medium" })}
        </li>;
        if (group.sender.role === "system") return <Group key={first.id} day={day}>{group.messages.map(message =>
          <li key={message.id} className="type-caption self-center text-center">{messagingText(message)}</li>)}</Group>;
        const self = group.sender.role === "self";
        return <Group key={first.id} day={day}>
          <li className={cn("flex min-w-0 flex-col gap-0.5", self ? "items-end" : "items-start")}>
            <span className="type-label px-1">{nameOf(first)}</span>
            <ol className={cn("flex min-w-0 max-w-[85%] flex-col gap-0.5", self ? "items-end" : "items-start")}>
              {group.messages.map(message => {
                const quoted = message.replyTo ? byId.get(message.replyTo) : undefined;
                return <li key={message.id} className={cn("group/message flex min-w-0 items-end gap-1", self && "flex-row-reverse")}>
                  <div className={cn("min-w-0 rounded-lg px-2.5 py-1.5", self ? "bg-primary text-primary-foreground" : "bg-muted")}>
                    {message.replyTo && <p className={cn("type-caption mb-1 truncate border-l-2 pl-1.5", self ? "border-primary-foreground/50 text-primary-foreground/80" : "border-border")}>
                      {i18n.formatMessage(messages.inReplyTo, { name: quoted ? nameOf(quoted) : message.replyTo })}{quoted ? ` · ${messagingText(quoted)}` : ""}
                    </p>}
                    <MessageParts message={message} content={object.content} />
                  </div>
                  <span className="type-caption shrink-0 tabular-nums opacity-0 transition-opacity group-hover/message:opacity-100 group-focus-within/message:opacity-100">
                    {i18n.formatDate(Date.parse(message.sentAt), { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  {/* Rendered only while replies are possible; a disabled style would override the hover-only visibility. */}
                  {usable && <IconButton size="icon-xs" label={i18n.text(messages.reply)}
                    className="opacity-0 group-hover/message:opacity-100 focus-visible:opacity-100" onClick={() => setReplyTo(message)}>
                    <CornerUpLeft />
                  </IconButton>}
                </li>;
              })}
            </ol>
          </li>
        </Group>;
      })}
    </ol>
    <ErrorLine error={loadError} />
    <form className="flex flex-col gap-1.5 border-t p-2" onSubmit={event => { event.preventDefault(); send(); }}>
      {replyTo && <div className="flex min-w-0 items-center gap-1.5 rounded-md bg-muted px-2 py-1">
        <CornerUpLeft className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="type-caption min-w-0 flex-1 truncate">{i18n.formatMessage(messages.replyingTo, { name: nameOf(replyTo) })} · {messagingText(replyTo)}</span>
        <IconButton size="icon-xs" label={i18n.text(messages.cancelReply)} onClick={() => setReplyTo(null)}><X /></IconButton>
      </div>}
      <div className="flex items-end gap-1.5">
        <Textarea rows={1} value={text} disabled={!usable} readOnly={sending} aria-label={i18n.text(messages.text)}
          placeholder={i18n.text(messages.composerHint)} className="max-h-32 min-h-9 flex-1 resize-none"
          onChange={event => setText(event.target.value)}
          onKeyDown={event => {
            if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
            event.preventDefault(); send();
          }} />
        <IconButton type="submit" variant="default" size="icon" label={i18n.text(messages.send)} aria-busy={sending || undefined}
          disabled={!usable || !text.trim()}>
          {sending ? <Spinner aria-hidden="true" /> : <Send />}
        </IconButton>
      </div>
      <ErrorLine error={operations.error} />
    </form>
  </div>;
}
function Group({ day, children }: { day: ReactNode; children: ReactNode }) {
  return <>{day}{children}</>;
}

/* ---------- Chat creation: pick an observed conversation or enter its address ---------- */

const manualChoice = "__manual";
function ChatInput({ initialInput, busy, resolve, cancel }: CreationInputProps<z.input<typeof chatCreateSchema>>) {
  const calls = useRendererCalls(), i18n = useI18n();
  const [connections, setConnections] = useState<MessagingConnectionInfo[]>([]);
  const [dialogs, setDialogs] = useState<MessagingConversation[]>([]);
  const [connectionId, setConnectionId] = useState(initialInput?.connectionId ?? "");
  const [choice, setChoice] = useState<string | null>(initialInput ? manualChoice : null);
  const [conversationId, setConversationId] = useState(initialInput?.conversationId ?? "");
  const [threadId, setThreadId] = useState(initialInput?.threadId ?? "");
  const [title, setTitle] = useState(initialInput?.title ?? "");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void calls.invoke(BrowseConversations, null, { signal: controller.signal }).then(result => {
      if (controller.signal.aborted || result.kind !== "connections") return;
      setConnections(result.connections);
      setConnectionId(current => current || (result.connections.find(connection => connection.enabled)?.id ?? ""));
    }, error => { if (!controller.signal.aborted) setError(String(error)); });
    return () => controller.abort();
  }, [calls]);
  useEffect(() => {
    if (!connectionId) return;
    const controller = new AbortController();
    setDialogs([]);
    void calls.invoke(BrowseConversations, { connectionId }, { signal: controller.signal }).then(result => {
      if (!controller.signal.aborted && result.kind === "conversations") setDialogs(result.conversations);
    }, () => { /* Listing is optional; the address can be entered manually. */ });
    return () => controller.abort();
  }, [calls, connectionId]);
  const key = (dialog: MessagingConversation) => JSON.stringify([dialog.conversationId, dialog.threadId ?? null]);
  const manual = choice === manualChoice || !dialogs.length;
  return <CreationForm busy={busy} disabled={!connectionId || !conversationId.trim() || !title.trim()} onCancel={cancel}
    onSubmit={() => resolve({ connectionId, conversationId: conversationId.trim(), title, ...(threadId.trim() ? { threadId: threadId.trim() } : {}) })}>
    <ChoiceField label={i18n.text(messages.connection)} value={connectionId || null}
      options={connections.map(connection => ({ value: connection.id, label: connection.identity ? `${connection.name} · ${connection.identity}` : connection.name }))}
      onChange={value => { setConnectionId(value ?? ""); setChoice(null); }} />
    {dialogs.length > 0 && <ChoiceField label={i18n.text(messages.observed)} value={choice}
      options={[...dialogs.map(dialog => ({ value: key(dialog), label: dialog.title })), { value: manualChoice, label: i18n.text(messages.manual) }]}
      onChange={value => {
        setChoice(value);
        const dialog = dialogs.find(item => key(item) === value);
        if (!dialog) return;
        setConversationId(dialog.conversationId); setThreadId(dialog.threadId ?? ""); setTitle(dialog.title);
      }} />}
    <TextField label={i18n.text(messages.title)} value={title} onChange={setTitle} required />
    {manual && <>
      <TextField label={i18n.text(messages.conversation)} value={conversationId} onChange={setConversationId} required />
      <TextField label={i18n.text(messages.thread)} value={threadId} onChange={setThreadId} />
    </>}
    {error && <p role="alert" className="type-caption text-destructive">{error}</p>}
  </CreationForm>;
}

export default {
  resources: [
    { kind: Conversations.kind, label: messages.conversations, icon: <List className="size-4" />, card: conversationsCard },
    { kind: Chat.kind, label: messages.chat, icon: <MessageSquare className="size-4" />, card: chatCard },
  ],
  cards: [
    cardRenderer(ConversationsView, { ...conversationsCard, Body: ConversationsCard }),
    cardRenderer(ChatView, { ...chatCard, Body: ChatCard }),
  ],
  creations: [
    creationEntry(CreateConversations, { id: CreateConversations.id, label: messages.conversations, icon: <List className="size-4" />,
      group: "resources", triggers: { menu: { initialInput: {} } } }),
    creationEntry(CreateChat, { id: CreateChat.id, label: messages.chat, icon: <MessageSquare className="size-4" />,
      group: "resources", triggers: { menu: {} }, InputView: ChatInput }),
  ],
  records: [recordRenderer(ChatMessageSent, {
    icon: <Send className="size-4" />, label: data => ({ ...messages.sentRecord, values: { text: messagingText(data) } }),
  }), recordRenderer(SubscriptionChanged, {
    icon: data => data.enabled ? <Bell className="size-4" /> : <BellOff className="size-4" />,
    label: data => ({ ...(data.enabled ? messages.notificationOn : messages.notificationOff),
      values: { target: data.title ?? data.target.conversationId ?? data.target.connectionId } }),
  })],
  tools: [
    toolRenderer(ConversationsList, { label: messages.conversations, icon: <List className="size-4" /> }),
    toolRenderer(ConversationsSubscribe, { label: messages.notification, icon: <Bell className="size-4" /> }),
    toolRenderer(ChatRead, { label: messages.read, icon: <MessageSquare className="size-4" />, result: { bodyRenderer: MessagesResult } }),
    toolRenderer(ChatSee, { label: mediaMessages.preview, icon: <Eye />, result: { bodyRenderer: SeenResult } }),
    toolRenderer(ChatSend, { label: messages.send, icon: <Send className="size-4" />, result: { bodyRenderer: SentResult } }),
  ],
} satisfies RendererModule;
