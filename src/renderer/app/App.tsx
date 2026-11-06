import { runtime } from "../runtime";
import { motion, AnimatePresence } from "motion/react";
import { DropdownMenuItem, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuSeparator, DropdownMenuLabel } from "@asterism-app/ui/ui/dropdown-menu";
import { Button } from "@asterism-app/ui/ui/button";
import { PanelLeft, ArrowLeft, ChevronDown, House, Settings, Plus, KeyRound, ListTree, History } from "lucide-react";

import { BrandMark } from "@asterism-app/ui/ui/brand-mark";

import { WorkbenchSurface } from "../features/workbench/WorkbenchSurface";
import { WorkbenchFeedback } from "../features/workbench/WorkbenchFeedback";
import { workbenchPhase } from "../features/workbench/feedback";
import { Workbench, type WorkbenchHandle } from "../features/workbench/Workbench";
import { LayoutMenu } from "../features/workbench/LayoutMenu";
import { WorkbenchScope, WorkbenchStore } from "../features/workbench/context";
import { ObjectsPanel } from "../features/workbench/ObjectsPanel";
import { AccessPanel } from "../features/workbench/AccessPanel";
import { SessionHistoryPanel } from "../features/session/History";
import { Sidebar } from "./Sidebar";

import { HomePage } from "../features/home/HomePage";
import { RendererSettingsNavigationProvider } from "@asterism-app/sdk/renderer";
import { Window, Titlebar } from "./Window";
import { UpdateIndicator } from "./UpdateIndicator";
import { UpdatesProvider } from "../features/updates/state";

import { Space } from "../shared/weave/Space";
import { SettingsPage, isSettingsCategory, type SettingsTarget } from "../features/settings/SettingsPage";
import { SessionArchiveContext } from "../features/settings/SessionsSettings";
import { settingsPageKey, usePluginSettingsRegistry } from "../modules/settings";
import { RendererCatalogProvider } from "../modules/object-context";
import { IslandStrip, Screen, type IslandSpec, type ScreenHandle } from "../shared/weave/Screen";
import { Toaster } from "../shared/ui/sonner";
import { IconButton } from "@asterism-app/ui/ui/icon-button";
import { operationSucceeded, toast, useStateToast } from "../shared/toast";

import { errorDisplay } from "../../shared/error-display.ts";
import { accessMessages } from "../messages/access";
import { appMessages } from "../messages/app";
import { commonMessages } from "@asterism-app/ui/messages/common";
import { historyMessages } from "../messages/history";
import { objectsMessages } from "../messages/objects";
import { settingsMessages } from "../messages/settings";
import { useI18n } from "../shared/i18n";
import type { WorkbenchOperation } from "../features/session/controller";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import type { ApplicationController } from "./controller";

import { useCreationCoordinator } from "../features/creation/coordinator";
import { sessionController } from "../features/session/registry";
import { FolderServicesProvider, type FolderServices } from "../features/folders/context";

import { islandTransition } from "../shared/weave/motion";

/** The main screen contains the sidebar and home/workbench; settings occupy a separate screen on the left, and the entire main screen slides when switching. */
type MainView = { kind: "home" } | { kind: "conversation"; sessionId: string; overview?: boolean };
type PageId = "settings" | "main";
/** Workbench sidebars opened from the titlebar: one at a time, fixed at the right end of the main screen. */
type PanelKind = "objects" | "history" | "access";
const idleSubscribe = () => () => {};
const noSession = () => null;

