import { runtime } from "../runtime";
import { motion, AnimatePresence } from "motion/react";
import { DropdownMenuItem, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuSeparator, DropdownMenuLabel } from "@asterism/ui/ui/dropdown-menu";
import { Button } from "@asterism/ui/ui/button";
import { PanelLeft, ArrowLeft, ChevronDown, House, Settings, Plus, KeyRound, ListTree, History } from "lucide-react";

import { BrandMark } from "@asterism/ui/ui/brand-mark";

import { WorkbenchSurface } from "../features/workbench/WorkbenchSurface";
import { WorkbenchFeedback } from "../features/workbench/WorkbenchFeedback";
import { workbenchPhase } from "../features/workbench/feedback";
import { Workbench, type WorkbenchHandle } from "../features/workbench/Workbench";
import { LayoutMenu } from "../features/workbench/LayoutMenu";
import { WorkbenchStore } from "../features/workbench/context";
import { FocusIsland } from "../features/workbench/FocusIsland";
import { focusIslandId, useFocusedObject } from "../features/workbench/focus";
import { Sidebar } from "./Sidebar";

import { HomePage, type StartInput } from "../features/home/HomePage";
import { createMessageDraft, SubmissionIdentity } from "@asterism/builtin/renderer";
import { startAgentContentTarget } from "@asterism/builtin-api/contracts";
import { contentInput, contentScopeId } from "../features/creation/content";
import { RendererSettingsNavigationProvider, type RendererContentInput } from "@asterism/sdk/renderer";
import { Window, Titlebar } from "./Window";
import { UpdateIndicator } from "./UpdateIndicator";
import { UpdatesProvider } from "../features/updates/state";

import { Space } from "../shared/weave/Space";
import { SettingsPage, type SettingsTarget } from "../features/settings/SettingsPage";
import { SessionArchiveContext } from "../features/settings/SessionsSettings";
import { usePluginSettingsRegistry } from "../modules/settings";
import { Screen, type IslandSpec } from "../shared/weave/Screen";
import { Toaster } from "../shared/ui/sonner";
import { IconButton } from "@asterism/ui/ui/icon-button";
import { operationSucceeded, useStateToast } from "../shared/toast";

import { errorDisplay } from "../../shared/error-display.ts";
import type { UiText } from "@asterism/sdk/contracts";
import { accessMessages } from "../messages/access";
import { appMessages } from "../messages/app";
import { commonMessages } from "@asterism/ui/messages/common";
import { historyMessages } from "../messages/history";
import { objectsMessages } from "../messages/objects";
import { settingsMessages } from "../messages/settings";
import { useI18n } from "../shared/i18n";
import type { WorkbenchOperation } from "../features/session/controller";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import type { ApplicationController } from "./controller";

import { useCreationCoordinator } from "../features/creation/coordinator";
import { sessionController } from "../features/session/registry";

import { islandTransition } from "../shared/weave/motion";

/** The main screen contains the sidebar and home/workbench; settings occupy a separate screen on the left, and the entire main screen slides when switching. */
type MainView = { kind: "home" } | { kind: "conversation"; sessionId: string; overview?: boolean };
type PageId = "settings" | "main";
const idleSubscribe = () => () => {};
const noSession = () => null;

