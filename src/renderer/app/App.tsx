import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ArrowLeft, ChevronDown, FileText, History, House, KeyRound, ListTree, PanelLeft, Settings, X } from "lucide-react";
import type { Command } from "../../shared/contracts";
import type { ApplicationController } from "./controller";
import { t } from "../shared/i18n";
import { Button } from "../shared/ui/button";
import { WeftMark } from "../shared/ui/weft-mark";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "../shared/ui/dropdown-menu";
import { PageState } from "../shared/ui/page-state";
import { Alert, AlertDescription } from "../shared/ui/alert";
import { Badge } from "../shared/ui/badge";
import { Workbench } from "../features/workbench/Workbench";
import { AccessDialog } from "../features/workbench/AccessDialog";
import { SidePanel, type PanelKind } from "../features/workbench/SidePanel";
import { CreateNoteDialog, type NoteCreation } from "../features/workbench/CreateNoteDialog";
import { SettingsPage } from "../features/settings/SettingsPage";
import { HomePage } from "../features/home/HomePage";
import { placeObject } from "../features/workbench/placement";
import { Titlebar, Window } from "./Window";
import { Sidebar } from "./Sidebar";
import { Space } from "../shared/weave/Space";
import { Screen, type IslandSpec } from "../shared/weave/Screen";

/** 主屏包含侧栏与首页/工作台；设置为左侧独立屏，切换时主屏整体平移。 */
type MainView = { kind: "home" } | { kind: "conversation"; taskId: string };
type PageId = "settings" | "main";

