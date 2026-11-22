import { StatusBadge, StatusIcon } from "@asterism-app/ui/ui/status";
import { ArrowDown, ChevronsUp, MessageSquare, RotateCw } from "lucide-react";
import { Empty, EmptyHeader, EmptyMedia, EmptyDescription } from "@asterism-app/ui/ui/empty";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Button } from "@asterism-app/ui/ui/button";
import { ScrollArea } from "@asterism-app/ui/ui/scroll-area";
import { VirtualConversationTimeline } from "./ConversationTimeline";
import { ConversationSharing } from "./ConversationSharing";
import { ConversationNavigation, type ConversationNavigationHandle } from "./ConversationNavigation";
import { ConversationSeam } from "./ConversationSeam";
import { IconSwap } from "./IconSwap";

import { ComposerTray, MessageComposer } from "./Composer";
import type { ComposerEditorHandle } from "./composer-editor";
import { conversationMessages } from "../../messages/conversation";
import { useI18n, useRendererObject, useRendererModels } from "@asterism-app/sdk/renderer";

import { useOutputFollow } from "./output-follow";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { useConversationHistory } from "./use-conversation-history";
import { ConversationHistoryWindow } from "./history-window";
import { commonMessages } from "@asterism-app/ui/messages/common";
import { TimelineViewState } from "./view-state";

import { useConversationInteraction } from "./interaction";
import { AgentToolbar, AgentUIRegion, useComposerHidden } from "../ui/AgentUI";
import { AgentDraftsPanel } from "./Drafts";
import type { AgentExecutionState } from "../state";
import type { AgentActivity, CompressionActivity, InlineFeedback } from "../feedback";
import { useConversationProcesses } from "./use-conversation-processes";
import { useTimelinePresence } from "./timeline-presence";
import { conversationTransition, immediateTransition } from "./motion";
import { formatElapsedTime } from "./elapsed-time";

/** Execution status in the card title bar; history belongs to the session and is accessed from the window title bar. */
export function ConversationActions({ data }: { data: { executionState: AgentExecutionState } }) {
  const i18n = useI18n();
  const object = useRendererObject();
  const snapshot = object.session.snapshot();
  const agentRunning = data.executionState === "running";
  if (!snapshot) return null;
  return <StatusBadge tone={agentRunning ? "progress" : "neutral"} role="status">
    {agentRunning ? i18n.formatMessage(conversationMessages.working) : i18n.formatMessage(conversationMessages.ready)}
  </StatusBadge>;
}

/** Item view state is retained with the agent object: virtualized item recycling, card remounts, and focus switches preserve expansion state. */
const viewStateKey = "asterism.builtin/agent.timeline-view";

