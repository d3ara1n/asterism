import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ArrowDown, ArrowUp, Bot, Brain, Check, ChevronDown, GitBranch, History, LoaderCircle, RotateCcw, Square, Wrench } from "lucide-react";
import type { ConversationNode, ModelNode, ToolPart } from "../../../shared/conversation";
import { canContinue, completeAncestor, conversationPath } from "../../../shared/conversation-view";
import type { ConversationSession } from "./session";
import { Markdown } from "./Markdown";
import { s } from "../configuration/state";
import { t } from "../../shared/i18n";
import { Button } from "../../shared/ui/button";
import { Badge } from "../../shared/ui/badge";
import { Alert, AlertDescription } from "../../shared/ui/alert";
import { PageState } from "../../shared/ui/page-state";
import { InputGroup, InputGroupAddon, InputGroupTextarea } from "../../shared/ui/input-group";
import { IslandPanel } from "../../shared/weave/IslandPanel";

function useConversation(session: ConversationSession) {
  const { controller } = session;
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const snapshot = state.snapshot;
  const cursor = state.inspected ?? snapshot?.cursor ?? null;
  const path = useMemo(() => snapshot ? conversationPath(snapshot.nodes, cursor) : [], [snapshot, cursor]);
  return { state, snapshot, cursor, path, running: !!snapshot?.activeTurnId, historical: state.inspected !== undefined };
}

/** 卡片标题栏中的执行状态与对话历史入口。 */
export function ConversationActions({ session, ready, onHistory }: { session: ConversationSession; ready: boolean; onHistory: (origin: HTMLElement) => void }) {
  const { snapshot, path, running, historical } = useConversation(session);
  if (!snapshot) return null;
  const interrupted = !running && path.some(node => !canContinue(node));
  return <>
    <Badge variant="secondary" role="status">{running && <LoaderCircle className="animate-spin" />}
      {!ready ? t.statusUnavailable : historical ? t.viewingHistory : running ? s("Working", "执行中") : interrupted ? s("Stopped", "已停止") : s("Ready", "就绪")}</Badge>
    <Button variant="ghost" size="icon-xs" aria-label={t.history} title={t.history} onClick={event => onHistory(event.currentTarget)}><History /></Button>
  </>;
}

