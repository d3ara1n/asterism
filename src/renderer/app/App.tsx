import { CreateAgent } from "../../modules/agent/contract";
import { CreateNote } from "../../modules/notes/contract";
import { CreateDirectory } from "../../modules/filesystem/contract";
import { reference } from "@atelier/sdk/contracts";
import type { WorkbenchOperation } from "../features/session/controller";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ArrowLeft, ChevronDown, Plus, History, House, KeyRound, ListTree, PanelLeft, Settings, X } from "lucide-react";
import type { ApplicationController } from "./controller";
import { t } from "../shared/i18n";
import { Button } from "../shared/ui/button";
import { BrandMark } from "../shared/ui/brand-mark";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "../shared/ui/dropdown-menu";
import { PageState } from "../shared/ui/page-state";
import { Alert, AlertDescription } from "../shared/ui/alert";
import { SettingsPage } from "../features/settings/SettingsPage";
import { HomePage, type StartInput } from "../features/home/HomePage";
import { Workbench, type WorkbenchHandle } from "../features/workbench/Workbench";
import { WorkbenchSurface } from "../features/workbench/WorkbenchSurface";
import { useModuleViews } from "../modules/views";
import { SubmissionIdentity } from "../shared/submission";
import { sessionController } from "../features/session/registry";
import { useConfiguration } from "../features/configuration/state";
import { s } from "../shared/i18n";
import type { AgentSelection } from "../../shared/model";
import type { Json } from "@atelier/sdk/contracts";
import { AddAgentDialog } from "../features/workbench/AddAgentDialog";
import { AddNoteDialog } from "../features/workbench/AddNoteDialog";
import { AddDirectoryDialog } from "../features/workbench/AddDirectoryDialog";
import { Titlebar, Window } from "./Window";
import { Sidebar } from "./Sidebar";
import { Space } from "../shared/weave/Space";
import { Screen, type IslandSpec } from "../shared/weave/Screen";
import { AnimatePresence, motion } from "motion/react";
import { islandTransition } from "../shared/weave/motion";

/** 主屏包含侧栏与首页/工作台；设置为左侧独立屏，切换时主屏整体平移。 */
type MainView = { kind: "home" } | { kind: "conversation"; sessionId: string };
type PageId = "settings" | "main";
type ResourceCreation = { kind: "atelier.core/agent" | "atelier.core/note" | "atelier.core/directory"; sessionId: string };
const idleSubscribe = () => () => {};
const noSession = () => null;

