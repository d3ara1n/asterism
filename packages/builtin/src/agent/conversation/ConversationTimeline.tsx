import { RendererViewStateProvider, useI18n, useRendererObject, useRendererViewState, type RendererViewStateEntry } from "@asterism/sdk/renderer";
import { TriangleAlert, Info } from "lucide-react";
import { memo, useLayoutEffect, useMemo, useState, type ReactNode, type Ref, type RefObject } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Virtualizer, type VirtualizerHandle } from "virtua";

import { Alert, AlertDescription } from "@asterism/ui/ui/alert";
import { Badge } from "@asterism/ui/ui/badge";
import { conversationMessages } from "../../messages/conversation";
import { Markdown } from "./Markdown";
import { ThinkingBlock } from "./ThinkingBlock";
import { generating, mountedTimelineIndexes, timelineKey, type TimelineItem } from "./timeline";
import { ToolCall } from "./ToolCall";
import { FilePreview } from "./Files";
import { Disclosure } from "./Disclosure";
import { TurnFooter } from "./TurnFooter";
import { MessageSender } from "./MessageSender";
import { TimelineViewState, viewStateKeys } from "./view-state";
import { ExecutionErrorDetails } from "../ErrorDetails";
import { TurnProcess } from "./TurnProcess";
import { CompressionMarker } from "./CompressionMarker";
import type { useTimelinePresence } from "./timeline-presence";
import { conversationTransition, immediateTransition } from "./motion";

/** Item view state survives remounts when supplied by the caller; otherwise it lives with this component. */
export function ConversationTimeline({ items, viewState }: { items: readonly TimelineItem[]; viewState?: TimelineViewState }) {
  const [local] = useState(() => new TimelineViewState());
  const store = viewState ?? local;
  return <>{items.map(node => {
    const key = timelineKey(node);
    return <NodeView key={key} node={node} entry={store.entry(key)} />;
  })}</>;
}

/**
 * Virtualized timeline: mounts only items near the viewport, so DOM size does not grow with conversation length.
 * Items unmount and remount during scrolling, restoring per-item view state through viewState; live blocks and the last item stay mounted.
 * Item spacing comes from each item's own top padding; absolutely positioned items cannot rely on sibling selectors.
 */
export function VirtualConversationTimeline({ items, target, presence, reducedMotion, viewState, scrollRef, ref, onResize, onScrollEnd, onToggleProcess, onProcessMount }: {
  items: readonly TimelineItem[]; viewState: TimelineViewState; scrollRef: RefObject<HTMLElement | null>;
  target: readonly TimelineItem[]; presence: ReturnType<typeof useTimelinePresence>; reducedMotion: boolean;
  ref?: Ref<VirtualizerHandle>; onResize?: () => void; onScrollEnd?: () => void;
  onToggleProcess(id: string): void;
  onProcessMount(id: string, button: HTMLButtonElement): void;
}) {
  const present = useMemo(() => new Set(target.map(timelineKey)), [target]);
  const keepMounted = useMemo(() => [...new Set([...mountedTimelineIndexes(items),
    ...items.flatMap((item, index) => present.has(timelineKey(item)) ? [] : [index])])].sort((a, b) => a - b), [items, present]);
  return <Virtualizer ref={ref} data={items} scrollRef={scrollRef} keepMounted={keepMounted} onResize={onResize} onScrollEnd={onScrollEnd}>
    {node => {
      const key = timelineKey(node);
      return <TimelinePresenceItem key={key} itemKey={key} present={present.has(key)} enter={presence.entering.has(key)}
        overlayExit={node.kind === "compression"}
        reducedMotion={reducedMotion} onMount={presence.onMount} onExitComplete={presence.onExitComplete}>{node.kind === "turn-process"
        ? <TurnProcess node={node} onToggle={() => onToggleProcess(node.id)} onMount={onProcessMount} />
        : <NodeView node={node} entry={viewState.entry(key)} />}</TimelinePresenceItem>;
    }}
  </Virtualizer>;
}

