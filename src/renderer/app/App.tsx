import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ArrowLeft, ChevronDown, FileText, History, KeyRound, LayoutList, ListTree, Plus, Settings, X } from "lucide-react";
import type { Command } from "../../shared/contracts";
import type { ApplicationController } from "./controller";
import { t } from "../shared/i18n";
import { Button, IconButton } from "../shared/ui/button";
import { WeftMark } from "../shared/ui/weft-mark";
import { Menu, MenuItem, MenuSeparator } from "../shared/ui/menu";
import { PageState } from "../shared/ui/page-state";
import { Workbench } from "../features/workbench/Workbench";
import { AccessDialog } from "../features/workbench/AccessDialog";
import { SidePanel, type PanelKind } from "../features/workbench/SidePanel";
import { SettingsPage } from "../features/settings/SettingsPage";
import { placeObject } from "../features/workbench/placement";
import { CreateDialog, type Creation } from "./CreateDialog";
import { Titlebar, Window } from "./Window";
import { Space } from "../shared/weave/Space";

/** 页面带站点，自左向右：应用级（浅）→ 工作台（原点）。更深的任务内容日后在右侧追加。 */
type PageId = "settings" | "workbench";

export function App({ controller }: { controller: ApplicationController }) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const workbenchRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const [page, setPage] = useState<PageId>("workbench");
  const [panel, setPanel] = useState<PanelKind | null>(null);
  const [creation, setCreation] = useState<Creation | null>(null);
  const [accessOpen, setAccessOpen] = useState(false);
  const run = useCallback((command: Command) => controller.run(command), [controller]);
  useEffect(() => controller.connect(), [controller]);
  const snapshot = state.snapshot;
  const task = snapshot?.task;
  const ready = state.status === "ready";
  const writable = ready && !state.busy && !task?.historical;
  const inSettings = page === "settings";

  // 页面切换后焦点移到新页面；返回工作台时归还到进入前的位置。
  const go = (next: PageId) => {
    if (next === page) return;
    if (next !== "workbench") returnFocus.current = document.activeElement as HTMLElement | null;
    setPage(next);
    requestAnimationFrame(() => {
      if (next === "workbench" && returnFocus.current?.isConnected) returnFocus.current.focus({ preventScroll: true });
      else document.getElementById(`screen-${next}`)?.focus({ preventScroll: true });
    });
  };
  useEffect(() => {
    if (!inSettings) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !event.defaultPrevented) go("workbench"); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const add = (kind: "agent" | "note") => {
    const bounds = workbenchRef.current?.getBoundingClientRect();
    if (!task || !bounds) return;
    setCreation({ kind, taskId: task.id, position: placeObject(task, bounds.width, bounds.height) });
  };
  const togglePanel = (kind: PanelKind) => setPanel(panel === kind ? null : kind);

  const navigation = inSettings ? <>
    <Button variant="ghost" size="sm" onClick={() => go("workbench")}><ArrowLeft />{t.backToWorkbench}</Button>
    <span className="h-4 w-px shrink-0 bg-border" />
    <span className="window-task-title font-medium">{t.settings}</span>
  </> : <>
    <Menu trigger={<Button variant="ghost" size="sm" aria-label={t.menu}>
      <WeftMark className="size-4 text-primary" /><span className="text-sm font-semibold text-primary">{t.appName}</span><ChevronDown className="text-muted-foreground" />
    </Button>}>
      <MenuItem disabled={!snapshot} onSelect={() => setPanel("tasks")}><LayoutList />{t.menuTasks}</MenuItem>
      <MenuItem disabled={!ready || state.busy} onSelect={() => setCreation({ kind: "task" })}><Plus />{t.newTask}</MenuItem>
      <MenuSeparator />
      <MenuItem onSelect={() => go("settings")}><Settings />{t.menuSettings}</MenuItem>
    </Menu>
    <span className="h-4 w-px shrink-0 bg-border" />
    <span className="window-task-title" title={task?.title}>{task?.title ?? t.workspace}</span>
    {task && <Button size="sm" variant="ghost" onClick={() => togglePanel("history")} aria-expanded={panel === "history"}><History />{t.history}</Button>}
  </>;

  const actions = task ? <>
    <Button variant="ghost" size="sm" disabled={!writable} onClick={() => add("agent")} aria-label={t.addAgentLabel}><Plus /><span className="toolbar-label">{t.addAgent}</span></Button>
    <Button variant="ghost" size="sm" disabled={!writable} onClick={() => add("note")} aria-label={t.addNoteLabel}><FileText /><span className="toolbar-label">{t.addNote}</span></Button>
    <Button variant="ghost" size="sm" disabled={!writable} onClick={() => setAccessOpen(true)} aria-label={t.accessLabel}><KeyRound /><span className="toolbar-label">{t.access}</span></Button>
    <Button variant="ghost" size="sm" onClick={() => togglePanel("objects")} aria-expanded={panel === "objects"} aria-label={t.objects}><ListTree /><span className="toolbar-label">{t.objects}</span></Button>
  </> : <Button variant="ghost" size="sm" disabled={!writable} onClick={() => setCreation({ kind: "task" })}><Plus />{t.newTask}</Button>;

  const workbench = <div ref={workbenchRef} className="overlay-inset relative h-full">
    {task ? <Workbench key={task.id + ":" + (task.historical ? task.at_seq : "live")} task={task} run={run} /> : <div className="empty-workbench">
      {snapshot ? <div className="max-w-md text-center">
        <h1 className="type-page">{t.emptyTitle}</h1>
        <p className="type-caption mt-2">{t.emptyBody}</p>
        <Button className="mt-6" disabled={!writable} onClick={() => setCreation({ kind: "task" })}><Plus />{t.newTask}</Button>
      </div> : <PageState kind={state.status === "unavailable" ? "error" : "loading"}
        title={state.status === "unavailable" ? t.unavailableTitle : t.openingTitle}
        body={state.status === "unavailable" ? t.unavailableBody : t.openingBody} />}
    </div>}
    {task && task.objects.length === 0 && <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div className="max-w-sm text-center">
        <h1 className="type-page">{task.title}</h1>
        <p className="type-caption mt-2">{task.historical ? t.noObjectsHistorical : t.noObjects}</p>
      </div>
    </div>}
    {panel && <SidePanel panel={panel} snapshot={snapshot} busy={state.busy} ready={ready} writable={writable} run={run}
      onClose={() => setPanel(null)} onNewTask={() => setCreation({ kind: "task" })} />}
    {task?.historical && <div className="floating-bar absolute bottom-[var(--overlay-inset)] left-1/2 z-10 flex -translate-x-1/2 items-center gap-3 whitespace-nowrap pl-3 text-sm">
      <span>{t.viewingHistory}</span>
      <Button size="sm" disabled={state.busy} onClick={() => { void run({ type: "workspace.read", task_id: task.id }); }}>{t.backToLive}</Button>
    </div>}
    <span role="status" className="status-chip absolute left-[var(--overlay-inset)] top-[var(--overlay-inset)] z-10" data-hidden={!!panel || undefined}>
      {state.busy ? t.statusBusy : ready ? t.statusReady : t.statusUnavailable}
    </span>
  </div>;

  return <>
    <Window skipTarget={`screen-${page}`} titlebar={<Titlebar navigation={navigation} actions={actions} actionsHidden={inSettings} />}>
      <Space active={page} screens={[
        { id: "settings", label: t.settings, surface: false, content: <SettingsPage active={inSettings} /> },
        { id: "workbench", label: t.workbench, content: workbench },
      ]} />
    </Window>
    {state.error && <div role="alert" className="notice notice-error fixed bottom-4 left-1/2 z-[60] w-[min(560px,calc(100%-32px))] -translate-x-1/2">
      <p className="flex-1">{state.error}</p>
      <IconButton label={t.dismissError} onClick={controller.clearError}><X /></IconButton>
    </div>}
    {creation && <CreateDialog creation={creation} busy={state.busy} run={run} onClose={() => setCreation(null)} />}
    {accessOpen && task && <AccessDialog task={task} busy={state.busy} run={run} onClose={() => setAccessOpen(false)} />}
  </>;
}
