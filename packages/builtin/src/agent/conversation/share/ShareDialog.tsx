import { useCallback, useEffect, useMemo, useRef, useState, type Ref } from "react";
import { useI18n, useRendererApplication, type RendererSessionSnapshot } from "@asterism-app/sdk/renderer";
import { Agent, type AgentMessageSender } from "@asterism-app/builtin-api/contracts";
import { Check, ChevronDown, Copy, Download, FileText, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { Markdown } from "@asterism-app/ui/markdown";
import { BrandMark } from "@asterism-app/ui/ui/brand-mark";
import { Button } from "@asterism-app/ui/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@asterism-app/ui/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@asterism-app/ui/ui/dropdown-menu";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@asterism-app/ui/ui/empty";
import { Spinner } from "@asterism-app/ui/ui/spinner";
import { StatusText } from "@asterism-app/ui/ui/status";
import { ToggleGroup, ToggleGroupItem } from "@asterism-app/ui/ui/toggle-group";
import { useLifetimeSignal } from "@asterism-app/ui/use-lifetime";
import { cn } from "@asterism-app/ui/utils";
import { shareMessages as messages } from "../../../messages/share";
import { conversationMessages } from "../../../messages/conversation";
import { commonMessages } from "../../../messages/common";
import { messageAppearance, messageSenderLabel } from "../../message-presentation";
import { messageTimeOptions } from "../message-time";
import { initialShareSelection, prependEarlierShareMessages, shareMarkdown, shareMessages, shareTurnGroups, toggleShareSelection,
  type ShareMessage } from "./share-content";
import { readConversation } from "../read-history";
import { conversationTimeline } from "../timeline";
import type { ConversationHistoryWindow } from "../history-window";
import { shareImage, shareImageScale, ShareImageSizeError } from "./share-image";
import "./share.css";

export interface ShareDialogProps {
  snapshot: RendererSessionSnapshot;
  messages: ShareMessage[];
  anchor: string;
  historyWindow: ConversationHistoryWindow;
  earlier: boolean;
  origin: HTMLElement;
  onClose(): void;
}

type Action = "copyImage" | "saveImage" | "copyMarkdown" | "saveMarkdown";
const widths = [720, 960, 1200] as const;
/** Printed in the image, where it cannot be clicked, so the visible text carries the address. */
const siteUrl = "https://asterism.dearain.dev";
const segment = "h-6 min-w-0 px-2.5 text-xs tabular-nums";

export default function ShareDialog({ snapshot, messages: initial, anchor, historyWindow, earlier: initialEarlier, origin, onClose }: ShareDialogProps) {
  const i18n = useI18n();
  const application = useRendererApplication();
  const { agentId } = historyWindow;
  const lifetime = useLifetimeSignal();
  const [candidates, setCandidates] = useState(initial);
  const [selected, setSelected] = useState(() => initialShareSelection(initial, anchor));
  const [rangeFrom, setRangeFrom] = useState<string | null>(anchor);
  const [width, setWidth] = useState<number>(960);
  const [earlier, setEarlier] = useState(initialEarlier);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<Action | null>(null);
  const [agentTitle, setAgentTitle] = useState<string | null>(null);
  const preview = useRef<HTMLDivElement | null>(null);
  const [frameWidth, frameRef] = useLayoutWidth();
  const [documentHeight, setDocumentHeight] = useState(0);

  useEffect(() => {
    const signal = lifetime();
    void snapshot.resources.get(Agent, agentId, { signal }).then(result => {
      if (result && !signal.aborted) setAgentTitle(result.resource.title);
    }, error => { if (!signal.aborted) console.error("Agent title could not be read for sharing.", error); });
  }, [snapshot, agentId, lifetime]);

  const agentName = agentTitle ?? i18n.text(commonMessages.kindAgent);
  const label = useCallback((message: ShareMessage) => message.sender ? i18n.text(messageSenderLabel(message.sender)) : agentName, [i18n, agentName]);
  const chosen = useMemo(() => candidates.filter(message => selected.has(message.id)), [candidates, selected]);
  const groups = useMemo(() => shareTurnGroups(candidates), [candidates]);
  const scale = documentHeight ? shareImageScale(width, documentHeight) : 1;
  const zoom = frameWidth ? Math.min(1, frameWidth / width) : 1;
  const idle = busy === null;

  const documentRef = useCallback((element: HTMLDivElement | null) => {
    preview.current = element;
    if (!element) return;
    const observer = new ResizeObserver(() => setDocumentHeight(element.offsetHeight));
    observer.observe(element);
    return () => { observer.disconnect(); preview.current = null; };
  }, []);
  const anchorRow = useRef<HTMLButtonElement>(null);

  const toggle = (id: string, range: boolean) => {
    setSelected(current => toggleShareSelection(candidates, current, id, range ? rangeFrom : null));
    setRangeFrom(id);
  };
  const loadEarlier = async () => {
    const signal = lifetime();
    if (loading) return;
    setLoading(true);
    try {
      historyWindow.expand(snapshot.records.index({ scope: "timeline" }));
      const read = await readConversation(snapshot, historyWindow, signal);
      signal.throwIfAborted();
      const timeline = conversationTimeline(read.projection, false);
      const loaded = shareMessages([...timeline.items, ...timeline.tail]);
      setCandidates(current => prependEarlierShareMessages(loaded, current));
      setEarlier(read.earlier);
    } catch (error) {
      if (!signal.aborted) { console.error("Share history could not be loaded.", error); toast.error(i18n.text(messages.earlierFailed)); }
    } finally { if (!signal.aborted) setLoading(false); }
  };
  const run = async (action: Action) => {
    const signal = lifetime();
    if (!idle || !chosen.length) return;
    setBusy(action);
    try {
      if (action === "copyImage" || action === "saveImage") {
        if (!preview.current) return;
        const blob = await shareImage(preview.current, signal);
        if (action === "copyImage") await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        else if (!await application.files.save("asterism-excerpt.png", bytes(blob, signal))) return;
      } else {
        const markdown = shareMarkdown(chosen, label);
        if (action === "copyMarkdown") await navigator.clipboard.writeText(markdown);
        else if (!await application.files.save("asterism-excerpt.md", bytes(new Blob([markdown], { type: "text/markdown;charset=utf-8" }), signal))) return;
      }
      if (!signal.aborted) toast.success(i18n.text(action.startsWith("copy") ? messages.copied : messages.saved));
    } catch (error) {
      if (!signal.aborted) {
        console.error("Share export failed.", error);
        toast.error(i18n.text(error instanceof ShareImageSizeError ? messages.tooLarge : messages.failed));
      }
    } finally { if (!signal.aborted) setBusy(null); }
  };
  const icon = (action: Action, Icon: typeof Copy) => busy === action ? <Spinner data-icon="inline-start" /> : <Icon data-icon="inline-start" />;

  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent aria-describedby={undefined}
      onOpenAutoFocus={event => {
        // Start at the message sharing was opened from; its turn is the initial selection.
        const row = anchorRow.current;
        if (!row) return;
        event.preventDefault();
        row.focus({ preventScroll: true });
        row.scrollIntoView({ block: "center" });
      }}
      onCloseAutoFocus={event => { event.preventDefault(); if (origin.isConnected) origin.focus(); }}
      className="nodrag nopan nokey flex h-[min(840px,calc(100dvh-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(1240px,calc(100vw-2rem))]">
      <DialogHeader className="shrink-0 px-5 py-3.5 pr-12"><DialogTitle className="type-section">{i18n.text(messages.share)}</DialogTitle></DialogHeader>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(240px,320px)_minmax(0,1fr)] max-sm:grid-cols-[180px_minmax(0,1fr)]">
        <section aria-label={i18n.text(messages.messages)} className="flex min-h-0 min-w-0 flex-col">
          <div className="flex h-11 shrink-0 items-center gap-1 px-3">
            <span className="type-label min-w-0 flex-1 truncate tabular-nums" aria-live="polite">
              {i18n.formatMessage(messages.selected, { count: chosen.length, total: candidates.length })}</span>
            <Button variant="ghost" size="xs" disabled={!idle || chosen.length === candidates.length}
              onClick={() => setSelected(new Set(candidates.map(message => message.id)))}>{i18n.text(messages.selectAll)}</Button>
            <Button variant="ghost" size="xs" disabled={!idle || !chosen.length}
              onClick={() => setSelected(new Set())}>{i18n.text(messages.clearSelection)}</Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
            {earlier && <Button variant="ghost" size="sm" className="mb-2 w-full text-muted-foreground" disabled={loading || !idle}
              onClick={() => { void loadEarlier(); }}>{loading && <Spinner data-icon="inline-start" />}{i18n.text(conversationMessages.earlierMessages)}</Button>}
            {groups.map((group, index) => <div key={group[0]!.id} role="group" className={cn("flex flex-col gap-0.5", index > 0 && "mt-3")}>
              {group.map(message => <SelectionRow key={message.id} ref={message.id === anchor ? anchorRow : undefined}
                message={message} name={label(message)} checked={selected.has(message.id)} disabled={!idle}
                onToggle={range => toggle(message.id, range)} />)}
            </div>)}
          </div>
        </section>
        <section aria-label={i18n.text(messages.preview)} className="flex min-h-0 min-w-0 flex-col bg-muted/50">
          <div className="flex h-11 shrink-0 items-center justify-between gap-3 px-3">
            <ToggleGroup type="single" variant="segmented" value={String(width)} aria-label={i18n.text(messages.width)} disabled={!idle}
              onValueChange={value => { if (value) setWidth(Number(value)); }}>
              {widths.map(value => <ToggleGroupItem key={value} value={String(value)} className={segment}>{value}</ToggleGroupItem>)}
            </ToggleGroup>
            {chosen.length > 0 && (scale === null
              ? <StatusText tone="warning">{i18n.text(messages.tooLarge)}</StatusText>
              : <span className="type-caption tabular-nums">{i18n.formatMessage(messages.size,
                { width: Math.floor(width * scale), height: Math.floor(documentHeight * scale) })}</span>)}
          </div>
          <div tabIndex={0} role="region" aria-label={i18n.text(messages.preview)}
            className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain p-6 outline-offset-[-2px]">
            <div ref={frameRef} className="w-full">
              {chosen.length > 0
                ? <div className="mx-auto overflow-hidden rounded-lg shadow-sm ring-1 ring-border" style={{ width: width * zoom, height: documentHeight * zoom || undefined }}>
                  <div style={{ width, transform: `scale(${zoom})`, transformOrigin: "top left" }}>
                    <ShareDocument ref={documentRef} width={width} title={agentName} messages={chosen} label={label} />
                  </div>
                </div>
                : <Empty className="py-24"><EmptyHeader><EmptyMedia variant="icon"><FileText /></EmptyMedia>
                  <EmptyTitle>{i18n.text(messages.selectMessages)}</EmptyTitle></EmptyHeader></Empty>}
            </div>
          </div>
        </section>
      </div>
      <DialogFooter className="shrink-0 items-center px-5 py-3 sm:justify-between">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" disabled={!chosen.length || !idle}>
              {busy === "copyMarkdown" || busy === "saveMarkdown" ? <Spinner data-icon="inline-start" /> : <FileText data-icon="inline-start" />}
              {i18n.text(messages.markdown)}<ChevronDown className="text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="nodrag nopan nokey">
            <DropdownMenuGroup>
              <DropdownMenuItem onSelect={() => { void run("copyMarkdown"); }}><Copy />{i18n.text(messages.copyMarkdown)}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => { void run("saveMarkdown"); }}><Download />{i18n.text(messages.saveMarkdown)}</DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="flex gap-2">
          <Button variant="outline" disabled={!chosen.length || !idle || scale === null} onClick={() => { void run("saveImage"); }}>
            {icon("saveImage", Download)}{i18n.text(messages.saveImage)}</Button>
          <Button disabled={!chosen.length || !idle || scale === null} onClick={() => { void run("copyImage"); }}>
            {icon("copyImage", Copy)}{i18n.text(messages.copyImage)}</Button>
        </div>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}