/** 主代理卡片内容：连续阅读区与底部输入区。不感知画布与卡片外壳。 */
export function Conversation({ session, ready, draft, onDraftChange, onHome, onTurnEnded }: {
  session: ConversationSession; ready: boolean; draft: string; onDraftChange: (value: string) => void; onHome: () => void; onTurnEnded: () => void;
}) {
  const { controller, submission } = session;
  const { state, snapshot, cursor, path, running, historical } = useConversation(session);
  const [awayFromBottom, setAwayFromBottom] = useState(false);
  const follow = useRef(true);
  const scroll = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const previousTurn = useRef<string | null>(null);
  useEffect(() => controller.connect(), [controller]);
  useEffect(() => {
    const active = snapshot?.activeTurnId ?? null;
    if (previousTurn.current && !active) onTurnEnded();
    previousTurn.current = active;
  }, [snapshot?.activeTurnId, onTurnEnded]);
  useLayoutEffect(() => {
    if (follow.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [snapshot?.seq, state.inspected]);

  if (!snapshot) return <div className="flex flex-1 items-center justify-center p-6">
    <PageState kind={state.loading ? "loading" : "error"}
      title={state.loading ? t.openingTitle : state.missing ? s("This agent has no conversation", "这个代理尚无对话记录") : t.unavailableTitle}
      body={state.missing ? s("Start a new conversation from Home. Earlier agents are not converted into model conversations.", "请从首页发起新对话。早期代理不会转换为模型会话。") : state.error ?? t.openingBody}
      action={!state.loading && <Button variant="secondary" size="sm" onClick={state.missing ? onHome : () => { void controller.refresh(); }}>{state.missing ? t.newConversation : t.retry}</Button>} />
  </div>;

  const visible = path.filter(node => node.kind !== "extension" || node.user !== "omit");
  const writable = ready && !state.busy && !running && !historical && !!snapshot.selection && path.every(canContinue);
  const interrupted = !running && path.some(node => !canContinue(node));
  const error = state.error ?? (!historical ? snapshot.lastError?.message : null);
  const latest = () => {
    follow.current = true; setAwayFromBottom(false);
    if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
  };
  const resume = async (nodeId?: string | null) => {
    if (!snapshot.selection || state.busy || running || !ready) return;
    if (nodeId !== undefined) {
      const selected = await controller.execute({ type: "select", taskId: controller.taskId, agentId: controller.agentId, nodeId });
      if (!selected.ok) return;
      controller.inspect(undefined);
    }
    await controller.execute({ type: "continue", taskId: controller.taskId, agentId: controller.agentId, ...snapshot.selection });
    latest();
  };
  const send = async () => {
    if (!writable || !draft.trim() || !snapshot.selection) return;
    const input = { type: "submit" as const, taskId: controller.taskId, agentId: controller.agentId, ...snapshot.selection, text: draft.trim() };
    const result = await controller.execute({ ...input, submissionId: submission.forInput(input) });
    if (!result.ok) return;
    submission.accepted(); onDraftChange(""); latest();
    composer.current?.focus({ preventScroll: true });
  };

  return <>
    {historical && <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
      <p className="type-caption">{s("Viewing saved history. Current work keeps running.", "正在查看已保存历史，当前执行不受影响。")}</p>
      <div className="flex gap-1">
        <Button variant="ghost" size="sm" onClick={() => controller.inspect(undefined)}>{t.backToLive}</Button>
        <Button variant="secondary" size="sm" disabled={!ready || state.busy || running || !path.every(canContinue) || !snapshot.selection}
          onClick={() => { void resume(cursor); }}><GitBranch />{s("Continue from here", "从此处继续")}</Button>
      </div>
    </div>}
    <div ref={scroll} className="min-h-0 flex-1 select-text overflow-y-auto overscroll-contain" onScroll={event => {
      const element = event.currentTarget;
      follow.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
      setAwayFromBottom(!follow.current);
    }}>
      <div className="space-y-6 p-4">
        {visible.map(node => <article key={node.id} className="min-w-0 space-y-3" aria-label={nodeLabel(node)}>
          {node.kind === "input" ? <>
            <p className="type-label">{s("You", "你")}</p>
            <div className="rounded-md bg-muted px-3 py-2"><Markdown>{node.text}</Markdown></div>
          </> : node.kind === "model" ? <ModelResponse node={node} agentName={snapshot.agentName} />
            : node.kind === "compaction" ? <Disclosure label={s("Earlier conversation summary", "此前对话摘要")}><Markdown>{node.summary}</Markdown></Disclosure>
              : <Disclosure label={node.extension}><JsonView value={node.data} /></Disclosure>}
        </article>)}
        {running && !historical && <p role="status" className="type-caption flex items-center gap-2"><LoaderCircle className="size-3 animate-spin" />{s("The agent is working…", "代理正在执行…")}</p>}
        {!visible.length && <p className="type-caption">{s("Send a message to begin.", "发送消息开始对话。")}</p>}
      </div>
    </div>
    <footer className="shrink-0 space-y-3 border-t p-3">
      {awayFromBottom && <div className="text-center"><Button variant="secondary" size="sm" onClick={latest}><ArrowDown />{s("Latest output", "最新内容")}</Button></div>}
      {error && <Alert variant="destructive"><AlertDescription className="flex flex-wrap items-center gap-2">
        <span className="flex-1">{error}</span>
        <Button variant="ghost" size="sm" onClick={() => { void controller.refresh(); }}>{s("Reload", "重新读取")}</Button>
      </AlertDescription></Alert>}
      {interrupted && !historical && <Alert><AlertDescription className="space-y-2">
        <p>{s("The saved response is incomplete. Start a new branch from the previous complete point to retry. Existing output and tool effects are kept.", "这次响应未完整结束。可从前一个完整位置另起分支重试；已有输出和工具影响不会被撤销。")}</p>
        <Button variant="secondary" size="sm" disabled={!ready || state.busy || !snapshot.selection}
          onClick={() => { void resume(completeAncestor(snapshot.nodes, snapshot.cursor)); }}><RotateCcw />{s("Retry from complete history", "从完整位置重试")}</Button>
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
              onClick={() => { void controller.execute({ type: "cancel", taskId: controller.taskId, agentId: controller.agentId }); }}><Square />{s("Stop", "停止")}</Button>
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

/** 对话历史浮岛：查看节点只改变视图位置，不改变 runtime 游标。 */
export function ConversationHistoryPanel({ session }: { session: ConversationSession }) {
  const { controller } = session;
  const { snapshot, historical, state } = useConversation(session);
  return <IslandPanel title={s("Conversation history", "对话历史")} description={snapshot?.agentName}>
    <div className="flex flex-col gap-1">
      <Button variant={historical ? "ghost" : "secondary"} className="justify-start" onClick={() => controller.inspect(undefined)}>
        {!historical && <Check />}{s("Current conversation", "当前对话")}
      </Button>
      {snapshot?.nodes.filter(node => node.kind !== "extension").map((node, index) =>
        <Button key={node.id} variant={state.inspected === node.id ? "secondary" : "ghost"} className="justify-start font-normal" onClick={() => controller.inspect(node.id)}>
          <GitBranch /><span className="min-w-0 truncate">{index + 1}. {nodeLabel(node)}</span>
        </Button>)}
    </div>
  </IslandPanel>;
}

function nodeLabel(node: ConversationNode): string {
  if (node.kind === "input") return node.text.slice(0, 64);
  if (node.kind === "model") {
    const text = node.parts.find(part => part.kind === "text" && part.text.trim());
    return text?.kind === "text" ? text.text.slice(0, 64) : s("Agent response", "代理响应");
  }
  return node.kind === "compaction" ? s("Conversation summary", "对话摘要") : node.extension;
}
function ModelResponse({ node, agentName }: { node: ModelNode; agentName: string }) {
  const streaming = (complete: boolean) => node.state === "streaming" && !complete;
  return <>
    <p className="type-label flex items-center gap-2"><Bot className="size-3.5" />{agentName}</p>
    {node.parts.map(part => part.kind === "text" ? <Markdown key={part.id} streaming={streaming(part.complete)}>{part.text}</Markdown>
      : part.kind === "thinking" ? <Disclosure key={part.id} label={s("Thinking", "思考")} icon={<Brain className="size-3.5" />}>
        <Markdown streaming={streaming(part.complete)}>{part.text || s("No visible reasoning text.", "没有可显示的思考文本。")}</Markdown></Disclosure>
        : part.kind === "tool" ? <ToolResult key={part.id} part={part} /> : null)}
    {!node.parts.length && node.state === "streaming" && <p className="type-caption">{s("Waiting for the model…", "等待模型响应…")}</p>}
    {node.error && <Alert variant={node.state === "cancelled" ? "default" : "destructive"}><AlertDescription>{node.error.message}</AlertDescription></Alert>}
    {node.usage && <p className="type-caption">{s("Tokens", "Token")} · {s("input", "输入")} {node.usage.input ?? "—"} · {s("output", "输出")} {node.usage.output ?? "—"}</p>}
  </>;
}
const toolLabels: Record<string, string> = {
  proposed: s("Preparing", "准备中"), running: s("Running", "执行中"), succeeded: s("Completed", "已完成"),
  rejected: s("Not allowed", "已拒绝"), failed: s("Failed", "失败"), cancelled: s("Cancelled", "已取消"),
  partial: s("Partially completed", "部分完成"), unknown: s("Outcome unknown", "结果未知"),
};
function ToolResult({ part }: { part: ToolPart }) {
  const status = part.outcome?.kind ?? part.execution;
  const outcome = part.outcome;
  return <Disclosure label={`${part.name} · ${toolLabels[status] ?? status}`} icon={<Wrench className="size-3.5" />}>
    <p className="type-label">{s("Arguments", "参数")}</p><JsonView value={part.complete ? part.arguments : part.argumentsText} />
    {outcome && <>
      <p className="type-label mt-3">{s("Result", "结果")}</p>
      {outcome.kind === "succeeded" || outcome.kind === "partial" ? <JsonView value={outcome.data} />
        : <p className="type-caption">{"error" in outcome ? outcome.error.message : outcome.message}</p>}
      {outcome.kind === "partial" && <p className="type-caption">{outcome.message}</p>}
    </>}
  </Disclosure>;
}
function Disclosure({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return <details className="rounded-md border px-3 py-2">
    <summary className="type-caption flex cursor-pointer select-none items-center gap-2 py-1"><ChevronDown className="size-3" />{icon}{label}</summary>
    <div className="pt-3">{children}</div>
  </details>;
}
function JsonView({ value }: { value: unknown }) {
  return <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed">{typeof value === "string" ? value : JSON.stringify(value, null, 2)}</pre>;
}
