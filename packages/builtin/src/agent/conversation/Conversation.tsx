import { StatusBadge, StatusIcon } from "@atelier/ui/ui/status";
import { ArrowDown } from "lucide-react";
import { Button } from "@atelier/ui/ui/button";
import { VirtualConversationTimeline } from "./ConversationTimeline";
import { ConversationMinimap } from "./ConversationMinimap";

import { MessageComposer } from "./Composer";
import { conversationMessages } from "../../messages/conversation";
import { useI18n, useRendererObject, useRendererModels } from "@atelier/sdk/renderer";

import { useOutputFollow } from "./output-follow";
import { useMemo, useRef } from "react";

import { displayedTimeline, savedTimeline, withLive, type TimelineItem } from "./timeline";
import { TimelineViewState } from "./view-state";

import { useConversationInteraction } from "./interaction";
import { AgentToolbar, AgentUIRegion, useComposerHidden } from "../ui/AgentUI";
import { AgentDraftsPanel } from "./Drafts";
import type { AgentExecutionState } from "../state";
import type { CompressionActivity, InlineFeedback } from "../feedback";
import { useTurnProcesses } from "./use-turn-processes";
import { useReducedMotion } from "motion/react";
import { useTimelinePresence } from "./timeline-presence";

/** 卡片标题栏中的执行状态；历史属于会话，入口在窗口标题栏。 */
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

const emptyTimeline: readonly TimelineItem[] = [];
/** 条目视图状态随代理对象保留：虚拟列表回收条目、卡片重挂载与聚焦切换都不丢展开状态。 */
const viewStateKey = "atelier.builtin/agent.timeline-view";

/** 代理卡片内容：当前路径的最终视图与输入区；没有分支感，回溯在会话历史中进行。 */
export function Conversation({ feedback, compressions }: { feedback: readonly InlineFeedback[]; compressions: readonly CompressionActivity[] }) {
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
  // 已保存部分只随快照与运行状态重算；流式增量只追加实时块，历史条目保持身份。
  const saved = useMemo(() => snapshot ? savedTimeline(snapshot, agentId, running, feedback, {
    boundary: viewState.historyWindow.read(snapshot.records.all({ scope: "timeline" }), agentId), compressions,
  }) : null, [snapshot, agentId, running, feedback, compressions, viewState]);
  const items = useMemo(() => saved ? displayedTimeline(withLive(saved, models.blocks)) : [], [saved, models.blocks]);
  const { timeline: target, processOwners, toggle } = useTurnProcesses(items, viewState, running);
  const reducedMotion = useReducedMotion() === true;
  const presence = useTimelinePresence(target, processOwners, reducedMotion);
  const timeline = presence.items;
  const { scroll, list, awayFromBottom, latest, jumpTo, preserveItem, onProcessMount, onScroll, onResize, onScrollEnd } =
    useOutputFollow(timeline, processOwners, presence.skipEntrances);
  const composer = useRef<HTMLTextAreaElement>(null);
  const composerHidden = useComposerHidden();

  if (!snapshot) return null;
  const send = async () => {
    if (composerHidden) return;
    if (!await interaction.send()) return;
    latest(); composer.current?.focus({ preventScroll: true });
  };
  const resume = async () => {
    if (composerHidden) return;
    await interaction.resume(); latest();
  };

  return <>
    <AgentUIRegion position="top" />
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* 虚拟列表自行补偿滚动位置，关闭浏览器的滚动锚定以免两者冲突。 */}
      <div ref={scroll} className="min-h-0 flex-1 scroll-pt-4 select-text overflow-y-auto overscroll-contain [overflow-anchor:none]" onScroll={onScroll}>
        <VirtualConversationTimeline ref={list} items={timeline} viewState={viewState} scrollRef={scroll}
          target={target} presence={presence} reducedMotion={reducedMotion}
          onResize={onResize} onScrollEnd={onScrollEnd} onProcessMount={onProcessMount}
          onToggleProcess={id => { preserveItem(id); toggle(id); }} />
        <div className="px-4 pb-4">
          {running && !timeline.some(item => item.kind === "compression" && item.status === "running") &&
            <p role="status" className="type-caption flex items-center gap-2 pt-4"><StatusIcon tone="progress" className="size-3" />{i18n.formatMessage(conversationMessages.workingHint)}</p>}
          {!timeline.length && !running && <p className="type-caption pt-4">{i18n.formatMessage(conversationMessages.emptyHint)}</p>}
        </div>
      </div>
      <ConversationMinimap timeline={saved?.items ?? emptyTimeline} onSelect={id => {
        const index = timeline.findIndex(item => item.kind === "message" && item.id === id);
        if (index >= 0) jumpTo(index);
      }} />
      {awayFromBottom && <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center">
        <div className="surface-floating pointer-events-auto">
          <Button variant="ghost" size="sm" onClick={latest}><ArrowDown />{i18n.formatMessage(conversationMessages.latestOutput)}</Button>
        </div>
      </div>}
    </div>
    <AgentUIRegion position="bottom" />
    {!composerHidden && <AgentDraftsPanel onTake={() => composer.current?.focus({ preventScroll: true })} />}
    {!composerHidden && <footer className="shrink-0 space-y-1 border-t px-3 pt-1 pb-2">
      <AgentToolbar />
      <MessageComposer draft={interaction.draft} inputRef={composer}
        ready={ready} executionState={executionState} writable={interaction.writable} onSend={send}
        onSave={() => interaction.save()} onCancel={interaction.cancel} onContinue={resume} />
    </footer>}
  </>;
}