function TimelinePresenceItem({ itemKey, present, enter, overlayExit, reducedMotion, onMount, onExitComplete, children }: {
  itemKey: string; present: boolean; enter: boolean; overlayExit: boolean; reducedMotion: boolean; children: ReactNode;
  onMount(key: string): () => void; onExitComplete(key: string): void;
}) {
  const [animateEntrance] = useState(enter);
  useLayoutEffect(() => onMount(itemKey), [itemKey, onMount]);
  return <div className="relative" inert={!present} aria-hidden={!present || undefined}>
    <AnimatePresence initial={animateEntrance} mode={overlayExit ? "popLayout" : "sync"} onExitComplete={() => onExitComplete(itemKey)}>
      {present && <motion.div key={itemKey} className="px-4 pt-4"
        initial={reducedMotion ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: reducedMotion ? 1 : 0, y: reducedMotion ? 0 : 6 }}
        transition={reducedMotion ? immediateTransition : conversationTransition}>
        {children}
      </motion.div>}
    </AnimatePresence>
  </div>;
}

/** Timeline items are projected from snapshots with stable identities; outer rerenders such as canvas dragging do not recompute existing items. */
const NodeView = memo(function NodeView({ node, entry }: { node: TimelineItem; entry: RendererViewStateEntry }) {
  return <RendererViewStateProvider value={entry}><NodeContent node={node} /></RendererViewStateProvider>;
});

function NodeContent({ node }: { node: TimelineItem }) {
  const i18n = useI18n();
  const object = useRendererObject();
  const incomplete = "complete" in node && !node.complete;
  const streaming = generating(node);
  const tag = incomplete ? <Badge variant="outline">{i18n.formatMessage(conversationMessages.incomplete)}</Badge> : null;
  switch (node.kind) {
    case "message": return <article data-conversation-message={node.id}
      className={`min-w-0 max-w-[92%] space-y-2 ${node.sender.kind === "agent" ? "mr-auto" : "ml-auto"}`}>
      <MessageSender sender={node.sender} />
      <div className={`space-y-2 rounded-md px-3 py-2 ${node.sender.kind === "agent"
        ? "bg-external-message text-external-message-foreground" : "bg-muted text-foreground"}`}>{node.parts.map((part, index) =>
        part.kind === "text" ? <Markdown key={index}>{part.text}</Markdown>
          : <FilePreview key={index} part={part} content={object.content} />)}</div></article>;
    case "text": return <article className="space-y-1">{tag}<Markdown streaming={streaming}>{node.text}</Markdown></article>;
    case "thinking": return node.text.trim() ? <ThinkingBlock node={node} /> : null;
    case "toolcall": return <ToolCall node={node} />;
    case "summary": return <Summary text={node.text} />;
    case "compression": return <CompressionMarker node={node} />;
    case "turn-metrics": return <TurnFooter metrics={node.metrics} incomplete={node.incomplete} replyMarkdown={node.replyMarkdown} />;
    case "notice": return <Alert variant={node.level === "error" ? "destructive" : "default"}>
      {node.level === "error" ? <TriangleAlert /> : <Info />}<AlertDescription>
        <p className="whitespace-pre-wrap break-words">{node.message}</p>
        {node.details && <ExecutionErrorDetails code={node.code} details={node.details} />}
      </AlertDescription></Alert>;
    default: return null;
  }
}
function Summary({ text }: { text: string }) {
  const [open, setOpen] = useRendererViewState(viewStateKeys.disclosure, false);
  const i18n = useI18n();
  return <Disclosure open={open} onOpenChange={setOpen} header={<><Info className="size-3.5" />
    <span className="min-w-0 flex-1 text-left">{i18n.formatMessage(conversationMessages.contextSummary)}</span></>}>
    <Markdown>{text}</Markdown>
  </Disclosure>;
}
