import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ArrowDown, ArrowUp, Bot, Brain, Check, ChevronDown, Cpu, GitBranch, Info, LoaderCircle, Square, TriangleAlert, Wrench } from "lucide-react";
import type { AgentSelection } from "../../../shared/model";
import type { LiveBlock, SessionNode } from "../../../shared/session";
import { agentTimeline, isBlockNode } from "../../../shared/session-view";
import { sessionPath, snap } from "../../../shared/session-path";
import { resolveModelRole, resolveProviderModel, thinkingSchema, type ThinkingLevel } from "../../../shared/configuration";
import type { AgentView } from "./registry";
import type { SessionController } from "./controller";
import { Markdown } from "./Markdown";
import { s, useConfiguration } from "../configuration/state";
import { ConfigurationChoice } from "../configuration/ConfigurationChoice";
import { t } from "../../shared/i18n";
import { Button } from "../../shared/ui/button";
import { Badge } from "../../shared/ui/badge";
import { Alert, AlertDescription } from "../../shared/ui/alert";
import { PageState } from "../../shared/ui/page-state";
import { InputGroup, InputGroupAddon, InputGroupTextarea } from "../../shared/ui/input-group";
import { IslandPanel } from "../../shared/weave/IslandPanel";
import { JsonView, ToolResultView } from "../../modules/views";

function useSession(controller: SessionController) {
  useEffect(() => controller.connect(), [controller]);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  return { state, snapshot: state.snapshot, historical: state.inspected !== undefined };
}
function useAgent(view: AgentView) {
  const session = useSession(view.controller);
  const { snapshot, state } = session;
  const at = state.inspected ?? snapshot?.cursor ?? null;
  const timeline = useMemo(() => snapshot ? agentTimeline(snapshot.nodes, at, view.agentId) : [], [snapshot, at, view.agentId]);
  const agent = snapshot?.agents.find(a => a.id === view.agentId) ?? null;
  return { ...session, at, timeline, agent, running: !!snapshot?.running };
}

/** 卡片标题栏中的执行状态；历史属于会话，入口在窗口标题栏。 */
export function ConversationActions({ view, ready }: { view: AgentView; ready: boolean }) {
  const { snapshot, agent, historical } = useAgent(view);
  if (!snapshot) return null;
  return <>
    <Badge variant="secondary" role="status">{agent?.running && <LoaderCircle className="animate-spin" />}
      {!ready ? t.statusUnavailable : historical ? t.viewingHistory : agent?.running ? s("Working", "执行中") : s("Ready", "就绪")}</Badge>
  </>;
}

