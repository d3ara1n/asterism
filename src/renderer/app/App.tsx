import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ArrowLeft, ChevronDown, House, PanelLeft, Settings, X } from "lucide-react";
import type { Command } from "../../shared/contracts";
import type { ApplicationController } from "./controller";
import { t } from "../shared/i18n";
import { Button } from "../shared/ui/button";
import { WeftMark } from "../shared/ui/weft-mark";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "../shared/ui/dropdown-menu";
import { PageState } from "../shared/ui/page-state";
import { Alert, AlertDescription } from "../shared/ui/alert";
import { SettingsPage } from "../features/settings/SettingsPage";
import { HomePage, type StartInput } from "../features/home/HomePage";
import { Conversation } from "../features/conversation/Conversation";
import { Workbench } from "../features/workbench/Workbench";
import { SubmissionIdentity } from "../features/conversation/controller";
import { s } from "../features/configuration/state";
import { Titlebar, Window } from "./Window";
import { Sidebar } from "./Sidebar";
import { Space } from "../shared/weave/Space";
import { Screen, type IslandSpec } from "../shared/weave/Screen";

type MainView = { kind: "home" } | { kind: "conversation"; taskId: string; agentId?: string };
type PageId = "settings" | "main";

export function App({ controller }: { controller: ApplicationController }) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const returnFocus = useRef<HTMLElement | null>(null);
  const sidebarToggle = useRef<HTMLButtonElement>(null);
  const [page, setPage] = useState<PageId>("main");
  const [view, setView] = useState<MainView>({ kind: "home" });
  const currentView = useRef(view); currentView.current = view;
  const navigationVersion = useRef(0);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [draft, setDraft] = useState("");
  const [conversationDrafts, setConversationDrafts] = useState<Record<string, string>>({});
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const startingRef = useRef(false);
  const submission = useRef(new SubmissionIdentity());
  const conversationSubmissions = useRef(new Map<string, SubmissionIdentity>());
  const run = useCallback((command: Command) => controller.run(command), [controller]);
  useEffect(() => controller.connect(), [controller]);
  const snapshot = state.snapshot;
  const task = view.kind === "conversation" && snapshot?.task?.id === view.taskId ? snapshot.task : null;
  const agentId = view.kind === "conversation" ? view.agentId ?? task?.objects.find(object => object.kind === "agent")?.id : undefined;
  const ready = state.status === "ready";
  const inSettings = page === "settings";
  const mainTitle = view.kind === "home" ? t.home : task?.title ?? snapshot?.tasks.find(task => task.id === view.taskId)?.title ?? t.conversation;
  const focusMain = () => requestAnimationFrame(() => document.getElementById("screen-main")?.focus({ preventScroll: true }));
  const go = (next: PageId) => {
    if (next === page) return;
    navigationVersion.current++;
    if (next === "settings") returnFocus.current = document.activeElement as HTMLElement | null;
    setPage(next);
    requestAnimationFrame(() => {
      if (next === "main" && returnFocus.current?.isConnected) returnFocus.current.focus({ preventScroll: true });
      else document.getElementById(`screen-${next}`)?.focus({ preventScroll: true });
    });
  };
  useEffect(() => {
    if (!inSettings) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !event.defaultPrevented) go("main"); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const navigate = (next: MainView) => {
    navigationVersion.current++; currentView.current = next;
    setView(next); setPage("main"); controller.clearError(); focusMain();
  };
  const goHome = () => {
    navigate({ kind: "home" });
    if (ready || state.busy) void run({ type: "workspace.read" });
  };
  const openTask = (taskId: string) => {
    navigate({ kind: "conversation", taskId });
    void run({ type: "workspace.read", task_id: taskId });
  };
  const start = async (input: StartInput) => {
    if (startingRef.current || !ready) return;
    startingRef.current = true; setStarting(true); setStartError(null);
    const version = navigationVersion.current;
    try {
      const result = await window.weft.conversation.execute({ type: "start", ...input, submissionId: submission.current.forInput(input) });
      if (!result.ok) { setStartError(result.error.message); return; }
      submission.current.accepted(); setDraft("");
      // 创建过程中用户若已经导航，完成结果只刷新列表，不夺走当前视图。
      if (version === navigationVersion.current) navigate({ kind: "conversation", taskId: result.snapshot.taskId, agentId: result.snapshot.agentId });
      const current = currentView.current;
      void run({ type: "workspace.read", ...(current.kind === "conversation" ? { task_id: current.taskId } : {}) });
    } catch { setStartError(s("The connection was lost. Retry the same message to recover the submitted conversation.", "连接中断。重试相同消息可找回已提交的会话。")); }
    finally { startingRef.current = false; setStarting(false); }
  };
  const hideSidebar = () => {
    setSidebarVisible(false);
    requestAnimationFrame(() => sidebarToggle.current?.focus({ preventScroll: true }));
  };
  const navigation = <>
    {!inSettings && <Button ref={sidebarToggle} variant="ghost" size="icon-xs" aria-label={sidebarVisible ? t.hideSidebar : t.showSidebar} title={sidebarVisible ? t.hideSidebar : t.showSidebar}
      aria-expanded={sidebarVisible} aria-controls={sidebarVisible ? "app-sidebar" : undefined}
      onClick={() => setSidebarVisible(visible => !visible)}><PanelLeft /></Button>}
    {inSettings ? <Button variant="ghost" size="sm" onClick={() => go("main")}><ArrowLeft />{t.back}</Button> :
      <DropdownMenu modal={false}><DropdownMenuTrigger asChild><Button variant="ghost" size="sm" aria-label={t.menu}>
        <WeftMark className="size-4 text-primary" /><span className="text-sm font-semibold text-primary">{t.appName}</span><ChevronDown className="text-muted-foreground" />
      </Button></DropdownMenuTrigger><DropdownMenuContent align="start">
        <DropdownMenuItem onSelect={goHome}><House />{t.home}</DropdownMenuItem>
        <DropdownMenuSeparator /><DropdownMenuItem onSelect={() => go("settings")}><Settings />{t.menuSettings}</DropdownMenuItem>
      </DropdownMenuContent></DropdownMenu>}
    <span className="h-4 w-px shrink-0 bg-border" />
    <span className="window-task-title" title={inSettings ? t.settings : mainTitle}>{inSettings ? t.settings : mainTitle}</span>
  </>;
  if (view.kind === "conversation" && !conversationSubmissions.current.has(view.taskId)) conversationSubmissions.current.set(view.taskId, new SubmissionIdentity());
  const conversation = view.kind === "conversation" && task && agentId ? <Workbench key={task.id} task={task} agentId={agentId} run={run} busy={state.busy || !ready}
    renderAgent={headerActions => <Conversation key={`${view.taskId}:${agentId}`} taskId={view.taskId} agentId={agentId} ready={ready}
    headerActions={headerActions}
    onTurnEnded={() => { void run({ type: "workspace.read", task_id: task.id }); }}
    submission={conversationSubmissions.current.get(view.taskId)!}
    draft={conversationDrafts[view.taskId] ?? ""} onDraftChange={value => setConversationDrafts(drafts => ({ ...drafts, [view.taskId]: value }))} onHome={goHome} />} />
    : <div className="flex h-full items-center justify-center px-6"><div className="max-w-md space-y-4">
      <PageState kind={state.busy ? "loading" : "error"} title={state.busy ? t.openingTitle : t.unavailableTitle}
        body={state.busy ? t.openingBody : task ? s("This earlier workspace has no main agent conversation. Start a new conversation from Home.", "这个早期工作台没有主代理对话，请从首页新建。") : t.unavailableBody} />
      {!state.busy && <Button variant="secondary" onClick={task ? goHome : () => { if (view.kind === "conversation") openTask(view.taskId); }} disabled={!ready}>{task ? t.newConversation : t.retry}</Button>}
    </div></div>;
  const sidebar: IslandSpec = {
    id: "navigation", label: t.appNavigation, width: { min: 224, max: 224 },
    render: () => <Sidebar snapshot={snapshot} status={state.status} busy={state.busy}
      selectedTaskId={view.kind === "conversation" ? view.taskId : null} homeActive={view.kind === "home"}
      onHome={goHome} onTask={openTask} onSettings={() => go("settings")} onHide={hideSidebar}
      onRetry={() => { void run({ type: "workspace.read" }); }} />,
  };
  const main: IslandSpec = {
    id: "main-view", label: mainTitle, width: { min: 440, grow: 1 }, surface: view.kind === "conversation",
    render: () => view.kind === "home" ? <HomePage active={!inSettings} draft={draft} onDraftChange={setDraft} onSettings={() => go("settings")}
      ready={ready} busy={starting} submitError={startError} onStart={start} /> : conversation,
  };
  return <>
    <Window skipTarget={`screen-${page}`} titlebar={<Titlebar navigation={navigation} />}>
      <Space active={page} screens={[
        { id: "settings", label: t.settings, surface: false, content: <SettingsPage active={inSettings} /> },
        { id: "main", label: mainTitle, surface: false, content: <Screen label={t.appNavigation} leading={sidebarVisible ? [sidebar] : []} root={main} className="h-full" /> },
      ]} />
    </Window>
    {state.error && <Alert variant="destructive" className="fixed bottom-4 left-1/2 z-[60] w-[min(560px,calc(100%-32px))] -translate-x-1/2 flex items-start gap-3 shadow-md">
      <AlertDescription className="flex-1">{state.error}</AlertDescription>
      <Button variant="ghost" size="icon-xs" aria-label={t.dismissError} title={t.dismissError} onClick={controller.clearError}><X /></Button>
    </Alert>}
  </>;
}
