import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ArrowLeft, ChevronDown, FileText, Folder, History, House, KeyRound, ListTree, PanelLeft, Settings, X } from "lucide-react";
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
import { Workbench, type WorkbenchHandle } from "../features/workbench/Workbench";
import { AddDirectoryDialog } from "../features/workbench/AddDirectoryDialog";
import { AccessDialog } from "../features/workbench/AccessDialog";
import { CreateNoteDialog } from "../features/workbench/CreateNoteDialog";
import type { ResourcePlacement } from "../features/workbench/placement";
import { SubmissionIdentity } from "../features/conversation/controller";
import { sessionController } from "../features/conversation/registry";
import { s } from "../features/configuration/state";
import { Titlebar, Window } from "./Window";
import { Sidebar } from "./Sidebar";
import { Space } from "../shared/weave/Space";
import { Screen, type IslandSpec } from "../shared/weave/Screen";
import { AnimatePresence, motion } from "motion/react";
import { islandTransition } from "../shared/weave/motion";

/** 主屏包含侧栏与首页/工作台；设置为左侧独立屏，切换时主屏整体平移。 */
type MainView = { kind: "home" } | { kind: "conversation"; sessionId: string };
type PageId = "settings" | "main";

export function App({ controller }: { controller: ApplicationController }) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const workbench = useRef<WorkbenchHandle>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const sidebarToggle = useRef<HTMLButtonElement>(null);
  const [page, setPage] = useState<PageId>("main");
  const [view, setView] = useState<MainView>({ kind: "home" });
  const currentView = useRef(view);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [draft, setDraft] = useState("");
  const [conversationDrafts, setConversationDrafts] = useState<Record<string, string>>({});
  const [creation, setCreation] = useState<ResourcePlacement | null>(null);
  const [accessOpen, setAccessOpen] = useState(false);
  const [directory, setDirectory] = useState<ResourcePlacement | null>(null);
  const start = useStart();
  // 每次导航递增；异步创建完成时据此判断用户是否已离开，不夺走当前视图。
  const navigation = useRef(0);
  const run = useCallback((command: Command) => controller.run(command, () =>
    command.session_id ? sessionController(command.session_id).getSnapshot().inspected : undefined), [controller]);
  useEffect(() => controller.connect(), [controller]);
  const snapshot = state.snapshot;
  // 晚到响应不能把首页或另一个会话替换为旧工作台。
  const session = view.kind === "conversation" && snapshot?.session?.id === view.sessionId ? snapshot.session : null;
  const ready = state.status === "ready";
  const writable = ready && !state.busy && !!session && !session.at;
  const inSettings = page === "settings";
  const mainTitle = view.kind === "home" ? t.home
    : session?.title ?? snapshot?.sessions.find(item => item.id === view.sessionId)?.title ?? t.conversation;

  const focusMain = () => requestAnimationFrame(() => document.getElementById("screen-main")?.focus({ preventScroll: true }));
  const go = (next: PageId) => {
    if (next === page) return;
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
    navigation.current++;
    currentView.current = next;
    setView(next); setPage("main"); setCreation(null); setDirectory(null); setAccessOpen(false);
    controller.clearError();
    focusMain();
  };
  const goHome = () => {
    navigate({ kind: "home" });
    // 清除已打开的正文，只保留列表；队列也保证在途读取之后最终回到无任务状态。
    if (ready || state.busy) void run({ type: "workspace.read" });
  };
  const openSession = (sessionId: string) => {
    navigate({ kind: "conversation", sessionId });
    void run({ type: "workspace.read", session_id: sessionId });
  };
  const startConversation = async (input: StartInput) => {
    if (!ready) return;
    const token = navigation.current;
    const created = await start.submit(input);
    if (!created) return;
    setDraft("");
    if (token === navigation.current) openSession(created);
    else {
      const current = currentView.current;
      void run({ type: "workspace.read", ...(current.kind === "conversation" ? { session_id: current.sessionId } : {}) });
    }
  };
  const addDirectory = () => { const placement = workbench.current?.resourcePlacement(); if (placement) setDirectory(placement); };
  const addNote = () => { const placement = workbench.current?.resourcePlacement(); if (placement) setCreation(placement); };
  const hideSidebar = () => {
    setSidebarVisible(false);
    requestAnimationFrame(() => sidebarToggle.current?.focus({ preventScroll: true }));
  };

  const titleNavigation = <>
    {!inSettings && <Button ref={sidebarToggle} variant="ghost" size="icon-xs" aria-label={sidebarVisible ? t.hideSidebar : t.showSidebar} title={sidebarVisible ? t.hideSidebar : t.showSidebar}
      aria-expanded={sidebarVisible} aria-controls={sidebarVisible ? "app-sidebar" : undefined}
      onClick={() => setSidebarVisible(visible => !visible)}><PanelLeft /></Button>}
    {inSettings ? <Button variant="ghost" size="sm" onClick={() => go("main")}><ArrowLeft />{t.back}</Button> :
      <DropdownMenu modal={false}><DropdownMenuTrigger asChild><Button variant="ghost" size="sm" aria-label={t.menu}>
        <WeftMark className="size-4 text-primary" /><span className="text-sm font-semibold text-primary">{t.appName}</span><ChevronDown className="text-muted-foreground" />
      </Button></DropdownMenuTrigger><DropdownMenuContent align="start">
        <DropdownMenuItem onSelect={goHome}><House />{t.home}</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => go("settings")}><Settings />{t.menuSettings}</DropdownMenuItem>
      </DropdownMenuContent></DropdownMenu>}
    <span className="h-4 w-px shrink-0 bg-border" />
    <span className="window-session-title" title={inSettings ? t.settings : mainTitle}>{inSettings ? t.settings : mainTitle}</span>
  </>;
  const actions = session ? <>
    <Button variant="ghost" size="sm" disabled={!writable} onClick={addNote} aria-label={t.addNoteLabel}><FileText /><span className="toolbar-label">{t.addNote}</span></Button>
    <Button variant="ghost" size="sm" disabled={!writable} onClick={addDirectory} aria-label={s("Add directory", "添加目录")}><Folder /><span className="toolbar-label">{s("Directory", "目录")}</span></Button>
    <Button variant="ghost" size="sm" disabled={!writable} onClick={() => setAccessOpen(true)} aria-label={t.accessLabel}><KeyRound /><span className="toolbar-label">{t.access}</span></Button>
    <Button variant="ghost" size="sm" onClick={event => workbench.current?.togglePanel("objects", event.currentTarget)} aria-label={t.objects}><ListTree /><span className="toolbar-label">{t.objects}</span></Button>
    <Button variant="ghost" size="sm" onClick={event => workbench.current?.togglePanel("history", event.currentTarget)} aria-label={t.history}><History /><span className="toolbar-label">{t.history}</span></Button>
  </> : undefined;

  const conversation = session
    ? <Workbench key={session.id} ref={workbench} session={session} ready={ready} busy={state.busy} run={run}
      draft={conversationDrafts[session.id] ?? ""} onDraftChange={value => setConversationDrafts(drafts => ({ ...drafts, [session.id]: value }))}
      onHome={goHome} />
    : <div className="flex h-full items-center justify-center px-6"><div>
      <PageState kind={state.busy ? "loading" : "error"} title={state.busy ? t.openingTitle : t.unavailableTitle}
        body={state.busy ? t.openingBody : t.unavailableBody} />
      {!state.busy && view.kind === "conversation" && <div className="mt-4 text-center">
        <Button variant="secondary" onClick={() => openSession(view.sessionId)} disabled={!ready}>{t.retry}</Button>
      </div>}
    </div></div>;
  const sidebar: IslandSpec = {
    id: "navigation", label: t.appNavigation, width: { min: 224, max: 224 },
    render: () => <Sidebar snapshot={snapshot} status={state.status} busy={state.busy}
      selectedSessionId={view.kind === "conversation" ? view.sessionId : null}
      homeActive={view.kind === "home"}
      onHome={goHome} onSession={openSession} onSettings={() => go("settings")} onHide={hideSidebar}
      onRetry={() => { void run({ type: "workspace.read" }); }} />,
  };
  const main: IslandSpec = {
    id: "main-view", label: mainTitle, width: { min: 440, grow: 1 }, surface: view.kind === "conversation",
    // 首页放大淡出、工作台放大淡入；退场者脱离布局流，不与入场内容叠加占位。
    render: () => <AnimatePresence mode="popLayout" initial={false}>
      {view.kind === "home"
        ? <motion.div key="home" className="h-full" exit={{ opacity: 0, scale: 1.04 }} transition={islandTransition}>
          <HomePage active={!inSettings} draft={draft} onDraftChange={setDraft} onSettings={() => go("settings")}
            ready={ready} busy={start.busy} submitError={start.error} onStart={startConversation} /></motion.div>
        : <motion.div key="conversation" className="h-full" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={islandTransition}>
          {conversation}</motion.div>}
    </AnimatePresence>,
  };

  return <>
    <Window skipTarget={`screen-${page}`} titlebar={<Titlebar navigation={titleNavigation} actions={actions} actionsHidden={inSettings} />}>
      <Space active={page} screens={[
        { id: "settings", label: t.settings, surface: false, content: <SettingsPage active={inSettings} /> },
        { id: "main", label: mainTitle, surface: false,
          // 切换会话时关闭工作台右侧的更深浮岛。
          content: <Screen label={t.appNavigation} leading={sidebarVisible ? [sidebar] : []} root={main} resetKey={view.kind === "conversation" ? view.sessionId : "home"} className="h-full" /> },
      ]} />
    </Window>
    {state.error && <Alert variant="destructive" className="fixed bottom-4 left-1/2 z-[60] w-[min(560px,calc(100%-32px))] -translate-x-1/2 flex items-start gap-3 shadow-md">
      <AlertDescription className="flex-1">{state.error}</AlertDescription>
      <Button variant="ghost" size="icon-xs" aria-label={t.dismissError} title={t.dismissError} onClick={controller.clearError}><X /></Button>
    </Alert>}
    {creation && <CreateNoteDialog creation={creation} busy={state.busy} run={run} onClose={() => setCreation(null)} />}
    {directory && <AddDirectoryDialog creation={directory} busy={state.busy} run={run} onClose={() => setDirectory(null)} />}
    {accessOpen && session && <AccessDialog session={session} busy={state.busy} run={run} onClose={() => setAccessOpen(false)} />}
  </>;
}

/** 首次发送：同一时刻只提交一次；连接中断后相同输入复用提交身份以找回已创建的会话。 */
function useStart() {
  const identity = useRef(new SubmissionIdentity());
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (input: StartInput): Promise<string | null> => {
    if (pending.current) return null;
    pending.current = true; setBusy(true); setError(null);
    try {
      const result = await window.weft.session.execute({ type: "start", ...input, submissionId: identity.current.forInput(input) });
      if (!result.ok) { setError(result.error.message); return null; }
      identity.current.accepted();
      return result.snapshot.sessionId;
    } catch {
      setError(s("The connection was lost. Retry the same message to recover the submitted conversation.", "连接中断。重试相同消息可找回已提交的会话。"));
      return null;
    } finally { pending.current = false; setBusy(false); }
  };
  return { busy, error, submit };
}
