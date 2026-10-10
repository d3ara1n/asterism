import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Bot, Brain, Cpu, Info, LoaderCircle, Square, TriangleAlert } from "lucide-react";
import type { AgentSelection } from "../../../shared/model";
import { conversationTimeline, timelineKey, type TimelineItem } from "../../../shared/session-view";
import { resolveModelRole, resolveProviderModel, thinkingSchema, type ThinkingLevel , modelReference } from "../../../shared/configuration";
import type { AgentView } from "../session/registry";
import type { AgentCommand } from "../../../modules/agent/contract";
import { useSession, useSessionProgress } from "../session/state";
import { Markdown } from "./Markdown";
import { s, useConfiguration } from "../configuration/state";
import { ConfigurationChoice } from "../configuration/ConfigurationChoice";
import { t } from "../../shared/i18n";
import { Button } from "../../shared/ui/button";
import { Badge } from "../../shared/ui/badge";
import { Alert, AlertDescription } from "../../shared/ui/alert";
import { PageState } from "../../shared/ui/page-state";
import { InputGroup, InputGroupAddon, InputGroupTextarea } from "../../shared/ui/input-group";
import { ToolCall } from "./ToolCall";
import { ThinkingBlock } from "./ThinkingBlock";

function useAgent(view: AgentView) {
  const session = useSession(view.controller);
  const progress = useSessionProgress(view.controller);
  const { snapshot, historical } = session;
  const timeline = useMemo(() => snapshot ? conversationTimeline(snapshot.nodes, snapshot.at, view.agentId, historical ? [] : progress.live) : [],
    [snapshot, historical, view.agentId, progress.live]);
  // 平级代理互不阻塞：只关心本代理是否在运行。
  const agentRunning = progress.runningAgentIds.includes(view.agentId);
  return { ...session, timeline, agentRunning, running: agentRunning };
}

/** 卡片标题栏中的执行状态；历史属于会话，入口在窗口标题栏。 */
export function ConversationActions({ view, ready }: { view: AgentView; ready: boolean }) {
  const { snapshot, historical } = useSession(view.controller);
  const agentRunning = useSessionProgress(view.controller).runningAgentIds.includes(view.agentId);
  if (!snapshot) return null;
  return <>
    <Badge variant="secondary" role="status">{agentRunning && <LoaderCircle className="animate-spin" />}
      {!ready ? t.statusUnavailable : historical ? t.viewingHistory : agentRunning ? s("Working", "执行中") : s("Ready", "就绪")}</Badge>
  </>;
}

