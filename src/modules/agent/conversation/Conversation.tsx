import { Badge } from "../../../renderer/shared/ui/badge";
import { LoaderCircle, ArrowDown } from "lucide-react";
import { PageState } from "../../../renderer/shared/ui/page-state";
import { Button } from "../../../renderer/shared/ui/button";
import { ConversationTimeline } from "./ConversationTimeline";

import { AgentConfigurationPicker } from "./ConfigurationPicker";
import { Alert, AlertDescription } from "../../../renderer/shared/ui/alert";

import { MessageComposer } from "./Composer";
import { commonMessages } from "../../messages/common";
import { conversationMessages } from "../../messages/conversation";
import { useI18n, useRendererObject, useRendererModels, useRendererCatalogs } from "@atelier/sdk/renderer";

import { useOutputFollow } from "./output-follow";
import { useMemo, useRef } from "react";

import type { AgentSelection } from "../../../shared/model";
import { conversationTimeline } from "./timeline";

import { useAgentConversation } from "./interaction";
import { agentExecutionState, type AgentTurnState } from "../state";

/** 卡片标题栏中的执行状态；历史属于会话，入口在窗口标题栏。 */
export function ConversationActions() {
  const i18n = useI18n();
  const object = useRendererObject();
  const { ready } = object.view;
  const snapshot = object.session.snapshot();
  const agentRunning = object.activity.running;
  if (!snapshot) return null;
  return <>
    <Badge variant="secondary" role="status">{agentRunning && <LoaderCircle className="animate-spin" />}
      {!ready ? i18n.formatMessage(commonMessages.statusUnavailable) : agentRunning ? i18n.formatMessage(conversationMessages.working) : i18n.formatMessage(conversationMessages.ready)}</Badge>
  </>;
}

/** 代理卡片内容：当前路径的最终视图与输入区；没有分支感，回溯在会话历史中进行。 */
export function Conversation({ selection, turnState, onHome }: { selection: AgentSelection | null; turnState: AgentTurnState; onHome(): void }) {
  const i18n = useI18n();
  const object = useRendererObject();
  const { view: state, session } = object;
  const executionState = agentExecutionState(turnState, object.activity.running);
  const interaction = useAgentConversation(object, selection !== null, executionState);
  const models = useRendererModels();
  const catalogs = useRendererCatalogs();
  const { ready } = state;
  const agentId = object.ref.id;
  const snapshot = session.snapshot();
  const running = executionState === "running";
  const timeline = useMemo(() => snapshot ? conversationTimeline(snapshot, agentId, models.blocks) : [], [snapshot, agentId, models.blocks]);
  const configurationError = catalogs.error;
  const { scroll, awayFromBottom, latest, onScroll } = useOutputFollow(timeline);
  const composer = useRef<HTMLTextAreaElement>(null);

  if (!snapshot) return state.status === "loading" ? null : <div className="flex flex-1 items-center justify-center p-6">
    <PageState kind="error" title={i18n.formatMessage(commonMessages.unavailableTitle)} body={i18n.text(state.error ?? commonMessages.unavailableBody)}
      action={<Button variant="secondary" size="sm" onClick={state.missing ? onHome : () => { void session.refresh(); }}>{state.missing ? i18n.formatMessage(commonMessages.newConversation) : i18n.formatMessage(commonMessages.retry)}</Button>} />
  </div>;

  const error = state.error ?? configurationError ?? interaction.error;
  const send = async () => {
    if (!await interaction.send()) return;
    latest(); composer.current?.focus({ preventScroll: true });
  };
  const resume = async () => { await interaction.resume(); latest(); };

  return <>
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <div ref={scroll} className="min-h-0 flex-1 select-text overflow-y-auto overscroll-contain" onScroll={onScroll}>
        <div className="space-y-4 p-4">
          <ConversationTimeline items={timeline} />
          {running && <p role="status" className="type-caption flex items-center gap-2"><LoaderCircle className="size-3 animate-spin" />{i18n.formatMessage(conversationMessages.workingHint)}</p>}
          {!timeline.length && !running && <p className="type-caption">{i18n.formatMessage(conversationMessages.emptyHint)}</p>}
        </div>
      </div>
      {awayFromBottom && <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center">
        <div className="surface-floating pointer-events-auto">
          <Button variant="ghost" size="sm" onClick={latest}><ArrowDown />{i18n.formatMessage(conversationMessages.latestOutput)}</Button>
        </div>
      </div>}
    </div>
    <footer className="shrink-0 space-y-3 border-t p-3">
      {selection && <AgentConfigurationPicker selection={selection} disabled={!interaction.configurable}
        running={running} onChange={interaction.configure} onError={interaction.setError} />}
      {error && <Alert variant="destructive"><AlertDescription className="flex flex-wrap items-center gap-2">
        <span className="flex-1">{i18n.text(error)}</span>
        <Button variant="ghost" size="sm" onClick={() => { void session.refresh(); }}>{i18n.formatMessage(conversationMessages.reload)}</Button>
      </AlertDescription></Alert>}
      <MessageComposer draft={interaction.draft} inputRef={composer}
        busy={state.busy} ready={ready} executionState={executionState} writable={interaction.writable} onSend={send}
        onCancel={interaction.cancel} onContinue={resume} />
    </footer>
  </>;
}