/** 代理卡片内容：当前路径的最终视图与输入区；没有分支感，回溯在会话历史中进行。 */
export function Conversation({ view, ready, draft, onDraftChange, onHome }: {
  view: AgentView; ready: boolean; draft: string; onDraftChange: (value: string) => void; onHome: () => void;
}) {
  const { controller, agentId, submission } = view;
  const { state, snapshot, timeline, agent, running, historical } = useAgent(view);
  const { snapshot: configuration, error: configurationError } = useConfiguration(ready);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [awayFromBottom, setAwayFromBottom] = useState(false);
  const follow = useRef(true);
  const scroll = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => { if (follow.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight; }, [snapshot, state.inspected]);

  if (!snapshot) return <div className="flex flex-1 items-center justify-center p-6">
    <PageState kind={state.loading ? "loading" : "error"} title={state.loading ? t.openingTitle : t.unavailableTitle}
      body={state.error ?? t.openingBody}
      action={!state.loading && <Button variant="secondary" size="sm" onClick={state.missing ? onHome : () => { void controller.refresh(); }}>{state.missing ? t.newConversation : t.retry}</Button>} />
  </div>;

  const selection = agent?.selection ?? null;
  const selectedAgent = configuration?.agents.find(a => a.id === selection?.agentConfigurationId && a.enabled);
  const selectedModel = configuration ? resolveProviderModel(configuration, selection?.modelId ?? null)?.model : null;
  const models = configuration?.models.filter(model => resolveProviderModel(configuration, model.id)) ?? [];
  const configure = async (next: AgentSelection) => {
    const result = await controller.execute({ type: "configure", sessionId: controller.sessionId, agentId, selection: next });
    if (result.ok) setSelectionError(null);
  };
  const writable = ready && !state.busy && !running && !historical && !!selection;
  const error = state.error ?? configurationError ?? selectionError;
  const latest = () => { follow.current = true; setAwayFromBottom(false); if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight; };
  const send = async () => {
    if (!writable || !draft.trim()) return;
    const input = { type: "submit" as const, sessionId: controller.sessionId, agentId, text: draft.trim() };
    const result = await controller.execute({ ...input, submissionId: submission.forInput(input) });
    if (!result.ok) return;
    submission.accepted(); onDraftChange(""); latest();
    composer.current?.focus({ preventScroll: true });
  };
  const resume = async () => {
    if (!writable) return;
    await controller.execute({ type: "continue", sessionId: controller.sessionId, agentId }); latest();
  };

  return <>
    {historical && <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
      <p className="type-caption">{s("Viewing saved history. Choose “Continue from here” in history to branch.", "正在查看已保存历史。在会话历史中选择“从此处继续”即可分叉。")}</p>
      <Button variant="ghost" size="sm" onClick={() => controller.inspect(undefined)}>{t.backToLive}</Button>
    </div>}
    <div ref={scroll} className="min-h-0 flex-1 select-text overflow-y-auto overscroll-contain" onScroll={event => {
      const element = event.currentTarget;
      follow.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
      setAwayFromBottom(!follow.current);
    }}>
      <div className="space-y-4 p-4">
        {timeline.map(node => <NodeView key={node.id} node={node} />)}
        {!historical && snapshot.live.filter(block => block.agentId === agentId).map(block => <LiveBlockView key={block.id} block={block} />)}
        {agent?.running && !historical && <p role="status" className="type-caption flex items-center gap-2"><LoaderCircle className="size-3 animate-spin" />{s("The agent is working…", "代理正在执行…")}</p>}
        {!timeline.length && !running && <p className="type-caption">{s("Send a message to begin.", "发送消息开始对话。")}</p>}
      </div>
    </div>
    <footer className="shrink-0 space-y-3 border-t p-3">
      {!historical && selection && <div className="flex min-w-0 flex-wrap items-center gap-0.5">
        <ConfigurationChoice icon={<Bot />} label={t.agent} value={selectedAgent?.name ?? s("Unavailable agent", "代理不可用")}
          selected={selection.agentConfigurationId} disabled={!ready || state.busy || !configuration}
          options={configuration?.agents.filter(a => a.enabled).map(a => ({ value: a.id, label: a.name })) ?? []}
          onSelect={id => {
            if (!configuration) return;
            const next = configuration.agents.find(item => item.id === id)!;
            const defaults = resolveModelRole(configuration, next.modelRole ?? "default", { modelId: selection.modelId, thinking: selection.thinking });
            if (defaults.error || !defaults.modelId) { setSelectionError(s("This agent's default model is unavailable. Select an available model or update settings.", "此代理的默认模型不可用，请先选择可用模型或修改设置。")); return; }
            void configure({ agentConfigurationId: id, modelId: defaults.modelId, thinking: defaults.thinking });
          }} />
        <ConfigurationChoice icon={<Cpu />} label={t.model} value={selectedModel?.name ?? s("Unavailable model", "模型不可用")}
          selected={selection.modelId} disabled={!ready || state.busy || !models.length}
          options={models.map(model => ({ value: model.id, label: `${configuration?.providers.find(p => p.id === model.providerId)?.name ?? ""} / ${model.name}` }))}
          onSelect={id => { void configure({ ...selection, modelId: id }); }} />
        <ConfigurationChoice icon={<Brain />} label={s("Thinking level", "思考等级")} value={selectedModel?.capabilities.reasoning ? selection.thinking ?? s("Default", "默认") : s("Off", "关闭")}
          selected={selectedModel?.capabilities.reasoning ? selection.thinking ?? "__default" : "off"} disabled={!ready || state.busy || !selectedModel?.capabilities.reasoning}
          options={[{ value: "__default", label: s("Default", "默认") }, ...thinkingSchema.options.map(level => ({ value: level, label: level }))]}
          onSelect={value => { void configure({ ...selection, thinking: value === "__default" ? null : value as ThinkingLevel }); }} />
        {running && <span className="type-caption">{s("Changes apply to the next request", "修改于下一次请求生效")}</span>}
      </div>}
      {awayFromBottom && <div className="text-center"><Button variant="secondary" size="sm" onClick={latest}><ArrowDown />{s("Latest output", "最新内容")}</Button></div>}
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
              onClick={() => { void controller.execute({ type: "cancel", sessionId: controller.sessionId }); }}><Square />{s("Stop", "停止")}</Button>
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

/** 会话历史浮岛：列出整棵树的可选节点（含旁支）；查看不改变游标，“从此处继续”才移动游标。 */
export function SessionHistoryPanel({ controller }: { controller: SessionController }) {
  const { snapshot, state, historical } = useSession(controller);
  const [kinds, setKinds] = useState<Set<SessionNode["kind"]>>(new Set(["message", "text", "toolcall", "event", "notice"]));
  if (!snapshot) return <IslandPanel title={s("Session history", "会话历史")}><p className="type-caption">{t.openingBody}</p></IslandPanel>;
  const onPath = new Set(sessionPath(snapshot.nodes, snapshot.cursor).map(node => node.id));
  const continuation = state.inspected ? snap(snapshot.nodes, state.inspected) : snapshot.cursor;
  const continuationNode = snapshot.nodes.find(node => node.id === continuation);
  const visible = snapshot.nodes.filter(n => (!isBlockNode(n) || n.complete) && kinds.has(n.kind));
  const toggle = (kind: SessionNode["kind"]) => setKinds(prev => { const next = new Set(prev); if (next.has(kind)) next.delete(kind); else next.add(kind); return next; });
  const continueHere = async () => {
    if (!state.inspected) return;
    const result = await controller.execute({ type: "select", sessionId: controller.sessionId, nodeId: state.inspected });
    if (result.ok) controller.inspect(undefined);
  };
  return <IslandPanel title={s("Session history", "会话历史")} description={snapshot.title}>
    <div className="mb-2 flex flex-wrap gap-1">
      {(["message", "thinking", "text", "toolcall", "event", "notice"] as const).map(kind =>
        <Button key={kind} size="sm" variant={kinds.has(kind) ? "secondary" : "ghost"} onClick={() => toggle(kind)}>{kindLabel(kind)}</Button>)}
    </div>
    <div className="mb-3 flex gap-1">
      <Button className="flex-1" variant={historical ? "ghost" : "secondary"} onClick={() => controller.inspect(undefined)}>{!historical && <Check />}{t.live}</Button>
      <Button className="flex-1" variant="default" disabled={!historical || snapshot.running || state.busy} onClick={() => { void continueHere(); }}>
        <GitBranch />{s("Continue from here", "从此处继续")}</Button>
    </div>
    {snapshot.running && <p className="type-caption mb-2">{s("Stop or wait for running agents before branching.", "分叉前需等待或停止正在运行的代理。")}</p>}
    {historical && continuation !== state.inspected && <p className="type-caption mb-2">
      {s("Continuation starts at: ", "实际继续位置：")}{continuationNode ? `${kindLabel(continuationNode.kind)} · ${nodeLabel(continuationNode)}` : s("Session start", "会话起点")}
    </p>}
    <div className="flex flex-col gap-0.5">
      {visible.map(node => <Button key={node.id} variant={state.inspected === node.id ? "secondary" : "ghost"}
        className={`h-auto justify-start py-1.5 font-normal ${onPath.has(node.id) ? "" : "opacity-60"}`} onClick={() => controller.inspect(node.id)}>
        <span className="type-caption w-14 shrink-0 text-left">{kindLabel(node.kind)}</span><span className="min-w-0 truncate">{nodeLabel(node)}</span>
      </Button>)}
    </div>
  </IslandPanel>;
}

function kindLabel(kind: SessionNode["kind"]): string {
  return ({ message: s("Input", "输入"), thinking: s("Thinking", "思考"), text: s("Reply", "回复"), toolcall: s("Tool", "工具"),
    event: s("Event", "事件"), notice: s("Notice", "通知") } as const)[kind];
}
function nodeLabel(node: SessionNode): string {
  switch (node.kind) {
    case "message": case "text": case "thinking": return node.text.slice(0, 64) || "…";
    case "toolcall": return node.name;
    case "event": return node.type;
    case "notice": return node.message;
  }
}
const toolLabels: Record<string, string> = {
  pending: s("Incomplete", "未完成"), succeeded: s("Completed", "已完成"), rejected: s("Not allowed", "已拒绝"), failed: s("Failed", "失败"),
  cancelled: s("Cancelled", "已取消"), partial: s("Partially completed", "部分完成"), unknown: s("Outcome unknown", "结果未知"),
};
function NodeView({ node }: { node: SessionNode }) {
  const usage = isBlockNode(node) ? node.usage : node.kind === "notice" ? node.response?.usage : null;
  return <div className="flex flex-col gap-1">
    <NodeContent node={node} />
    {usage && <p className="type-caption">
      {s("Input", "输入")} {usage.input ?? "—"} · {s("Output", "输出")} {usage.output ?? "—"} · {s("Cached", "缓存读取")} {usage.cacheRead ?? "—"}
    </p>}
  </div>;
}
function NodeContent({ node }: { node: SessionNode }) {
  const incomplete = isBlockNode(node) && !node.complete;
  const tag = incomplete ? <Badge variant="outline">{s("Incomplete", "未完成")}</Badge> : null;
  switch (node.kind) {
    case "message": return <article className="space-y-2"><p className="type-label">{s("You", "你")}</p>
      <div className="rounded-md bg-muted px-3 py-2"><Markdown>{node.text}</Markdown></div></article>;
    case "text": return <article className="space-y-1">{tag}<Markdown>{node.text}</Markdown></article>;
    case "thinking": return <Disclosure label={s("Thinking", "思考")} icon={<Brain className="size-3.5" />} extra={tag}><Markdown>{node.text}</Markdown></Disclosure>;
    case "toolcall": {
      const outcome = node.outcome;
      return <Disclosure label={`${node.name} · ${toolLabels[outcome?.kind ?? "pending"]}`} icon={<Wrench className="size-3.5" />} extra={tag}>
        <p className="type-label">{s("Arguments", "参数")}</p><JsonView value={node.complete ? node.arguments : node.argumentsText} />
        {outcome && <>
          <p className="type-label mt-3">{s("Result", "结果")}</p>
          {outcome.kind === "succeeded" || outcome.kind === "partial" ? <ToolResultView outcome={outcome} />
            : <p className="type-caption">{"error" in outcome ? outcome.error.message : outcome.message}</p>}
          {outcome.kind === "partial" && <p className="type-caption">{outcome.message}</p>}
        </>}
      </Disclosure>;
    }
    case "notice": return <Alert variant={node.level === "error" ? "destructive" : "default"}>
      {node.level === "error" ? <TriangleAlert /> : <Info />}<AlertDescription>{node.message}</AlertDescription></Alert>;
    default: return null;
  }
}

function LiveBlockView({ block }: { block: LiveBlock }) {
  if (block.kind === "text") return <article><Markdown>{block.text}</Markdown></article>;
  if (block.kind === "thinking") return <Disclosure label={s("Thinking", "思考")} icon={<Brain className="size-3.5" />}>
    <Markdown>{block.text}</Markdown>
  </Disclosure>;
  return <Disclosure label={`${block.name} · ${block.state === "executing" ? s("Running", "执行中") : s("Preparing", "准备中")}`}
    icon={<LoaderCircle className="size-3.5 animate-spin" />}>
    <JsonView value={block.state === "input" ? block.argumentsText : block.arguments} />
  </Disclosure>;
}
function Disclosure({ label, icon, extra, children }: { label: string; icon?: React.ReactNode; extra?: React.ReactNode; children: React.ReactNode }) {
  return <details className="rounded-md border px-3 py-2">
    <summary className="type-caption flex cursor-pointer select-none items-center gap-2 py-1"><ChevronDown className="size-3" />{icon}{label}{extra}</summary>
    <div className="pt-3">{children}</div>
  </details>;
}