export function App({ controller }: { controller: ApplicationController }) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const workbenchRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const sidebarToggle = useRef<HTMLButtonElement>(null);
  const [page, setPage] = useState<PageId>("main");
  const [view, setView] = useState<MainView>({ kind: "home" });
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [draft, setDraft] = useState("");
  const [panel, setPanel] = useState<PanelKind | null>(null);
  const [creation, setCreation] = useState<NoteCreation | null>(null);
  const [accessOpen, setAccessOpen] = useState(false);
  const run = useCallback((command: Command) => controller.run(command), [controller]);
  useEffect(() => controller.connect(), [controller]);
  const snapshot = state.snapshot;
  // 晚到响应不能把首页或另一个会话替换为旧工作台。
  const task = view.kind === "conversation" && snapshot?.task?.id === view.taskId ? snapshot.task : null;
  const ready = state.status === "ready";
  const writable = ready && !state.busy && !!task && !task.historical;
  const inSettings = page === "settings";
  const mainTitle = view.kind === "home" ? t.home : task?.title ?? t.conversation;

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
    setView(next); setPage("main"); setPanel(null); setCreation(null); setAccessOpen(false);
    controller.clearError();
    focusMain();
  };
  const goHome = () => {
    navigate({ kind: "home" });
    // 清除已打开的正文，只保留列表；队列也保证在途读取之后最终回到无任务状态。
    if (ready || state.busy) void run({ type: "workspace.read" });
  };
  const openTask = (taskId: string) => {
    navigate({ kind: "conversation", taskId });
    void run({ type: "workspace.read", task_id: taskId });
  };
  const addNote = () => {
    const bounds = workbenchRef.current?.getBoundingClientRect();
    if (task && bounds) setCreation({ taskId: task.id, position: placeObject(task, bounds.width, bounds.height) });
  };
  const togglePanel = (kind: PanelKind) => setPanel(panel === kind ? null : kind);
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
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => go("settings")}><Settings />{t.menuSettings}</DropdownMenuItem>
      </DropdownMenuContent></DropdownMenu>}
    <span className="h-4 w-px shrink-0 bg-border" />
    <span className="window-task-title" title={inSettings ? t.settings : mainTitle}>{inSettings ? t.settings : mainTitle}</span>
    {!inSettings && task && <Button size="sm" variant="ghost" onClick={() => togglePanel("history")} aria-expanded={panel === "history"}><History />{t.history}</Button>}
  </>;
  const actions = task ? <>
    <Button variant="ghost" size="sm" disabled={!writable} onClick={addNote} aria-label={t.addNoteLabel}><FileText /><span className="toolbar-label">{t.addNote}</span></Button>
    <Button variant="ghost" size="sm" disabled={!writable} onClick={() => setAccessOpen(true)} aria-label={t.accessLabel}><KeyRound /><span className="toolbar-label">{t.access}</span></Button>
    <Button variant="ghost" size="sm" onClick={() => togglePanel("objects")} aria-expanded={panel === "objects"} aria-label={t.objects}><ListTree /><span className="toolbar-label">{t.objects}</span></Button>
  </> : undefined;

  const workbench = <div ref={workbenchRef} className="overlay-inset relative h-full overflow-hidden rounded-lg bg-background">
    {task ? <Workbench key={task.id + ":" + (task.historical ? task.at_seq : "live")} task={task} run={run} /> :
      <div className="flex h-full items-center justify-center px-6"><div>
        <PageState kind={state.busy ? "loading" : "error"} title={state.busy ? t.openingTitle : t.unavailableTitle}
          body={state.busy ? t.openingBody : t.unavailableBody} />
        {!state.busy && view.kind === "conversation" && <div className="mt-4 text-center">
          <Button variant="secondary" onClick={() => openTask(view.taskId)} disabled={!ready}>{t.retry}</Button>
        </div>}
      </div></div>}
    {task && task.objects.length === 0 && <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <p className="type-caption">{task.historical ? t.noObjectsHistorical : t.noObjects}</p>
    </div>}
    {panel && task && <SidePanel panel={panel} snapshot={snapshot} busy={state.busy} writable={writable} run={run} onClose={() => setPanel(null)} />}
    {task?.historical && <div className="surface-floating absolute p-1 bottom-[var(--overlay-inset)] left-1/2 z-10 flex -translate-x-1/2 items-center gap-3 whitespace-nowrap pl-3 text-sm">
      <span>{t.viewingHistory}</span>
      <Button size="sm" disabled={state.busy} onClick={() => { void run({ type: "workspace.read", task_id: task.id }); }}>{t.backToLive}</Button>
    </div>}
    {task && <Badge variant="outline" role="status" className={`absolute left-[var(--overlay-inset)] top-[var(--overlay-inset)] z-10 bg-card text-muted-foreground transition-opacity ${panel ? "opacity-0" : ""}`}>
      {state.busy ? t.statusBusy : ready ? t.statusReady : t.statusUnavailable}
    </Badge>}
  </div>;
  const sidebar: IslandSpec = {
    id: "navigation", label: t.appNavigation, width: { min: 224, max: 224 },
    render: () => <Sidebar snapshot={snapshot} status={state.status} busy={state.busy}
      selectedTaskId={view.kind === "conversation" ? view.taskId : null}
      homeActive={view.kind === "home"}
      onHome={goHome} onTask={openTask} onSettings={() => go("settings")} onHide={hideSidebar}
      onRetry={() => { void run({ type: "workspace.read" }); }} />,
  };
  const main: IslandSpec = {
    id: "main-view", label: mainTitle, width: { min: 440, grow: 1 }, surface: view.kind === "conversation",
    render: () => view.kind === "home" ? <HomePage active={!inSettings} draft={draft} onDraftChange={setDraft} onSettings={() => go("settings")} /> : workbench,
  };

  return <>
    <Window skipTarget={`screen-${page}`} titlebar={<Titlebar navigation={navigation} actions={actions} actionsHidden={inSettings} />}>
      <Space active={page} screens={[
        { id: "settings", label: t.settings, surface: false, content: <SettingsPage active={inSettings} /> },
        { id: "main", label: mainTitle, surface: false,
          content: <Screen label={t.appNavigation} leading={sidebarVisible ? [sidebar] : []} root={main} className="h-full" /> },
      ]} />
    </Window>
    {state.error && <Alert variant="destructive" className="fixed bottom-4 left-1/2 z-[60] w-[min(560px,calc(100%-32px))] -translate-x-1/2 flex items-start gap-3 shadow-md">
      <AlertDescription className="flex-1">{state.error}</AlertDescription>
      <Button variant="ghost" size="icon-xs" aria-label={t.dismissError} title={t.dismissError} onClick={controller.clearError}><X /></Button>
    </Alert>}
    {creation && <CreateNoteDialog creation={creation} busy={state.busy} run={run} onClose={() => setCreation(null)} />}
    {accessOpen && task && <AccessDialog task={task} busy={state.busy} run={run} onClose={() => setAccessOpen(false)} />}
  </>;
}
