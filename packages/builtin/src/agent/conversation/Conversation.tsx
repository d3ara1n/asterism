import { StatusBadge, StatusIcon } from "@asterism-app/ui/ui/status";
import { ArrowDown, MessageSquare } from "lucide-react";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@asterism-app/ui/ui/empty";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Button } from "@asterism-app/ui/ui/button";
import { VirtualConversationTimeline } from "./ConversationTimeline";
import { ConversationNavigation, type ConversationNavigationHandle } from "./ConversationNavigation";

import { MessageComposer } from "./Composer";
import type { ComposerEditorHandle } from "./composer-editor";
import { conversationMessages } from "../../messages/conversation";
import { useI18n, useRendererObject, useRendererModels } from "@asterism-app/sdk/renderer";

import { useOutputFollow } from "./output-follow";
import { useEffect, useRef, useState } from "react";

import { useConversationHistory } from "./use-conversation-history";
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
export function Conversation({ feedback, compressions, activity = null }: {
  feedback: readonly InlineFeedback[]; compressions: readonly CompressionActivity[]; activity?: AgentActivity | null;
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
  const viewState = object.retained.get(viewStateKey, () => new TimelineViewState());
  const running = executionState === "running";
  const { read, items, loadEarlier } = useConversationHistory(snapshot, agentId, viewState.historyWindow, models.blocks, running, feedback, compressions);
  const { timeline: target, processOwners, toggle } = useConversationProcesses(items, viewState, running);
  const reducedMotion = useReducedMotion() === true;
  const presence = useTimelinePresence(target, processOwners, reducedMotion);
  const timeline = presence.items;
  const { scroll, list, awayFromBottom, latest, jumpTo, preserveItem, onProcessMount, onScroll, onResize, onScrollEnd } =
    useOutputFollow(timeline, processOwners, presence.skipEntrances);
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

  return <>
    <AgentUIRegion position="top" />
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <ConversationNavigation ref={navigation} timeline={timeline} scroll={scroll} list={list} onSelect={jumpTo} />
      {/* The virtual list compensates for scroll position itself; disable browser scroll anchoring to prevent conflicts. */}
      <div ref={scroll} className="min-h-0 flex-1 scroll-pt-4 select-text overflow-y-auto overscroll-contain [overflow-anchor:none]"
        onScroll={event => { onScroll(event); navigation.current?.update(); }}>
        {read.data?.earlier && <div className="px-4 pt-3"><Button variant="ghost" size="sm" disabled={read.status === "loading"}
          onClick={loadEarlier}>
          {i18n.text(conversationMessages.earlierMessages)}</Button></div>}
        {read.status === "loading" && !read.data && <p className="type-caption p-4" role="status">{i18n.text(commonMessages.loading)}</p>}
        {read.status === "error" && <div className="p-4"><p className="type-caption">{i18n.text(conversationMessages.historyReadFailed)}</p>
          <Button variant="ghost" size="sm" onClick={read.retry}>{i18n.text(commonMessages.retry)}</Button></div>}
        <VirtualConversationTimeline ref={list} items={timeline} viewState={viewState} scrollRef={scroll}
          target={target} presence={presence} reducedMotion={reducedMotion}
          onResize={() => { onResize(); navigation.current?.update(); }} onScrollEnd={onScrollEnd} onProcessMount={onProcessMount}
          onToggleProcess={id => { preserveItem(id); toggle(id); }} />
        <div className="px-4 pb-4">
          {running && !timeline.some(item => item.kind === "compression" && item.status === "running") &&
            <ExecutionStatus activity={activity} />}
        </div>
      </div>
      {read.status === "ready" && !timeline.length && !running && <Empty className="pointer-events-none absolute inset-0 p-6">
        <EmptyHeader>
          <EmptyMedia variant="icon"><MessageSquare /></EmptyMedia>
          <EmptyTitle className="type-label">{i18n.formatMessage(conversationMessages.emptyHint)}</EmptyTitle>
        </EmptyHeader>
      </Empty>}
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
    {!composerHidden && <AgentDraftsPanel onTake={() => composer.current?.focus()} />}
    {!composerHidden && <footer className="shrink-0 space-y-1 border-t px-3 pt-1 pb-2">
      <AgentToolbar />
      <MessageComposer draft={interaction.draft} inputRef={composer}
        ready={ready} executionState={executionState} writable={interaction.writable} onSend={send}
        onSave={() => interaction.save()} onCancel={interaction.cancel} onContinue={resume} />
    </footer>}
  </>;
}

/** Retry countdown belongs to live activity; persisted notices never imply a scheduled action after restart. */
function ExecutionStatus({ activity }: { activity: AgentActivity | null }) {
  const i18n = useI18n();
  const [now, setNow] = useState(Date.now);
  const resumeAt = activity?.resumeAt ?? null;
  useEffect(() => {
    if (resumeAt === null) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [resumeAt]);
  const label = !activity ? i18n.formatMessage(conversationMessages.workingHint)
    : resumeAt !== null
      ? i18n.formatMessage(conversationMessages.retryWaiting, { attempt: activity.attempt, max: activity.max, seconds: Math.max(0, Math.ceil((resumeAt - now) / 1000)) })
      : i18n.formatMessage(conversationMessages.retrying, { attempt: activity.attempt, max: activity.max });
  return <p role="status" className="type-caption flex items-center gap-2 pt-4">
    <StatusIcon tone="progress" className="size-3" />{label}
  </p>;
}
