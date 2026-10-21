import { StatusBadge, StatusIcon } from "@atelier/ui/ui/status";
import { ArrowDown } from "lucide-react";
import { Button } from "@atelier/ui/ui/button";
import { ConversationTimeline } from "./ConversationTimeline";
import { ConversationMinimap } from "./ConversationMinimap";

import { MessageComposer } from "./Composer";
import { conversationMessages } from "../../messages/conversation";
import { useI18n, useRendererObject, useRendererModels } from "@atelier/sdk/renderer";

import { useOutputFollow } from "./output-follow";
import { useMemo, useRef } from "react";

import { conversationTimeline } from "./timeline";

import { useConversationInteraction } from "./interaction";
import { AgentToolbar, AgentUIRegion, useComposerHidden } from "../ui/AgentUI";
import { AgentDraftsPanel } from "./Drafts";
import type { AgentExecutionState } from "../state";

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

/** 代理卡片内容：当前路径的最终视图与输入区；没有分支感，回溯在会话历史中进行。 */
export function Conversation() {
  const i18n = useI18n();
  const object = useRendererObject();
  const { view: state, session } = object;
  const interaction = useConversationInteraction();
  const { executionState } = interaction;
  const models = useRendererModels();
  const { ready } = state;
  const agentId = object.ref.id;
  const snapshot = session.snapshot();
  const running = executionState === "running";
  const timeline = useMemo(() => snapshot ? conversationTimeline(snapshot, agentId, models.blocks, running) : [], [snapshot, agentId, models.blocks, running]);
  const { scroll, contentRef, awayFromBottom, latest, jumpTo, onScroll } = useOutputFollow(timeline);
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
      <div ref={scroll} className="min-h-0 flex-1 scroll-pt-4 select-text overflow-y-auto overscroll-contain" onScroll={onScroll}>
        <div ref={contentRef} className="space-y-4 p-4">
          <ConversationTimeline items={timeline} />
          {running && <p role="status" className="type-caption flex items-center gap-2"><StatusIcon tone="progress" className="size-3" />{i18n.formatMessage(conversationMessages.workingHint)}</p>}
          {!timeline.length && !running && <p className="type-caption">{i18n.formatMessage(conversationMessages.emptyHint)}</p>}
        </div>
      </div>
      <ConversationMinimap timeline={timeline} onSelect={id => {
        const target = scroll.current?.querySelector<HTMLElement>(`[data-conversation-message="${CSS.escape(id)}"]`);
        if (target) jumpTo(target);
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