/** 代理卡片内容：当前路径的最终视图与输入区；没有分支感，回溯在会话历史中进行。 */
export function Conversation({ view, selection, ready, draft, onDraftChange, onHome }: {
  view: AgentView; selection: AgentSelection | null; ready: boolean; draft: string; onDraftChange: (value: string) => void; onHome: () => void;
}) {
  const { controller, agentId, submission } = view;
  const { state, snapshot, timeline, agentRunning, running, historical } = useAgent(view);
  const command = (value: AgentCommand) => controller.execute({ type: "resource.command", sessionId: controller.sessionId, objectId: agentId, command: value });
  const { snapshot: configuration, error: configurationError } = useConfiguration(ready);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [awayFromBottom, setAwayFromBottom] = useState(false);
  const follow = useRef(true);
  const scroll = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => { if (follow.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight; }, [timeline]);

  if (!snapshot) return state.status === "loading" ? null : <div className="flex flex-1 items-center justify-center p-6">
    <PageState kind="error" title={t.unavailableTitle} body={state.error ?? t.unavailableBody}
      action={<Button variant="secondary" size="sm" onClick={state.missing ? onHome : () => { void controller.refresh(); }}>{state.missing ? t.newConversation : t.retry}</Button>} />
  </div>;

  const selectedAgent = configuration?.agents.find(a => a.id === selection?.agent && a.enabled);
  const selectedModel = configuration ? resolveProviderModel(configuration, selection?.model ?? null)?.model : null;
  const models = configuration?.models.filter(model => resolveProviderModel(configuration, modelReference(model))) ?? [];
  const configure = async (next: AgentSelection) => {
    const result = await command({ type: "configure", selection: next });
    if (result.ok) setSelectionError(null);
  };
  const writable = ready && !state.busy && state.status === "ready" && !running && !historical && !!selection;
  const configurable = ready && !state.busy && state.status === "ready";
  const error = state.error ?? configurationError ?? selectionError;
  const latest = () => { follow.current = true; setAwayFromBottom(false); if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight; };
  const send = async () => {
    if (!writable || !draft.trim()) return;
    const input = { agentId, text: draft.trim() };
    const result = await command({ type: "submit", text: input.text, submissionId: submission.forInput(input) });
    if (!result.ok) return;
    submission.accepted(); onDraftChange(""); latest();
    composer.current?.focus({ preventScroll: true });
  };
  const resume = async () => {
    if (!writable) return;
    await command({ type: "continue" }); latest();
  };

  return <>
    {historical && <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
      <p className="type-caption">{s("Viewing saved history. Choose “Continue from here” in history to branch.", "正在查看已保存历史。在会话历史中选择“从此处继续”即可分叉。")}</p>
      <Button variant="ghost" size="sm" onClick={controller.followCursor}>{t.backToLive}</Button>
    </div>}
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <div ref={scroll} className="min-h-0 flex-1 select-text overflow-y-auto overscroll-contain" onScroll={event => {
        const element = event.currentTarget;
        follow.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
        setAwayFromBottom(!follow.current);
      }}>
        <div className="space-y-4 p-4">
          {timeline.map(node => <NodeView key={timelineKey(node)} node={node} />)}
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
      {!historical && selection && <div className="flex min-w-0 flex-wrap items-center gap-0.5">
        <ConfigurationChoice icon={<Bot />} label={t.agent} value={selectedAgent?.name ?? s("Unavailable agent", "代理不可用")}
          selected={selection.agent} disabled={!configurable || !configuration}
          options={configuration?.agents.filter(a => a.enabled).map(a => ({ value: a.id, label: a.name })) ?? []}
          onSelect={id => {
            if (!configuration) return;
            const next = configuration.agents.find(item => item.id === id)!;
            const defaults = resolveModelRole(configuration, next.modelRole ?? "default", { model: selection.model, thinking: selection.thinking });
            if (defaults.error || !defaults.model) { setSelectionError(s("This agent's default model is unavailable. Select an available model or update settings.", "此代理的默认模型不可用，请先选择可用模型或修改设置。")); return; }
            void configure({ agent: id, model: defaults.model, thinking: defaults.thinking });
          }} />
        <ConfigurationChoice icon={<Cpu />} label={t.model} value={selectedModel?.name ?? s("Unavailable model", "模型不可用")}
          selected={selection.model} disabled={!configurable || !models.length}
          options={models.map(model => ({ value: modelReference(model), label: `${configuration?.providers.find(p => p.id === model.providerId)?.name ?? ""} / ${model.name}` }))}
          onSelect={id => { void configure({ ...selection, model: id }); }} />
        <ConfigurationChoice icon={<Brain />} label={s("Thinking level", "思考等级")} value={selectedModel?.capabilities.reasoning ? selection.thinking ?? s("Default", "默认") : s("Off", "关闭")}
          selected={selectedModel?.capabilities.reasoning ? selection.thinking ?? "__default" : "off"} disabled={!configurable || !selectedModel?.capabilities.reasoning}
          options={[{ value: "__default", label: s("Default", "默认") }, ...thinkingSchema.options.map(level => ({ value: level, label: level }))]}
          onSelect={value => { void configure({ ...selection, thinking: value === "__default" ? null : value as ThinkingLevel }); }} />
        {running && <span className="type-caption">{s("Changes apply to the next request", "修改于下一次请求生效")}</span>}
      </div>}
      {error && <Alert variant="destructive"><AlertDescription className="flex flex-wrap items-center gap-2">
        <span className="flex-1">{error}</span>
        <Button variant="ghost" size="sm" onClick={() => { void controller.refresh(); }}>{s("Reload", "重新读取")}</Button>
      </AlertDescription></Alert>}
      {!historical && <form onSubmit={event => { event.preventDefault(); void send(); }}>
        <InputGroup>
          <InputGroupTextarea ref={composer} rows={3} maxLength={100_000} value={draft} disabled={state.busy}
            onChange={event => onDraftChange(event.target.value)} aria-label={s("Message the agent", "向代理发送消息")}
            placeholder={running ? s("Draft your next message…", "可以先写下一条消息…") : s("Continue the conversation…", "继续对话…")}
            onKeyDown={event => {
              if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
              event.preventDefault(); event.currentTarget.form?.requestSubmit();
            }} />
          <InputGroupAddon align="block-end" className="justify-between">
            <span className="type-caption">{s("Enter to send · Shift + Enter for a new line", "Enter 发送 · Shift + Enter 换行")}</span>
            {running ? <Button type="button" size="sm" variant="secondary" disabled={state.busy || !ready}
              onClick={() => { void command({ type: "cancel" }); }}><Square />{s("Stop", "停止")}</Button>
              : <div className="flex gap-1">
                <Button type="button" size="sm" variant="ghost" disabled={!writable} onClick={() => { void resume(); }}>{s("Continue", "继续执行")}</Button>
                <Button type="submit" size="icon-sm" disabled={!writable || !draft.trim()} aria-label={t.sendMessage} title={t.sendMessage}><ArrowUp /></Button>
              </div>}
          </InputGroupAddon>
        </InputGroup>
      </form>}
    </footer>
  </>;
}

function NodeView({ node }: { node: TimelineItem }) {
  const usage = "usage" in node ? node.usage : node.kind === "notice" ? node.response?.usage : null;
  return <div className="flex flex-col gap-1">
    <NodeContent node={node} />
    {usage && <p className="type-caption">
      {s("Input", "输入")} {usage.input ?? "—"} · {s("Output", "输出")} {usage.output ?? "—"} · {s("Cached", "缓存读取")} {usage.cacheRead ?? "—"}
    </p>}
  </div>;
}
function NodeContent({ node }: { node: TimelineItem }) {
  const incomplete = "complete" in node && !node.complete;
  const streaming = (node.kind === "text" || node.kind === "thinking") && !("complete" in node);
  const tag = incomplete ? <Badge variant="outline">{s("Incomplete", "未完成")}</Badge> : null;
  switch (node.kind) {
    case "message": return <article className="space-y-2"><p className="type-label">{s("You", "你")}</p>
      <div className="rounded-md bg-muted px-3 py-2"><Markdown>{node.text}</Markdown></div></article>;
    case "text": return <article className="space-y-1">{tag}<Markdown streaming={streaming}>{node.text}</Markdown></article>;
    case "thinking": return node.text.trim() ? <ThinkingBlock node={node} /> : null;
    case "toolcall": return <ToolCall node={node} />;
    case "notice": return <Alert variant={node.level === "error" ? "destructive" : "default"}>
      {node.level === "error" ? <TriangleAlert /> : <Info />}<AlertDescription>{node.message}</AlertDescription></Alert>;
    default: return null;
  }
}