export function App({ controller }: { controller: ApplicationController }) {
  const moduleViews = useModuleViews();
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const workbench = useRef<WorkbenchHandle>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const sidebarToggle = useRef<HTMLButtonElement>(null);
  const [page, setPage] = useState<PageId>("main");
  const [view, setView] = useState<MainView>({ kind: "home" });
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [draft, setDraft] = useState("");
  const [resourceCreation, setResourceCreation] = useState<ResourceCreation | null>(null);
  const start = useStart();
  // 每次导航递增；异步创建完成时据此判断用户是否已离开，不夺走当前视图。
  const navigation = useRef(0);
  const run = useCallback((command: WorkbenchOperation) => sessionController(command.sessionId).mutate(command), []);
  useEffect(() => controller.connect(), [controller]);
  const active = view.kind === "conversation" ? sessionController(view.sessionId) : null;
  const sessionState = useSyncExternalStore(active?.subscribe ?? idleSubscribe, active?.getSnapshot ?? noSession);
  useEffect(() => active?.connect(), [active]);
  const snapshot = state.snapshot;
  const session = sessionState?.snapshot?.workbench ?? null;
  const ready = state.status === "ready";
  const sessionBusy = !!sessionState && (sessionState.busy || sessionState.status !== "ready");
  const sessionLoading = sessionState?.status === "loading";
  const error = state.error ?? sessionState?.error;
  const historical = sessionState?.position.kind === "history";
  const writable = ready && !sessionBusy && !!session && !historical;
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
    setView(next); setPage("main"); setResourceCreation(null);
    controller.clearError();
    focusMain();
  };
  const goHome = () => {
    navigate({ kind: "home" });
  };
  const openSession = (sessionId: string) => {
    navigate({ kind: "conversation", sessionId });
  };
  const startConversation = async (input: StartInput) => {
    if (!ready) return;
    const token = navigation.current;
    const created = await start.submit(input);
    if (!created) return;
    setDraft("");
    if (token === navigation.current) openSession(created);
    void controller.refresh();
  };
  /** 表单绑定会话；提交时按最新画布寻找空位，避免使用过时的位置。 */
  const openResourceCreation = (kind: ResourceCreation["kind"]) => {
    if (active && writable) { active.clearError(); setResourceCreation({ kind, sessionId: active.sessionId }); }
  };
  const createResource = async (input: Json) => {
    if (!active || !resourceCreation || active.sessionId !== resourceCreation.sessionId) return false;
    const { kind } = resourceCreation;
    const canvas = workbench.current?.canvas;
    const placement = canvas?.findPlacement({ kind });
    if (!canvas || !placement || placement.sessionId !== active.sessionId) return false;
    const before = active.getSnapshot();
    const existing = new Set(before.snapshot?.workbench.objects.map(object => object.id));
    const token = navigation.current;
    const contract = [CreateAgent, CreateNote, CreateDirectory].find(value => value.resource.kind === kind);
    if (!contract) return false;
    const result = await active.executeAndRead({ type: "resource.create", sessionId: placement.sessionId, kind, creation: reference(contract), input, position: placement.position });
    const after = active.getSnapshot();
    if (result.ok && after.status === "ready" && token === navigation.current
      && after.navigationVersion === before.navigationVersion && canvas === workbench.current?.canvas) {
      // 受理结果不携带对象身份，从命令之后的真实投影识别新增对象。
      const created = after.snapshot?.workbench.objects.filter(object => !existing.has(object.id) && object.kind === kind) ?? [];
      if (created.length === 1) void canvas.focusObjects([...placement.selectedObjectIds, created[0]!.id]);
    }
    return result.ok;
  };
  // 迟到的回调只能关闭它所属的创建表单。
  const closeResourceCreation = () => setResourceCreation(current => current === resourceCreation ? null : current);
  const creationDialog = {
    busy: sessionBusy,
    error: sessionState?.error,
    onClose: closeResourceCreation,
    onRetry: sessionState?.status === "error" ? () => { void active?.refresh(); } : undefined,
  };
  const addDirectory = () => openResourceCreation("atelier.core/directory");
  const configuration = useConfiguration(ready);
  const addAgent = () => openResourceCreation("atelier.core/agent");
  const createAgent = (selection: AgentSelection, title?: string) => createResource({ selection, ...(title ? { title } : {}) });
  const addNote = () => openResourceCreation("atelier.core/note");
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
        <BrandMark className="size-4 text-primary" /><span className="text-sm font-semibold text-primary">{t.appName}</span><ChevronDown className="text-muted-foreground" />
      </Button></DropdownMenuTrigger><DropdownMenuContent align="start">
        <DropdownMenuItem onSelect={goHome}><House />{t.home}</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => go("settings")}><Settings />{t.menuSettings}</DropdownMenuItem>
      </DropdownMenuContent></DropdownMenu>}
    <span className="h-4 w-px shrink-0 bg-border" />
    <span className="window-session-title" title={inSettings ? t.settings : mainTitle}>{inSettings ? t.settings : mainTitle}</span>
  </>;
  const actions = session ? <>
    <DropdownMenu modal={false}><DropdownMenuTrigger asChild>
      <Button variant="ghost" size="sm" disabled={!writable} aria-label={s("Add to workbench", "添加到工作台")}><Plus /><span className="toolbar-label">{s("Add", "添加")}</span><ChevronDown className="text-muted-foreground" /></Button>
    </DropdownMenuTrigger><DropdownMenuContent align="end">
      <DropdownMenuLabel>{s("Agents", "代理")}</DropdownMenuLabel>
      <DropdownMenuItem onSelect={addAgent}>{moduleViews.resource("atelier.core/agent").icon}{moduleViews.resource("atelier.core/agent").label}…</DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuLabel>{s("Resources", "资源")}</DropdownMenuLabel>
      <DropdownMenuItem onSelect={addNote}>{moduleViews.resource("atelier.core/note").icon}{moduleViews.resource("atelier.core/note").label}…</DropdownMenuItem>
      <DropdownMenuItem onSelect={addDirectory}>{moduleViews.resource("atelier.core/directory").icon}{moduleViews.resource("atelier.core/directory").label}…</DropdownMenuItem>
    </DropdownMenuContent></DropdownMenu>
    <Button variant="ghost" size="sm" onClick={event => workbench.current?.togglePanel("access", event.currentTarget)} aria-label={t.accessLabel}><KeyRound /><span className="toolbar-label">{t.access}</span></Button>
    <Button variant="ghost" size="sm" onClick={event => workbench.current?.togglePanel("objects", event.currentTarget)} aria-label={t.objects}><ListTree /><span className="toolbar-label">{t.objects}</span></Button>
    <Button variant="ghost" size="sm" onClick={event => workbench.current?.togglePanel("history", event.currentTarget)} aria-label={t.history}><History /><span className="toolbar-label">{t.history}</span></Button>
  </> : undefined;

  const conversation = <WorkbenchSurface overlay={!session && !sessionLoading && view.kind === "conversation"
    ? <div className="absolute inset-0 flex items-center justify-center px-6">
      <PageState kind="error" title={t.unavailableTitle} body={sessionState?.error ?? t.unavailableBody}
        action={<Button variant="secondary" onClick={() => { void active?.refresh(); }} disabled={!ready}>{t.retry}</Button>} />
    </div> : undefined}>
    {session && active ? <Workbench key={session.id} ref={workbench} session={session} controller={active} historical={historical}
      ready={ready} busy={sessionBusy} run={run}
      onHome={goHome} /> : null}
  </WorkbenchSurface>;
  const sidebar: IslandSpec = {
    id: "navigation", label: t.appNavigation, width: { min: 224, max: 224 },
    render: () => <Sidebar snapshot={snapshot} status={state.status} busy={state.busy}
      selectedSessionId={view.kind === "conversation" ? view.sessionId : null}
      homeActive={view.kind === "home"}
      onHome={goHome} onSession={openSession} onSettings={() => go("settings")} onHide={hideSidebar}
      onRetry={() => { void controller.refresh(); }} />,
  };
  const main: IslandSpec = {
    id: "main-view", label: mainTitle, width: { min: 440, grow: 1 }, surface: view.kind === "conversation",
    // 首页与工作台双向同时进退场；退场者脱离布局流，不与入场内容叠加占位。
    render: () => <AnimatePresence mode="popLayout" initial={false}>
      {view.kind === "home"
        ? <motion.div key="home" className="h-full" initial={{ opacity: 0, scale: 1.04 }} animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.04 }} transition={islandTransition}>
          <HomePage active={!inSettings} draft={draft} onDraftChange={setDraft} onSettings={() => go("settings")}
            ready={ready} busy={start.busy} submitError={start.error} onStart={startConversation} /></motion.div>
        : <motion.div key="conversation" className="h-full" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }} transition={islandTransition}>
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
    {error && !resourceCreation && <Alert variant="destructive" className="fixed bottom-4 left-1/2 z-[60] w-[min(560px,calc(100%-32px))] -translate-x-1/2 flex items-start gap-3 shadow-md">
      <AlertDescription className="flex-1">{error}</AlertDescription>
      {sessionState?.status === "error" && <Button variant="ghost" size="sm" onClick={() => { void active?.refresh(); }}>{t.retry}</Button>}
      {(state.error || sessionState?.status !== "error") && <Button variant="ghost" size="icon-xs" aria-label={t.dismissError} title={t.dismissError}
        onClick={state.error ? controller.clearError : active?.clearError}><X /></Button>}
    </Alert>}
    {resourceCreation?.kind === "atelier.core/agent" && <AddAgentDialog {...creationDialog} configuration={configuration.snapshot} error={sessionState?.error ?? configuration.error} onCreate={createAgent} />}
    {resourceCreation?.kind === "atelier.core/note" && <AddNoteDialog {...creationDialog} onCreate={createResource} />}
    {resourceCreation?.kind === "atelier.core/directory" && <AddDirectoryDialog {...creationDialog} onCreate={createResource} />}
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
      const result = await window.host.session.execute({ type: "start", ...input, submissionId: identity.current.forInput(input) });
      if (!result.ok) { setError(result.error.message); return null; }
      if (result.reply.kind !== "accepted") throw new Error("Invalid session receipt.");
      identity.current.accepted();
      return result.reply.sessionId;
    } catch {
      setError(s("The connection was lost. Retry the same message to recover the submitted conversation.", "连接中断。重试相同消息可找回已提交的会话。"));
      return null;
    } finally { pending.current = false; setBusy(false); }
  };
  return { busy, error, submit };
}