export function App({ controller }: { controller: ApplicationController }) {
  const i18n = useI18n();
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const workbench = useRef<WorkbenchHandle>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const sidebarToggle = useRef<HTMLButtonElement>(null);
  const [page, setPage] = useState<PageId>("main");
  const [settingsTarget, setSettingsTarget] = useState<SettingsTarget | null>(null);
  const pluginSettings = usePluginSettingsRegistry();
  const [view, setView] = useState<MainView>({ kind: "home" });
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [draft] = useState(() => createMessageDraft(() => contentInput(startAgentContentTarget)));
  // Environment outlet for the current workbench: deeper islands on the right and the focus island on the left obtain the session environment through it.
  const [workbenchStore] = useState(() => new WorkbenchStore());
  const start = useStart();
  // Increment on each navigation; when asynchronous creation completes, use this to determine whether the user has left, without taking over the current view.
  const navigation = useRef(0);
  const run = useCallback(async (command: WorkbenchOperation) => operationSucceeded(await sessionController(command.sessionId).execute(command)), []);
  const active = view.kind === "conversation" ? sessionController(view.sessionId) : null;
  const sessionState = useSyncExternalStore(active?.subscribe ?? idleSubscribe, active?.getSnapshot ?? noSession);
  useEffect(() => active?.connect(), [active]);
  const snapshot = state.snapshot;
  const session = sessionState?.data?.workbench ?? null;
  const ready = state.status === "ready";
  const sessionBlocked = !!sessionState && (sessionState.navigating || sessionState.status !== "ready");
  const phase = workbenchPhase(state.status, sessionState);
  const writable = ready && !sessionBlocked && !!session;
  const focusedObjectId = useFocusedObject(view.kind === "conversation" ? view.sessionId : null);
  const inSettings = page === "settings";
  const mainTitle = view.kind === "home" ? i18n.formatMessage(commonMessages.home)
    : session?.title ?? snapshot?.sessions.find(item => item.id === view.sessionId)?.title ?? i18n.formatMessage(commonMessages.conversation);

  const focusMain = () => requestAnimationFrame(() => document.getElementById("screen-main")?.focus({ preventScroll: true }));
  const go = (next: PageId) => {
    if (next === "settings") setSettingsTarget(null);
    if (next === page) return;
    if (next === "settings") returnFocus.current = document.activeElement as HTMLElement | null;
    controller.setVisibleSession(next === "main" && view.kind === "conversation" ? view.sessionId : null);
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
    controller.setVisibleSession(next.kind === "conversation" ? next.sessionId : null);
    setView(next); setPage("main");
    controller.clearError();
    focusMain();
  };
  const goHome = () => {
    navigate({ kind: "home" });
  };
  const openSession = (sessionId: string) => {
    navigate({ kind: "conversation", sessionId });
  };
  const renameSession = (sessionId: string, title: string) => {
    const command = { type: "rename" as const, sessionId, title };
    return active?.sessionId === sessionId ? active.execute(command) : runtime.session.execute(command);
  };
  /** When archiving the current session, return home first, then clean up and reread the session catalog. */
  const archiveSession = async (sessionId: string) => {
    if (view.kind === "conversation" && view.sessionId === sessionId) goHome();
    const result = await runtime.session.execute({ type: "archive", sessionId });
    void controller.refresh();
    return result;
  };
  const restoreSession = async (sessionId: string) => {
    const result = await runtime.session.execute({ type: "restore", sessionId });
    void controller.refresh();
    return result;
  };
  const startConversation = async (input: StartInput) => {
    if (!ready) return;
    const token = navigation.current;
    const created = await start.submit(input, draft.content());
    if (!created) return;
    draft.accepted();
    if (token === navigation.current) openSession(created);
    void controller.refresh();
  };
  const startTemplate = async (templateId: string) => {
    const token = navigation.current;
    const result = await runtime.session.execute({ type: "template.start", templateId });
    if (!result.ok) return errorDisplay(result.error);
    if (result.reply.kind !== "accepted") throw new Error("Invalid template creation receipt.");
    if (token === navigation.current) navigate({ kind: "conversation", sessionId: result.reply.sessionId, overview: true });
    void controller.refresh();
    return null;
  };
  const creation = useCreationCoordinator({ controller: active, canvas: () => workbench.current?.canvas ?? null, writable, ready });
  const menuGroup = (group: "agents" | "resources") => creation.menu.filter(entry => (entry.group ?? "resources") === group)
    .map(entry => <DropdownMenuItem key={entry.id} disabled={creation.pending} onSelect={() => creation.open(entry)}>{entry.icon}{i18n.text(entry.label)}{entry.InputView ? "…" : ""}</DropdownMenuItem>);
  const agentItems = menuGroup("agents"), resourceItems = menuGroup("resources");
  const hideSidebar = () => {
    setSidebarVisible(false);
    requestAnimationFrame(() => sidebarToggle.current?.focus({ preventScroll: true }));
  };

  const titleNavigation = <>
    {!inSettings && <IconButton ref={sidebarToggle} size="icon-xs" label={sidebarVisible ? i18n.formatMessage(appMessages.hideSidebar) : i18n.formatMessage(appMessages.showSidebar)}
      aria-expanded={sidebarVisible} aria-controls={sidebarVisible ? "app-sidebar" : undefined}
      onClick={() => setSidebarVisible(visible => !visible)}><PanelLeft /></IconButton>}
    {inSettings ? <Button variant="ghost" size="sm" onClick={() => go("main")}><ArrowLeft />{i18n.formatMessage(commonMessages.back)}</Button> :
      <DropdownMenu modal={false}><DropdownMenuTrigger asChild><Button variant="ghost" size="sm" aria-label={i18n.formatMessage(appMessages.menu)}>
        <BrandMark className="size-4 text-primary" /><span className="text-sm font-semibold text-primary-text">{i18n.formatMessage(appMessages.appName)}</span><ChevronDown className="text-muted-foreground" />
      </Button></DropdownMenuTrigger><DropdownMenuContent align="start">
        <DropdownMenuItem onSelect={goHome}><House />{i18n.formatMessage(commonMessages.home)}</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => go("settings")}><Settings />{i18n.formatMessage(appMessages.menuSettings)}</DropdownMenuItem>
      </DropdownMenuContent></DropdownMenu>}
    <UpdateIndicator onSettings={() => {
      go("settings");
      setSettingsTarget({ category: "about", sequence: ++navigation.current });
    }} />
    <span className="h-4 w-px shrink-0 bg-border" />
    <span className="window-session-title" title={inSettings ? i18n.formatMessage(settingsMessages.settings) : mainTitle}>{inSettings ? i18n.formatMessage(settingsMessages.settings) : mainTitle}</span>
  </>;
  const actions = session ? <>
    <DropdownMenu modal={false}><DropdownMenuTrigger asChild>
      <Button variant="ghost" size="sm" disabled={!writable} aria-label={i18n.formatMessage(appMessages.addToWorkbench)}><Plus /><span className="toolbar-label">{i18n.formatMessage(appMessages.add)}</span><ChevronDown className="text-muted-foreground" /></Button>
    </DropdownMenuTrigger><DropdownMenuContent align="end">
      {agentItems.length > 0 && <><DropdownMenuLabel>{i18n.formatMessage(appMessages.agents)}</DropdownMenuLabel>{agentItems}</>}
      {agentItems.length > 0 && resourceItems.length > 0 && <DropdownMenuSeparator />}
      {resourceItems.length > 0 && <><DropdownMenuLabel>{i18n.formatMessage(appMessages.resources)}</DropdownMenuLabel>{resourceItems}</>}
    </DropdownMenuContent></DropdownMenu>
    <LayoutMenu key={session.id} canvas={() => workbench.current?.canvas ?? null}
      disabled={!writable || !session.objects.some(object => !session.views.find(view => view.objectId === object.id)?.hidden)} />
    <Button variant="ghost" size="sm" onClick={event => workbench.current?.togglePanel("access", event.currentTarget)} aria-label={i18n.formatMessage(accessMessages.accessLabel)}><KeyRound /><span className="toolbar-label">{i18n.formatMessage(accessMessages.access)}</span></Button>
    <Button variant="ghost" size="sm" onClick={event => workbench.current?.togglePanel("objects", event.currentTarget)} aria-label={i18n.formatMessage(objectsMessages.objects)}><ListTree /><span className="toolbar-label">{i18n.formatMessage(objectsMessages.objects)}</span></Button>
    <Button variant="ghost" size="sm" onClick={event => workbench.current?.togglePanel("history", event.currentTarget)} aria-label={i18n.formatMessage(historyMessages.history)}><History /><span className="toolbar-label">{i18n.formatMessage(historyMessages.history)}</span></Button>
  </> : undefined;

  // The feedback layer and session canvas are sibling nodes, each reset by session; their key spaces must not overlap.
  const conversation = <WorkbenchSurface overlay={<WorkbenchFeedback key={`feedback:${active?.sessionId ?? ""}`} phase={phase} hasContent={!!session}
    error={phase === "unavailable" ? state.error : sessionState?.readError ?? null} onRetry={() => { void active?.refresh(); }} />}>
    {session && active ? <motion.div key={session.id} className="h-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <Workbench ref={workbench} session={session} controller={active}
      active={!inSettings && view.kind === "conversation" && view.sessionId === session.id}
      overview={view.kind === "conversation" && view.overview}
      ready={writable} run={run} store={workbenchStore}
      onHome={goHome} canDrop={creation.canDrop} onDropItems={creation.drop} /></motion.div> : null}
  </WorkbenchSurface>;
  const sidebar: IslandSpec = {
    id: "navigation", label: i18n.formatMessage(appMessages.appNavigation), width: { min: 224, max: 224 },
    render: () => <Sidebar snapshot={snapshot} status={state.status} busy={state.busy}
      resourceStatuses={state.resourceStatuses}
      selectedSessionId={view.kind === "conversation" ? view.sessionId : null}
      renameDisabledSessionId={active && !writable ? active.sessionId : null}
      onRename={renameSession}
      onArchive={archiveSession}
      onTemplateSaved={() => { void controller.refresh({ quiet: true }); }}
      homeActive={view.kind === "home"}
      onHome={goHome} onSession={openSession} onSettings={() => go("settings")} onHide={hideSidebar}
      onRetry={() => { void controller.refresh(); }} />,
  };
  // Focus island: a controlled leading island between the sidebar and workbench; its content switches with the session, and it exits when returning home.
  const focusTitle = focusedObjectId ? session?.objects.find(object => object.id === focusedObjectId)?.title : undefined;
  const focus: IslandSpec | null = view.kind === "conversation" && focusedObjectId ? {
    id: focusIslandId, label: focusTitle ?? i18n.formatMessage(objectsMessages.focusIsland), width: { min: 480, grow: 1.5 },
    render: () => <FocusIsland store={workbenchStore} sessionId={view.sessionId} objectId={focusedObjectId} onHome={goHome} />,
  } : null;
  const main: IslandSpec = {
    id: "main-view", label: mainTitle, width: { min: 440, grow: 1 }, surface: view.kind === "conversation",
    // Home and workbench enter and exit simultaneously in both directions; exiting content leaves the layout flow so it does not occupy space alongside entering content.
    render: () => <AnimatePresence mode="popLayout" initial={false}>
      {view.kind === "home"
        ? <motion.div key="home" className="h-full" initial={{ opacity: 0, scale: 1.04 }} animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.04 }} transition={islandTransition}>
          <HomePage active={!inSettings} draft={draft} onSettings={category => {
            go("settings");
            setSettingsTarget({ category, sequence: ++navigation.current });
          }}
            templates={snapshot?.templates ?? []} onTemplateStart={startTemplate} onTemplatesChanged={() => { void controller.refresh({ quiet: true }); }}
            ready={ready} busy={start.busy} submitError={start.error} onStart={startConversation} /></motion.div>
        : <motion.div key="conversation" className="h-full" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }} transition={islandTransition}>
          {conversation}</motion.div>}
    </AnimatePresence>,
  };
  // The workbench persistently displays session read failures; the same entry handles backend unavailability while the workbench is visible.
  const unavailableInWorkbench = view.kind === "conversation" && !inSettings && phase === "unavailable";
  const appError = unavailableInWorkbench ? null : state.error;
  useStateToast("app-error", appError ? i18n.text(appError) : null, {
    tone: "error",
    onDismiss: controller.clearError,
  });

  return <UpdatesProvider><RendererSettingsNavigationProvider value={{ open(pluginId, location) {
    const settings = pluginSettings.pages.get(pluginId);
    if (!settings) throw new Error(`Plugin ${pluginId} has no available settings page.`);
    if (location !== undefined && !settings.locations?.includes(location)) throw new Error(`Unknown settings location: ${location}`);
    go("settings");
    setSettingsTarget({ pluginId, location, sequence: ++navigation.current });
  } }}>
    <Window skipTarget={`screen-${page}`} titlebar={<Titlebar navigation={titleNavigation} actions={actions} actionsHidden={inSettings} />}>
      <Space active={page} screens={[
        { id: "settings", label: i18n.formatMessage(settingsMessages.settings), surface: false, content:
          <SessionArchiveContext.Provider value={{ snapshot, restore: restoreSession }}><SettingsPage active={inSettings} target={settingsTarget} /></SessionArchiveContext.Provider> },
        { id: "main", label: mainTitle, surface: false,
          // Close deeper islands to the right of the workbench when switching sessions.
          content: <Screen label={i18n.formatMessage(appMessages.appNavigation)} leading={[...(sidebarVisible ? [sidebar] : []), ...(focus ? [focus] : [])]} root={main} resetKey={view.kind === "conversation" ? view.sessionId : "home"} className="h-full" /> },
      ]} />
    </Window>
    <Toaster position="bottom-center" containerAriaLabel={i18n.formatMessage(commonMessages.notifications)}
      toastOptions={{ closeButtonAriaLabel: i18n.formatMessage(commonMessages.close) }} />
    {creation.element}
  </RendererSettingsNavigationProvider></UpdatesProvider>;
}

/** First send: submit only once at a time; after a connection interruption, reuse the submission identity for identical input to recover the created session. */
function useStart() {

  const identity = useRef(new SubmissionIdentity());
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<UiText | null>(null);
  const submit = async (input: StartInput, content: RendererContentInput): Promise<string | null> => {
    if (pending.current) return null;
    pending.current = true; setBusy(true); setError(null);
    try {
      const result = await runtime.session.execute({ type: "start", ...input, submissionId: identity.current.forInput(input),
        contentScopeId: await contentScopeId(content, startAgentContentTarget) });
      if (!result.ok) { setError(errorDisplay(result.error)); return null; }
      if (result.reply.kind !== "accepted") throw new Error("Invalid session receipt.");
      identity.current.accepted();
      await content.close();
      return result.reply.sessionId;
    } catch {
      setError(appMessages.connectionLost);
      return null;
    } finally { pending.current = false; setBusy(false); }
  };
  return { busy, error, submit };
}
