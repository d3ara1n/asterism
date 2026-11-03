import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { z } from "zod";
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "motion/react";
import { ArrowLeft, Bell, BellOff, CornerUpLeft, Hash, List, MessageSquare, RefreshCw, Send, Settings, X } from "lucide-react";
import { cardRenderer, creationEntry, recordRenderer, useI18n, useRendererCalls, useRendererObject, useRendererSettings,
  type CreationInputProps, type I18n, type RendererModule, type RendererReceipt } from "@asterism-app/sdk/renderer";
import { messagingText, type MessagingConversation, type MessagingConnectionInfo, type MessagingMessage } from "@asterism-app/sdk/contracts";
import { MessageAttachments } from "../shared/attachments";
import { Message, MessageContent, MessageHeader } from "@asterism-app/ui/ui/message";
import { Bubble, BubbleContent } from "@asterism-app/ui/ui/bubble";
import { Marker, MarkerContent } from "@asterism-app/ui/ui/marker";
import { MessageScroller, MessageScrollerButton, MessageScrollerContent, MessageScrollerItem, MessageScrollerProvider, MessageScrollerViewport,
  useMessageScroller } from "@asterism-app/ui/ui/message-scroller";
import { Button } from "@asterism-app/ui/ui/button";
import { IconButton } from "@asterism-app/ui/ui/icon-button";
import { Toggle } from "@asterism-app/ui/ui/toggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "@asterism-app/ui/ui/tooltip";
import { Textarea } from "@asterism-app/ui/ui/textarea";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@asterism-app/ui/ui/item";
import { ListRow } from "@asterism-app/ui/ui/list-row";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia } from "@asterism-app/ui/ui/empty";
import { Spinner } from "@asterism-app/ui/ui/spinner";
import { StatusIcon, StatusText } from "@asterism-app/ui/ui/status";
import { ChoiceField, TextField } from "@asterism-app/ui/configuration-forms";
import { cn } from "@asterism-app/ui/utils";
import { CreationForm } from "../shared/creation-form";
import { conversationsCard, chatCard } from "../shared/card-appearance";
import { messagingMessages as messages } from "../messages/messaging";
import { Conversations, Chat, CreateConversations, CreateChat, chatCreateSchema, ConversationsView, ChatView,
  BrowseConversations, ReadChat, SendChat, ChatMessageSent, ConfigureSubscription, SubscriptionChanged,
  type SubscriptionTarget, type ViewConnection, type ChatMessage } from "./contract";
import { subscriptionKey } from "./subscriptions";
import { groupTimeline } from "./timeline";
import { chatFiles, chatTexts, kindIcon, relativeTime, statusLabel, statusTone } from "./presentation";
import { messagingToolRenderers } from "./tool-views";

const addressTarget = (connectionId: string, address: { conversationId: string; threadId?: string }): SubscriptionTarget =>
  ({ connectionId, conversationId: address.conversationId, ...(address.threadId ? { threadId: address.threadId } : {}) });

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

type ChatEntry = { kind: "day"; key: string; sentAt: string } | { kind: "system"; message: ChatMessage } | { kind: "message"; message: ChatMessage; first: boolean };
/** Timeline rows in display order: a day marker opens each local day, and the first message of a sender group carries its name. */
function chatEntries(items: readonly ChatMessage[]): ChatEntry[] {
  return groupTimeline(items).flatMap((group, index, groups) => [
    ...(groups[index - 1]?.day === group.day ? [] : [{ kind: "day" as const, key: `day:${group.day}`, sentAt: group.messages[0]!.sentAt }]),
    ...group.messages.map((message, position): ChatEntry => group.sender.role === "system"
      ? { kind: "system", message } : { kind: "message", message, first: position === 0 }),
  ]);
}
const entrance = { duration: 0.22, ease: [0.23, 1, 0.32, 1] } as const;