/** A row toggles its message; Shift extends the previous toggle's state across the range. */
function SelectionRow({ ref, message, name, checked, disabled, onToggle }: {
  ref?: Ref<HTMLButtonElement>; message: ShareMessage; name: string; checked: boolean; disabled: boolean;
  onToggle(range: boolean): void;
}) {
  const i18n = useI18n();
  const Icon = senderIcon(message.sender);
  const summary = message.markdown.replace(/\s+/gu, " ").trim() || message.attachments.join(", ");
  const time = message.createdAt ? new Date(message.createdAt) : null;
  return <button ref={ref} type="button" role="checkbox" aria-checked={checked} disabled={disabled}
    onClick={event => onToggle(event.shiftKey)}
    className={cn("group/row flex w-full min-w-0 items-start gap-2.5 rounded-md px-2 py-2 text-left outline-none transition-colors select-none",
      "hover:bg-accent/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60", checked && "bg-accent/40")}>
    <span aria-hidden="true" className={cn("mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input transition-colors",
      checked && "border-primary bg-primary text-primary-foreground")}>{checked && <Check className="size-3" />}</span>
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="type-label flex min-w-0 items-center gap-1.5">
        <Icon className="size-3 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">{name}</span>
        {time && <time dateTime={message.createdAt!} className="shrink-0 font-normal tabular-nums">
          {i18n.formatDate(time.getTime(), messageTimeOptions(time, new Date()))}</time>}
      </span>
      <span className={cn("line-clamp-2 text-xs leading-relaxed [overflow-wrap:anywhere]", checked ? "text-foreground" : "text-muted-foreground")}>{summary}</span>
    </span>
  </button>;
}

