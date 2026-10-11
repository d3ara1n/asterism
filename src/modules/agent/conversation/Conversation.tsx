import { ConversationTimeline } from "./ConversationTimeline";
import { MessageComposer } from "./Composer";
import { AgentConfigurationPicker } from "./ConfigurationPicker";
import { useOutputFollow } from "./output-follow";
import { useMemo, useRef } from "react";
import { ArrowDown, LoaderCircle } from "lucide-react";
import type { AgentSelection } from "../../../shared/model";
import { conversationTimeline } from "./timeline";
import { useRendererObject, useRendererModels, useRendererCatalogs } from "@atelier/sdk/renderer";
import { useAgentConversation } from "./interaction";
import { t, s } from "../../../renderer/shared/i18n";
import { Button } from "../../../renderer/shared/ui/button";
import { Badge } from "../../../renderer/shared/ui/badge";
import { Alert, AlertDescription } from "../../../renderer/shared/ui/alert";
import { PageState } from "../../../renderer/shared/ui/page-state";


/** 卡片标题栏中的执行状态；历史属于会话，入口在窗口标题栏。 */
export function ConversationActions() {
  const object = useRendererObject();
  const { ready, historical } = object.view;
  const snapshot = object.session.snapshot();
  const agentRunning = object.activity.running;
  if (!snapshot) return null;
  return <>
    <Badge variant="secondary" role="status">{agentRunning && <LoaderCircle className="animate-spin" />}
      {!ready ? t.statusUnavailable : historical ? t.viewingHistory : agentRunning ? s("Working", "执行中") : s("Ready", "就绪")}</Badge>
  </>;
}

/** 代理卡片内容：当前路径的最终视图与输入区；没有分支感，回溯在会话历史中进行。 */
export function Conversation({ selection, onHome }: { selection: AgentSelection | null; onHome(): void }) {
  const object = useRendererObject();
  const { view: state, session } = object;
  const interaction = useAgentConversation(object, selection !== null);
  const models = useRendererModels();
  const catalogs = useRendererCatalogs();
  const { ready, historical } = state;
  const agentId = object.ref.id;
  const snapshot = session.snapshot();
  const agentRunning = object.activity.running;
  const running = agentRunning;
  const timeline = useMemo(() => snapshot ? conversationTimeline(snapshot, agentId, models.blocks) : [], [snapshot, agentId, models.blocks]);
  const configurationError = catalogs.error;
  const { scroll, awayFromBottom, latest, onScroll } = useOutputFollow(timeline);
  const composer = useRef<HTMLTextAreaElement>(null);

  if (!snapshot) return state.status === "loading" ? null : <div className="flex flex-1 items-center justify-center p-6">
    <PageState kind="error" title={t.unavailableTitle} body={state.error ?? t.unavailableBody}
      action={<Button variant="secondary" size="sm" onClick={state.missing ? onHome : () => { void session.refresh(); }}>{state.missing ? t.newConversation : t.retry}</Button>} />
  </div>;

  const error = state.error ?? configurationError ?? interaction.error;
  const send = async () => {
    if (!await interaction.send()) return;
    latest(); composer.current?.focus({ preventScroll: true });
  };
  const resume = async () => { await interaction.resume(); latest(); };

  return <>
    {historical && <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
      <p className="type-caption">{s("Viewing saved history. Choose “Continue from here” in history to branch.", "正在查看已保存历史。在会话历史中选择“从此处继续”即可分叉。")}</p>
      <Button variant="ghost" size="sm" onClick={session.followLive}>{t.backToLive}</Button>
    </div>}
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <div ref={scroll} className="min-h-0 flex-1 select-text overflow-y-auto overscroll-contain" onScroll={onScroll}>
        <div className="space-y-4 p-4">
          <ConversationTimeline items={timeline} />
          {agentRunning && !historical && <p role="status" className="type-caption flex items-center gap-2"><LoaderCircle className="size-3 animate-spin" />{s("The agent is working…", "代理正在执行…")}</p>}
          {!timeline.length && !running && <p className="type-caption">{s("Send a message to begin.", "发送消息开始对话。")}</p>}
        </div>
      </div>
      {awayFromBottom && <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center">
        <div className="surface-floating pointer-events-auto">
          <Button variant="ghost" size="sm" onClick={latest}><ArrowDown />{s("Latest output", "最新内容")}</Button>
        </div>
      </div>}
    </div>
    <footer className="shrink-0 space-y-3 border-t p-3">
      {!historical && selection && <AgentConfigurationPicker selection={selection} disabled={!interaction.configurable}
        running={running} onChange={interaction.configure} onError={interaction.setError} />}
      {error && <Alert variant="destructive"><AlertDescription className="flex flex-wrap items-center gap-2">
        <span className="flex-1">{error}</span>
        <Button variant="ghost" size="sm" onClick={() => { void session.refresh(); }}>{s("Reload", "重新读取")}</Button>
      </AlertDescription></Alert>}
      {!historical && <MessageComposer draft={interaction.draft} onDraftChange={interaction.setDraft} inputRef={composer}
        busy={state.busy} ready={ready} running={running} writable={interaction.writable} onSend={send}
        onCancel={interaction.cancel} onContinue={resume} />}
    </footer>
  </>;
}