function ChatCard({ data }: { data: z.infer<typeof ChatView.schema> }) {
  const object = useRendererObject(), calls = useRendererCalls(), i18n = useI18n(), operations = useOperations(), reducedMotion = useReducedMotion();
  const [items, setItems] = useState<ChatMessage[] | null>(null), [loadError, setLoadError] = useState<string | null>(null);
  const [text, setText] = useState(""), [replyTo, setReplyTo] = useState<MessagingMessage | null>(null);
  // Each successful send asks the timeline to return to the newest message, which it then follows as the reload arrives.
  const [follow, setFollow] = useState(0);
  const composer = useRef<HTMLTextAreaElement>(null);
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
  const nameOf = (message: MessagingMessage) => message.sender.role === "self" ? i18n.text(messages.you) : message.sender.name;
  // Sending keeps the composer in place: the draft is read-only and repeated submits are ignored, without dimming the card.
  const sending = operations.pending("send");
  const send = () => {
    if (!usable || !text.trim()) return;
    void operations.run("send", async () => {
      const receipt = await object.invoke(SendChat, { text, ...(replyTo ? { replyTo: replyTo.id } : {}) });
      if (receipt.ok) { setText(""); setReplyTo(null); setFollow(value => value + 1); }
      return receipt;
    });
  };
  const reply = (message: MessagingMessage) => { setReplyTo(message); composer.current?.focus(); };
  return <div className="nodrag nopan flex min-h-0 flex-1 flex-col">
    <header className="flex min-w-0 flex-col border-b px-3 py-1.5">
      <span className="type-caption truncate">
        {[data.connection?.name ?? data.connectionId, data.connection?.identity].filter(Boolean).join(" · ")}
      </span>
      {status !== "connected" && <ConnectionStatus connection={data.connection ?? { status }} />}
    </header>
    <div className="relative min-h-0 flex-1">
      {items ? <MessageScrollerProvider autoScroll defaultScrollPosition="end">
        <ChatTimeline items={items} follow={follow} usable={usable} nameOf={nameOf} onReply={reply} />
      </MessageScrollerProvider>
        : usable && !loadError && <div className="flex h-full items-center justify-center"><Spinner aria-hidden="true" /></div>}
    </div>
    <ErrorLine error={loadError} />
    <form className="flex flex-col border-t p-2" onSubmit={event => { event.preventDefault(); send(); }}>
      <AnimatePresence initial={false}>
        {replyTo && <motion.div key="reply" className="overflow-hidden"
          initial={reducedMotion ? false : { height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
          exit={reducedMotion ? { opacity: 0, transition: { duration: 0 } } : { height: 0, opacity: 0 }} transition={entrance}>
          <div className="flex min-w-0 items-center gap-2 pb-2">
            <CornerUpLeft className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
            <div className="flex min-w-0 flex-1 flex-col rounded-md border-l-2 border-primary/60 bg-muted px-2 py-1 text-xs leading-snug">
              <span className="truncate font-medium">{i18n.formatMessage(messages.replyingTo, { name: nameOf(replyTo) })}</span>
              <span className="truncate text-muted-foreground">{messagingText(replyTo)}</span>
            </div>
            <IconButton size="icon-xs" label={i18n.text(messages.cancelReply)} onClick={() => setReplyTo(null)}><X /></IconButton>
          </div>
        </motion.div>}
      </AnimatePresence>
      <div className="flex items-end gap-1.5">
        <Textarea ref={composer} rows={1} value={text} disabled={!usable} readOnly={sending} aria-label={i18n.text(messages.text)}
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

/**
 * Items paint without containment: `content-visibility: auto` clips each item to its box, which would cut the jump highlight
 * ringing beyond a bubble. A Chat shows one page of recent messages, so skipping offscreen rendering gains little.
 */
const itemPaint = "[content-visibility:visible]";

/** Mounted with loaded messages, so the scroller opens at the newest one; messages that arrive later animate in. */
function ChatTimeline({ items, follow, usable, nameOf, onReply }: {
  items: readonly ChatMessage[]; follow: number; usable: boolean;
  nameOf(message: MessagingMessage): string; onReply(message: MessagingMessage): void;
}) {
  const i18n = useI18n(), scroller = useMessageScroller(), reducedMotion = useReducedMotion();
  const content = useRef<HTMLDivElement>(null);
  const seen = useRef<Set<string> | null>(null);
  seen.current ??= new Set(items.map(message => message.id));
  const known = seen.current;
  useLayoutEffect(() => { for (const message of items) known.add(message.id); }, [items, known]);
  useEffect(() => { if (follow) scroller.scrollToEnd({ behavior: reducedMotion ? "auto" : "smooth" }); }, [follow]);
  // The quoted message is brought into view and its surface briefly rings so the eye finds it.
  const jump = (id: string) => {
    if (!scroller.scrollToMessage(id, { align: "center", behavior: reducedMotion ? "auto" : "smooth" })) return;
    const surface = content.current?.querySelector<HTMLElement>(
      `[data-message-id="${CSS.escape(id)}"] :is([data-slot=bubble-content], [data-slot=message-attachments])`);
    if (!surface) return;
    const color = getComputedStyle(surface).getPropertyValue("--ring").trim() || "currentColor";
    surface.animate([{ boxShadow: `0 0 0 2px ${color}` }, { boxShadow: `0 0 0 ${reducedMotion ? 2 : 8}px transparent` }],
      { duration: 1200, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" });
  };
  const byId = new Map(items.map(message => [message.id, message]));
  return <MessageScroller className="absolute inset-0">
    <MessageScrollerViewport aria-label={i18n.text(messages.chat)} className="select-text overflow-x-hidden">
      <MessageScrollerContent ref={content} className="gap-0 px-3 pt-1 pb-3">
        {items.length === 0 && <MessageScrollerItem className="flex flex-1 items-center justify-center">
          <p className="type-caption">{i18n.text(messages.noMessages)}</p>
        </MessageScrollerItem>}
        {chatEntries(items).map(entry => {
          if (entry.kind === "day") return <MessageScrollerItem key={entry.key} className={cn(itemPaint, "pt-3")}>
            <Marker variant="separator" className="text-xs tabular-nums"><MarkerContent>{i18n.formatDate(Date.parse(entry.sentAt), { dateStyle: "medium" })}</MarkerContent></Marker>
          </MessageScrollerItem>;
          const { message } = entry;
          if (entry.kind === "system") return <MessageScrollerItem key={message.id} messageId={message.id} className={cn(itemPaint, "pt-2")}>
            <Marker className="justify-center text-xs"><MarkerContent className="text-center">{messagingText(message)}</MarkerContent></Marker>
          </MessageScrollerItem>;
          return <MessageScrollerItem key={message.id} messageId={message.id} className={cn(itemPaint, entry.first ? "pt-3" : "pt-1")}>
            <ChatRow message={message} first={entry.first} fresh={!known.has(message.id)} usable={usable} nameOf={nameOf}
              quoted={message.replyTo ? byId.get(message.replyTo) : undefined} onReply={onReply} onJump={jump} />
          </MessageScrollerItem>;
        })}
      </MessageScrollerContent>
    </MessageScrollerViewport>
    <MessageScrollerButton className="bottom-3" />
  </MessageScroller>;
}

/**
 * One message: attachments above its text bubble, both on the sender's side. Time and reply sit in a rail beside the body,
 * outside its width, and appear on hover or focus.
*/
function ChatRow({ message, first, fresh, usable, quoted, nameOf, onReply, onJump }: {
  message: ChatMessage; first: boolean; fresh: boolean; usable: boolean; quoted: ChatMessage | undefined;
  nameOf(message: MessagingMessage): string; onReply(message: MessagingMessage): void; onJump(id: string): void;
}) {
  const i18n = useI18n(), object = useRendererObject(), reducedMotion = useReducedMotion();
  const self = message.sender.role === "self", align = self ? "end" : "start";
  const texts = chatTexts(message), sentAt = Date.parse(message.sentAt);
  return <motion.div initial={fresh && !reducedMotion ? { opacity: 0, y: 8, scale: 0.98 } : false} animate={{ opacity: 1, y: 0, scale: 1 }}
    transition={entrance} style={{ transformOrigin: self ? "bottom right" : "bottom left" }}>
    <Message align={align}>
      <MessageContent className="gap-1">
        {first && <MessageHeader className="px-1"><span className="truncate">{nameOf(message)}</span></MessageHeader>}
        <div data-slot="chat-body" className="group/row relative flex w-fit max-w-[80%] min-w-0 flex-col gap-1">
          <MessageAttachments parts={chatFiles(message)} content={object.content} align={align} className="rounded-xl" />
          {(texts.length > 0 || message.replyTo) && <Bubble variant={self ? "default" : "muted"} align={align} className="max-w-full">
            <BubbleContent className="flex flex-col gap-1.5 px-2.5 py-1.5 wrap-anywhere">
              {message.replyTo && <Quote id={message.replyTo} quoted={quoted} self={self} nameOf={nameOf} onJump={onJump} />}
              {texts.map((text, index) => <p key={index} className="whitespace-pre-wrap">{text}</p>)}
            </BubbleContent>
          </Bubble>}
          <div className={cn("absolute bottom-0 flex items-center gap-0.5 whitespace-nowrap opacity-0 transition-opacity duration-150",
            "group-hover/row:opacity-100 group-focus-within/row:opacity-100", self ? "right-full mr-1 flex-row-reverse" : "left-full ml-1")}>
            <time dateTime={message.sentAt} title={i18n.formatDate(sentAt, { dateStyle: "full", timeStyle: "medium" })}
              className="type-caption px-0.5 tabular-nums">{i18n.formatDate(sentAt, { hour: "2-digit", minute: "2-digit" })}</time>
            {usable && <IconButton size="icon-xs" label={i18n.text(messages.reply)} onClick={() => onReply(message)}><CornerUpLeft /></IconButton>}
          </div>
        </div>
      </MessageContent>
    </Message>
  </motion.div>;
}

/** The quoted message inside a bubble; a loaded quote jumps to its message. Text wraps within the bubble instead of widening it. */
function Quote({ id, quoted, self, nameOf, onJump }: {
  id: string; quoted: ChatMessage | undefined; self: boolean; nameOf(message: MessagingMessage): string; onJump(id: string): void;
}) {
  const i18n = useI18n();
  const name = quoted ? nameOf(quoted) : id, label = i18n.formatMessage(messages.inReplyTo, { name });
  const className = cn("flex min-w-0 flex-col rounded-md border-l-2 px-2 py-1 text-left text-xs leading-snug wrap-anywhere",
    self ? "border-primary-foreground/60 bg-primary-foreground/15" : "border-primary/60 bg-foreground/5");
  const body = <>
    <span className="line-clamp-1 font-medium">{name}</span>
    {quoted && <span className="line-clamp-2 opacity-80">{messagingText(quoted)}</span>}
  </>;
  return quoted
    ? <button type="button" title={label} aria-label={label} onClick={() => onJump(quoted.id)} className={cn(className,
      "transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring", self ? "hover:bg-primary-foreground/25" : "hover:bg-foreground/10")}>{body}</button>
    : <div title={label} className={className}>{body}</div>;
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
  tools: messagingToolRenderers,
} satisfies RendererModule;