/** The captured surface. Its own px sizes and light tokens keep the image independent of the dialog's scale and color scheme. */
function ShareDocument({ ref, width, title, messages, label }: {
  ref: (element: HTMLDivElement | null) => void; width: number; title: string; messages: readonly ShareMessage[]; label(message: ShareMessage): string;
}) {
  const i18n = useI18n();
  const first = messages.find(message => message.createdAt)?.createdAt;
  return <div ref={ref} className="share-document" style={{ width }}>
    <div className="share-card">
      <header className="share-header">
        <span className="share-title">{title}</span>
        {first && <time className="share-date" dateTime={first}>{i18n.formatDate(Date.parse(first), { dateStyle: "long" })}</time>}
      </header>
      <div className="share-turns">{shareTurnGroups(messages).map(turn => <section key={turn[0]!.id} className="share-turn">
        {turn.map(message => <ShareDocumentMessage key={message.id} message={message} name={label(message)} />)}
      </section>)}</div>
    </div>
    <footer className="share-footer"><a href={siteUrl} target="_blank" rel="noopener noreferrer">
      <BrandMark />Asterism<span className="share-footer-url">· {siteUrl.replace(/^https:\/\//u, "")}</span>
    </a></footer>
  </div>;
}

function ShareDocumentMessage({ message, name }: { message: ShareMessage; name: string }) {
  const kind = message.sender?.kind ?? "reply";
  const Icon = senderIcon(message.sender);
  const body = message.markdown.trim() && <Markdown document>{message.markdown}</Markdown>;
  return <article className="share-message" data-kind={kind}>
    {(kind === "agent" || kind === "event") && <p className="share-sender"><Icon aria-hidden="true" />{name}</p>}
    {message.attachments.length > 0 && <div className="share-attachments">
      {message.attachments.map((file, index) => <span key={index} className="share-attachment"><Paperclip aria-hidden="true" />{file}</span>)}
    </div>}
    {body && (kind === "reply" ? body : <div className="share-bubble">{body}</div>)}
  </article>;
}

function senderIcon(sender: AgentMessageSender | null) {
  return messageAppearance[sender?.kind ?? "agent"].Icon;
}

/** Content-box width of an element, tracked through resizes. */
function useLayoutWidth(): [number, (element: HTMLDivElement | null) => (() => void) | undefined] {
  const [width, setWidth] = useState(0);
  const ref = useCallback((element: HTMLDivElement | null) => {
    if (!element) return;
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [width, ref];
}

async function* bytes(blob: Blob, signal: AbortSignal) {
  for await (const chunk of blob.stream()) { signal.throwIfAborted(); yield chunk; }
}