export function App({ controller }: { controller: ApplicationController }) {
  const i18n = useI18n();
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const workbench = useRef<WorkbenchHandle>(null);
  const mainScreen = useRef<ScreenHandle>(null);
  // Ordinary islands of the main screen; the current workbench restores and persists them while the strip's scope is its session.
  const [mainStrip] = useState(() => new IslandStrip());
  const navigating = useRef(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  const sidebarToggle = useRef<HTMLButtonElement>(null);
  const [page, setPage] = useState<PageId>("main");
  const [settingsTarget, setSettingsTarget] = useState<SettingsTarget | null>(null);
  const pluginSettings = usePluginSettingsRegistry();
  const [view, setView] = useState<MainView>({ kind: "home" });
  const [sidebarVisible, setSidebarVisible] = useState(true);
  // Navigation memory kept across Home visits and sidebar hiding; it does not persist across restarts.
  const [homeFolderId, setHomeFolderId] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(() => new Set());
  const toggleGroup = useCallback((key: string) => setCollapsedGroups(current => {
    const next = new Set(current);
    if (!next.delete(key)) next.add(key);
    return next;
  }), []);
  // Environment outlet for the current workbench: object and panel islands obtain the session environment through it.
  const [workbenchStore] = useState(() => new WorkbenchStore());
  const [panel, setPanel] = useState<{ kind: PanelKind; origin: HTMLElement | null } | null>(null);
  // Increment on each navigation; when asynchronous creation completes, use this to determine whether the user has left, without taking over the current view.
  const navigation = useRef(0);
  const run = useCallback(async (command: WorkbenchOperation) => operationSucceeded(await sessionController(command.sessionId).execute(command)), []);
  const active = view.kind === "conversation" ? sessionController(view.sessionId) : null;
  const sessionState = useSyncExternalStore(active?.subscribe ?? idleSubscribe, active?.getSnapshot ?? noSession);
  useEffect(() => active?.connect(), [active]);
  const snapshot = state.snapshot;
  const session = sessionState?.data?.workbench ?? null;
  const ready = state.status === "ready";
  const folderServices: FolderServices = useMemo(() => ({ folders: snapshot?.folders ?? [], run: controller.execute, ready }),
    [snapshot?.folders, controller, ready]);
  const homeFolder = useMemo(() => ({ id: homeFolderId, select: setHomeFolderId }), [homeFolderId]);
  const sessionBlocked = !!sessionState && (sessionState.navigating || sessionState.status !== "ready");
  const phase = workbenchPhase(state.status, sessionState);
  const writable = ready && !sessionBlocked && !!session;
  const inSettings = page === "settings";
  const completed = view.kind === "conversation" && !!snapshot?.sessions.find(item => item.id === view.sessionId)?.completed;
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
  const navigate = async (next: MainView): Promise<boolean> => {
    if (navigating.current) return false;
    navigating.current = true;
    try {
      const changingSession = next.kind !== view.kind
        || next.kind === "conversation" && view.kind === "conversation" && next.sessionId !== view.sessionId;
      if (changingSession && mainScreen.current) {
        // Leaving a session clears its islands from view, not from its saved arrangement; a cancelled close resumes persistence.
        const scope = mainStrip.getSnapshot().scope;
        mainStrip.set({ scope: null });
        // The root's content is replaced at the same time, so the root takes its new width at once instead of reflowing the incoming view.
        const closed = (!panel || await mainScreen.current.close(`workbench-${panel.kind}`, { settle: true })) && await mainScreen.current.closeAll({ settle: true });
        if (!closed) { mainStrip.set({ scope }); return false; }
      }
      navigation.current++;
      controller.setVisibleSession(next.kind === "conversation" ? next.sessionId : null);
      setView(next); setPage("main");
      controller.clearError();
      focusMain();
      return true;
    } finally { navigating.current = false; }
  };
  const goHome = () => {
    void navigate({ kind: "home" });
  };
  const openSession = (sessionId: string) => {
    void navigate({ kind: "conversation", sessionId });
  };
  const renameSession = (sessionId: string, title: string) => {
    const command = { type: "rename" as const, sessionId, title };
    return active?.sessionId === sessionId ? active.execute(command) : runtime.session.execute(command);
  };
  /** When archiving the current session, return home first, then clean up and reread the session catalog. */
  const archiveSession = async (sessionId: string) => {
    if (view.kind === "conversation" && view.sessionId === sessionId && !(await navigate({ kind: "home" }))) {
      return { ok: false as const, error: { code: "cancelled", message: "Session archiving was cancelled." } };
    }
    const result = await runtime.session.execute({ type: "archive", sessionId });
    void controller.refresh();
    return result;
  };
  const restoreSession = async (sessionId: string) => {
    const result = await runtime.session.execute({ type: "restore", sessionId });
    void controller.refresh();
    return result;
  };
  const sessionCreated = (sessionId: string) => {
    openSession(sessionId);
    void controller.refresh();
  };

  const startTemplate = async (templateId: string) => {
    const token = navigation.current;
    const result = await runtime.session.execute({ type: "template.start", templateId });
    if (!result.ok) return errorDisplay(result.error);
    if (result.reply.kind !== "accepted") throw new Error("Invalid template creation receipt.");
    if (token === navigation.current) await navigate({ kind: "conversation", sessionId: result.reply.sessionId, overview: true });
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
  /** The same button closes its panel; another button replaces it after the current panel and its islands close. */
  const togglePanel = async (kind: PanelKind, origin: HTMLElement | null) => {
    if (panel && !(await mainScreen.current?.close(`workbench-${panel.kind}`))) return;
    if (panel?.kind !== kind) setPanel({ kind, origin });
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
    <span className={completed && !inSettings ? "window-session-title line-through" : "window-session-title"} title={inSettings ? i18n.formatMessage(settingsMessages.settings) : mainTitle}>{inSettings ? i18n.formatMessage(settingsMessages.settings) : mainTitle}</span>
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
    <Button variant="ghost" size="sm" aria-pressed={panel?.kind === "access"} onClick={event => void togglePanel("access", event.currentTarget)} aria-label={i18n.formatMessage(accessMessages.accessLabel)}><KeyRound /><span className="toolbar-label">{i18n.formatMessage(accessMessages.access)}</span></Button>
    <Button variant="ghost" size="sm" aria-pressed={panel?.kind === "objects"} onClick={event => void togglePanel("objects", event.currentTarget)} aria-label={i18n.formatMessage(objectsMessages.objects)}><ListTree /><span className="toolbar-label">{i18n.formatMessage(objectsMessages.objects)}</span></Button>
    <Button variant="ghost" size="sm" aria-pressed={panel?.kind === "history"} onClick={event => void togglePanel("history", event.currentTarget)} aria-label={i18n.formatMessage(historyMessages.history)}><History /><span className="toolbar-label">{i18n.formatMessage(historyMessages.history)}</span></Button>
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
      onCompletedChange={async (sessionId, completed) => {
        const failure = await controller.execute({ type: "session.set-completed", sessionId, completed });
        if (failure) toast.error(i18n.text(failure));
      }}
      onTemplateSaved={() => { void controller.refresh({ quiet: true }); }}
      homeActive={view.kind === "home"}
      collapsed={collapsedGroups} onToggleGroup={toggleGroup}
      onHome={goHome} onSession={openSession} onHide={hideSidebar}
      onRetry={() => { void controller.refresh(); }} />,
  };
  // Panel sidebar: a fixed trailing island bound to the current session's environment; it closes when leaving the session.
  const panelSpec: IslandSpec | null = panel && view.kind === "conversation" && active ? {
    id: `workbench-${panel.kind}`, width: { min: 320, max: 400 }, origin: panel.origin,
    label: { objects: i18n.formatMessage(objectsMessages.objects), history: i18n.formatMessage(historyMessages.history), access: i18n.formatMessage(accessMessages.accessLabel) }[panel.kind],
    onClose: () => setPanel(null),
    render: () => <WorkbenchScope store={workbenchStore} sessionId={view.sessionId}>
      {panel.kind === "objects" ? <ObjectsPanel /> : panel.kind === "access" ? <AccessPanel /> : <SessionHistoryPanel controller={active} />}
    </WorkbenchScope>,
  } : null;
  const main: IslandSpec = {
    id: "main-view", label: mainTitle, width: { min: 440, grow: 1 }, surface: view.kind === "conversation",
    // Home and workbench enter and exit simultaneously in both directions; exiting content leaves the layout flow so it does not occupy space alongside entering content.
    // The clip contains the scaled enter and exit frames, so they never give the island body a scroll range; each view scrolls itself.
    render: () => <div className="relative h-full overflow-hidden"><AnimatePresence mode="popLayout" initial={false}>
      {view.kind === "home"
        ? <motion.div key="home" className="h-full" initial={{ opacity: 0, scale: 1.04 }} animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.04 }} transition={islandTransition}>
          <HomePage active={!inSettings} onSettings={() => {
            go("settings");
            setSettingsTarget({ category: "general", sequence: ++navigation.current });
          }}
            templates={snapshot?.templates ?? []} onTemplateStart={startTemplate} onTemplatesChanged={() => { void controller.refresh({ quiet: true }); }}
            ready={ready} onCreated={sessionCreated} folder={homeFolder} /></motion.div>
        : <motion.div key="conversation" className="h-full" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }} transition={islandTransition}>
          {conversation}</motion.div>}
    </AnimatePresence></div>,
  };
  // The workbench persistently displays session read failures; the same entry handles backend unavailability while the workbench is visible.
  const unavailableInWorkbench = view.kind === "conversation" && !inSettings && phase === "unavailable";
  const appError = unavailableInWorkbench ? null : state.error;
  useStateToast(appError ? i18n.text(appError) : null, {
    tone: "error",
    onDismiss: controller.clearError,
  });

  return <RendererCatalogProvider ready={ready}><UpdatesProvider><FolderServicesProvider value={folderServices}><RendererSettingsNavigationProvider value={{ open(pluginId, pageId, location) {
    const settings = pluginSettings.pages.get(settingsPageKey(pluginId, pageId));
    if (!settings) throw new Error(`Plugin ${pluginId} has no available settings page ${pageId}.`);
    if (location !== undefined && !settings.locations?.includes(location)) throw new Error(`Unknown settings location: ${location}`);
    go("settings");
    setSettingsTarget({ pluginId, pageId, location, sequence: ++navigation.current });
  }, openHost(category) {
    if (!isSettingsCategory(category)) throw new Error(`Unknown host settings page: ${category}`);
    go("settings");
    setSettingsTarget({ category, sequence: ++navigation.current });
  } }}>
    <Window skipTarget={`screen-${page}`} titlebar={<Titlebar navigation={titleNavigation} actions={actions} actionsHidden={inSettings} />}>
      <Space active={page} screens={[
        { id: "settings", label: i18n.formatMessage(settingsMessages.settings), surface: false, content:
          <SessionArchiveContext.Provider value={{ snapshot, restore: restoreSession }}><SettingsPage active={inSettings} target={settingsTarget} /></SessionArchiveContext.Provider> },
        { id: "main", label: mainTitle, surface: false,
          // Navigation closes the panel and ordinary islands before switching sessions.
          content: <Screen ref={mainScreen} strip={mainStrip} label={i18n.formatMessage(appMessages.appNavigation)} leading={sidebarVisible ? [sidebar] : undefined} root={main}
            trailing={panelSpec ? [panelSpec] : undefined} className="h-full" /> },
      ]} />
    </Window>
    <Toaster position="bottom-center" containerAriaLabel={i18n.formatMessage(commonMessages.notifications)}
      toastOptions={{ closeButtonAriaLabel: i18n.formatMessage(commonMessages.close) }} />
    {creation.element}
  </RendererSettingsNavigationProvider></FolderServicesProvider></UpdatesProvider></RendererCatalogProvider>;
}