/** Agent card content: the final view of the current path and the input area; branches are not exposed here, and rewinding takes place in session history. */
export function Conversation({ feedback, compressions, activity = null, executionStartedAt }: {
  feedback: readonly InlineFeedback[]; compressions: readonly CompressionActivity[];
  activity?: AgentActivity | null; executionStartedAt: number | null;
}) {
  const i18n = useI18n();
  const object = useRendererObject();
  const { view: state, session } = object;
  const interaction = useConversationInteraction();
  const { executionState } = interaction;
  const models = useRendererModels();
  const { ready } = state;
  const agentId = object.ref.id;
  const snapshot = session.snapshot();
  const { viewState, historyWindow } = object.retained.get(viewStateKey, () => ({
    viewState: new TimelineViewState(), historyWindow: new ConversationHistoryWindow(agentId),
  }));
  const running = executionState === "running";
  const { read, items, loadEarlier } = useConversationHistory(snapshot, historyWindow, models.blocks, running, feedback, compressions);
  const { timeline: target, processOwners, toggle } = useConversationProcesses(items, viewState, running);
  const reducedMotion = useReducedMotion() === true;
  const presence = useTimelinePresence(target, processOwners, reducedMotion);
  const timeline = presence.items;
  const header = useRef<HTMLDivElement>(null);
  const [startMargin, setStartMargin] = useState(0);
  const hasSnapshot = snapshot !== null;
  useLayoutEffect(() => {
    const element = header.current;
    if (!element) return;
    const measure = () => setStartMargin(element.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasSnapshot]);
  const { area, scroll, list, awayFromBottom, latest, jumpTo, preserveItem, preserveReadingPosition, onProcessMount, onScroll, onResize, onScrollEnd } =
    useOutputFollow(timeline, processOwners, presence.skipEntrances, startMargin);
  const navigation = useRef<ConversationNavigationHandle>(null);
  const composer = useRef<ComposerEditorHandle>(null);
  const composerHidden = useComposerHidden();

  if (!snapshot) return null;
  const send = async () => {
    if (composerHidden) return;
    if (!await interaction.send()) return;
    latest(); composer.current?.focus();
  };
  const resume = async () => {
    if (composerHidden) return;
    await interaction.resume(); latest();
  };

  return <ConversationSharing items={items} historyWindow={historyWindow} earlier={read.data?.earlier ?? false}>
    <AgentUIRegion position="top" />
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <ConversationNavigation ref={navigation} timeline={timeline} scroll={scroll} list={list} startMargin={startMargin} onSelect={jumpTo} />
      {/* Virtua owns anchoring. Overlay scrollbars keep width stable without a native scrollbar gutter. */}
      <ScrollArea ref={area} viewportRef={scroll} className="min-h-0 min-w-0 flex-1"
        viewportClassName="scroll-pt-4 select-text overscroll-contain [overflow-anchor:none]"
        viewportProps={{ onScroll: event => { onScroll(event); navigation.current?.update(); } }}>
        <div ref={header}>
          {read.data?.earlier && <div className="px-4 pt-2"><ConversationSeam disabled={read.status === "loading"}
            onClick={() => { preserveReadingPosition(); loadEarlier(); }}>
            <IconSwap swapKey={read.status}>{read.status === "loading"
              ? <StatusIcon tone="progress" className="size-3.5 text-current" /> : <ChevronsUp className="size-3.5" />}</IconSwap>
            <span className="truncate">{i18n.text(read.status === "loading" ? commonMessages.loading : conversationMessages.earlierMessages)}</span>
          </ConversationSeam></div>}
          {read.status === "loading" && !read.data && <p className="type-caption p-4" role="status">{i18n.text(commonMessages.loading)}</p>}
          {read.status === "error" && <div className="px-4 pt-2"><ConversationSeam onClick={read.retry}>
            <StatusIcon tone="warning" className="size-3.5" />
            <span className="truncate">{i18n.text(conversationMessages.historyReadFailed)}</span>
            <span className="inline-flex shrink-0 items-center gap-1 text-foreground"><RotateCw aria-hidden="true" className="size-3" />{i18n.text(commonMessages.retry)}</span>
          </ConversationSeam></div>}
        </div>
        <VirtualConversationTimeline ref={list} items={timeline} viewState={viewState} scrollRef={scroll} startMargin={startMargin}
          target={target} presence={presence} reducedMotion={reducedMotion}
          onResize={() => { onResize(); navigation.current?.update(); }} onScrollEnd={onScrollEnd} onProcessMount={onProcessMount}
          onToggleProcess={id => { preserveItem(id); toggle(id); }} />
        <div className="px-4 pb-4">
          {running && <ExecutionStatus activity={activity} compressing={compressions.some(item => item.status === "running")}
            startedAt={executionStartedAt} />}
        </div>
      </ScrollArea>
      {read.status === "ready" && !timeline.length && !running && <Empty className="pointer-events-none absolute inset-0 p-6">
        <EmptyHeader>
          <EmptyMedia variant="icon"><MessageSquare /></EmptyMedia>
          <EmptyDescription className="text-xs">{i18n.formatMessage(conversationMessages.emptyHint)}</EmptyDescription>
        </EmptyHeader>
      </Empty>}
      {/* Output fades as it passes under the floating input tray. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-5 bg-linear-to-t from-card to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center">
        <AnimatePresence>
          {awayFromBottom && <motion.div className="surface-floating pointer-events-auto"
            initial={reducedMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reducedMotion ? 0 : 8 }}
            transition={reducedMotion ? immediateTransition : conversationTransition}>
            <Button variant="ghost" size="sm" onClick={latest}><ArrowDown />{i18n.formatMessage(conversationMessages.latestOutput)}</Button>
          </motion.div>}
        </AnimatePresence>
      </div>
    </div>
    <AgentUIRegion position="bottom" />
    {!composerHidden && <footer className="shrink-0 px-2 pt-1 pb-2">
      <ComposerTray running={running}>
        <AgentDraftsPanel onTake={() => composer.current?.focus()} />
        <MessageComposer draft={interaction.draft} inputRef={composer}
          ready={ready} executionState={executionState} writable={interaction.writable} onSend={send}
          onSave={() => interaction.save()} onCancel={interaction.cancel} onContinue={resume} />
        <AgentToolbar className="px-0.5 pt-1" />
      </ComposerTray>
    </footer>}
  </ConversationSharing>;
}

/** Elapsed time spans requests, compaction, and retry waits; clock updates stay within this status row. */
function ExecutionStatus({ activity, compressing, startedAt }: { activity: AgentActivity | null; compressing: boolean; startedAt: number | null }) {
  const i18n = useI18n();
  const [now, setNow] = useState(Date.now);
  const resumeAt = activity?.resumeAt ?? null;
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), resumeAt === null ? 1000 : 250);
    return () => clearInterval(timer);
  }, [resumeAt, startedAt]);
  const duration = formatElapsedTime(startedAt, now);
  const label = compressing ? i18n.text(conversationMessages.compressing) : !activity ? i18n.formatMessage(conversationMessages.workingHint)
    : resumeAt !== null
      ? i18n.formatMessage(conversationMessages.retryWaiting, { attempt: activity.attempt, max: activity.max, seconds: Math.max(0, Math.ceil((resumeAt - now) / 1000)) })
      : i18n.formatMessage(conversationMessages.retrying, { attempt: activity.attempt, max: activity.max });
  return <p className="type-caption flex items-center gap-2 pt-4">
    <span role="status" className="flex items-center gap-2"><StatusIcon tone="progress" className="size-3" />{label}</span>
    {duration && <span role="timer" aria-live="off" aria-label={i18n.formatMessage(conversationMessages.elapsed, { duration })}
      className="shrink-0 tabular-nums">{duration}</span>}
  </p>;
}
