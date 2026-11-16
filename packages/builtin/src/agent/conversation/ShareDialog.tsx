import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n, useRendererApplication, type RendererSessionSnapshot } from "@asterism-app/sdk/renderer";
import { Copy, Download, FileText, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { Markdown } from "@asterism-app/ui/markdown";
import { Button } from "@asterism-app/ui/ui/button";
import { Checkbox } from "@asterism-app/ui/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@asterism-app/ui/ui/dialog";
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@asterism-app/ui/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@asterism-app/ui/ui/select";
import { Empty, EmptyHeader, EmptyTitle, EmptyMedia } from "@asterism-app/ui/ui/empty";
import { Spinner } from "@asterism-app/ui/ui/spinner";
import { shareMessages as messages } from "../../messages/share";
import { conversationMessages } from "../../messages/conversation";
import { commonMessages } from "../../messages/common";
import { messageSenderLabel } from "../message-presentation";
import { initialShareSelection, shareMessages, shareMarkdown, type ShareMessage } from "./share-content";
import { readConversation } from "./read-history";
import { conversationTimeline } from "./timeline";
import type { ConversationHistoryWindow } from "./history-window";
import { shareImage, ShareImageSizeError } from "./share-image";
import "./share.css";

export interface ShareDialogProps {
  snapshot: RendererSessionSnapshot;
  agentId: string;
  messages: ShareMessage[];
  anchor: string;
  historyWindow: ConversationHistoryWindow;
  earlier: boolean;
  origin: HTMLElement;
  onClose(): void;
}

export default function ShareDialog({ snapshot, agentId, messages: initial, anchor, historyWindow, earlier: initialEarlier, origin, onClose }: ShareDialogProps) {
  const i18n = useI18n();
  const application = useRendererApplication();
  const [candidates, setCandidates] = useState(initial);
  const [selected, setSelected] = useState(() => initialShareSelection(initial, anchor));
  const [width, setWidth] = useState("960");
  const [earlier, setEarlier] = useState(initialEarlier);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const preview = useRef<HTMLDivElement>(null);
  const anchorRef = useCallback((element: HTMLDivElement | null) => { element?.scrollIntoView({ block: "nearest" }); }, []);
  const lifetime = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    return () => controller.abort();
  }, []);
  const chosen = candidates.filter(message => selected.has(message.id));
  const label = (message: ShareMessage) => i18n.text(message.sender ? messageSenderLabel(message.sender) : commonMessages.agent);
  const loadEarlier = async () => {
    const signal = lifetime.current?.signal;
    if (loading || !signal) return;
    setLoading(true);
    try {
      historyWindow.expand(snapshot.records.index({ scope: "timeline" }));
      const read = await readConversation(snapshot, agentId, historyWindow, signal);
      signal.throwIfAborted();
      const timeline = conversationTimeline(read.projection, false);
      const loaded = shareMessages([...timeline.items, ...(timeline.tail ? [timeline.tail] : [])]);
      // Keep already-previewed messages byte-for-byte, including a partially visible first turn.
      const previous = new Map(candidates.map(message => [message.id, message]));
      const merged = loaded.map(message => previous.get(message.id) ?? message);
      const ids = new Set(merged.map(message => message.id));
      setCandidates([...merged, ...candidates.filter(message => !ids.has(message.id))]);
      setEarlier(read.earlier);
    } catch (error) {
      if (!signal.aborted) { console.error("Share history could not be loaded.", error); toast.error(i18n.text(messages.earlierFailed)); }
    } finally { if (!signal.aborted) setLoading(false); }
  };
  const run = async (action: "copyImage" | "saveImage" | "copyMarkdown" | "saveMarkdown") => {
    const signal = lifetime.current?.signal;
    if (busy || !signal || !chosen.length || !preview.current) return;
    setBusy(action);
    try {
      if (action === "copyImage" || action === "saveImage") {
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
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent aria-describedby={undefined} onCloseAutoFocus={event => { event.preventDefault(); if (origin.isConnected) origin.focus(); }}
      className="nodrag nopan nokey flex h-[min(860px,calc(100dvh-2rem))] min-h-0 flex-col overflow-hidden sm:max-w-[min(1360px,calc(100vw-2rem))]">
      <DialogHeader className="shrink-0 pr-6"><DialogTitle>{i18n.text(messages.share)}</DialogTitle></DialogHeader>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(180px,240px)_minmax(0,1fr)] gap-4 max-sm:grid-cols-[140px_minmax(0,1fr)]">
        <fieldset disabled={busy !== null} className="flex min-h-0 min-w-0 flex-col gap-3">
          <FieldSet className="min-h-0 flex-1 gap-2">
            <FieldLegend variant="label">{i18n.text(messages.messages)}</FieldLegend>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-2">
              <FieldGroup className="gap-2">
                {earlier && <Button variant="outline" size="sm" disabled={loading} onClick={() => { void loadEarlier(); }}>
                  {loading && <Spinner />}{i18n.text(conversationMessages.earlierMessages)}</Button>}
                {candidates.map(message => <Field key={message.id} ref={message.id === anchor ? anchorRef : undefined} orientation="horizontal" className="rounded-md border p-2">
                  <Checkbox id={`share-${message.id}`} checked={selected.has(message.id)} onCheckedChange={checked => setSelected(current => {
                    const next = new Set(current);
                    if (checked) next.add(message.id); else next.delete(message.id);
                    return next;
                  })} />
                  <FieldLabel htmlFor={`share-${message.id}`} className="min-w-0 flex-col items-start gap-1">
                    <span className="type-label">{label(message)}</span>
                    <span className="line-clamp-2 break-words text-xs font-normal">{message.markdown || message.attachments.join(", ")}</span>
                  </FieldLabel>
                </Field>)}
              </FieldGroup>
            </div>
          </FieldSet>
          <p className="type-caption" aria-live="polite">{i18n.formatMessage(messages.selected, { count: chosen.length })}</p>
        </fieldset>
        <div className="flex min-h-0 min-w-0 flex-col gap-3">
          <Field orientation="horizontal" className="shrink-0">
            <FieldLabel htmlFor="share-width">{i18n.text(messages.width)}</FieldLabel>
            <Select value={width} onValueChange={setWidth} disabled={busy !== null}>
              <SelectTrigger id="share-width" size="sm"><SelectValue /></SelectTrigger>
              <SelectContent><SelectGroup>{[720, 960, 1200].map(width => <SelectItem key={width} value={String(width)}>{width} px</SelectItem>)}</SelectGroup></SelectContent>
            </Select>
          </Field>
          <div role="region" aria-label={i18n.text(messages.preview)} tabIndex={0}
            className="min-h-0 flex-1 overflow-auto overscroll-contain rounded-md border bg-muted p-4">
            {chosen.length > 0 ? <div ref={preview} className="conversation-share-document" style={{ width: Number(width) }}>
              <div className="conversation-share-messages">{chosen.map(message => <article key={message.id} className="conversation-share-message" data-user={message.sender?.kind === "user" || undefined}>
                <p className="conversation-share-sender">{label(message)}</p>
                {message.markdown && <Markdown document>{message.markdown}</Markdown>}
                {message.attachments.map((name, index) => <p key={index} className="conversation-share-attachment"><Paperclip aria-hidden="true" />{name}</p>)}
              </article>)}</div>
              <footer className="conversation-share-brand">Asterism</footer>
            </div> : <Empty><EmptyHeader><EmptyMedia variant="icon"><FileText /></EmptyMedia><EmptyTitle>{i18n.text(messages.selectMessages)}</EmptyTitle></EmptyHeader></Empty>}
          </div>
        </div>
      </div>
      <DialogFooter className="shrink-0 flex-wrap">
        {(["copyMarkdown", "saveMarkdown", "copyImage", "saveImage"] as const).map(action => <Button key={action}
          variant={action === "saveImage" ? "default" : "outline"} disabled={!chosen.length || busy !== null}
          onClick={() => { void run(action); }}>
          {busy === action ? <Spinner /> : action.startsWith("copy") ? <Copy /> : <Download />}{i18n.text(messages[action])}
        </Button>)}
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}

async function* bytes(blob: Blob, signal: AbortSignal) {
  for await (const chunk of blob.stream()) { signal.throwIfAborted(); yield chunk; }
}
