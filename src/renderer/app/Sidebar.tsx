import { lazy, Suspense, useRef, useState, type ReactElement, type ReactNode } from "react";
import { Button } from "@asterism-app/ui/ui/button";
import { IconButton } from "@asterism-app/ui/ui/icon-button";
import { ListRow } from "@asterism-app/ui/ui/list-row";
import { VirtualList } from "@asterism-app/ui/ui/virtual-list";
import { ActionMenu, ActionMenuContent, ActionMenuItem, ActionMenuSeparator, ActionMenuTrigger, ActionMenuTarget } from "@asterism-app/ui/ui/action-menu";
import { ToggleGroup, ToggleGroupItem } from "@asterism-app/ui/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@asterism-app/ui/ui/tooltip";
import { ChevronRight, Moon, Folder as FolderIcon, FolderPlus, House, MessageSquare, MoreHorizontal, PanelLeftClose, Pencil, Trash2 } from "lucide-react";
import { cn } from "@asterism-app/ui/utils";

import { appMessages } from "../messages/app";
import { commonMessages } from "@asterism-app/ui/messages/common";
import { useI18n } from "../shared/i18n";
import { folderMessages } from "../../shared/folder-messages";
import type { Folder } from "../../shared/folders";

import type { AppSnapshot, RuntimeStatus } from "../../shared/contracts";
import type { SessionResult } from "../../shared/session";
import { SessionActions } from "./SessionActions";
import { SessionStatus } from "./SessionStatus";
import type { ResourceNoticeMark } from "./resource-status";
import type { ResourceActivity } from "@asterism-app/sdk/contracts";
import { useFolders } from "../features/folders/context";
import { groupByFolder, type FolderGroup } from "../features/folders/grouping";
import { FolderDot } from "../features/folders/marks";
import { DeleteFolder, FolderDialog } from "../features/folders/FolderDialog";
import { sidebarViews, type SidebarView } from "./sidebar-state";
import { useConfiguration } from "../features/configuration/state";
import { sidebarListRows, type SidebarListRow } from "./sidebar-list";

export { noFolderGroup } from "./sidebar-list";

const UsagePanel = lazy(() => import("../features/usage/UsagePanel").then(module => ({ default: module.UsagePanel })));

type SessionSummary = AppSnapshot["sessions"][number];
type SidebarRow = SidebarListRow<SessionSummary> | { kind: "empty-list" | "loading" | "unavailable" | "retry"; key: string };
type FolderAction = { kind: "edit" | "delete"; folder: Folder; trigger: HTMLButtonElement | null };

const viewLabels = { folders: appMessages.sidebarViewFolders, recent: appMessages.sidebarViewRecent } as const;

/** Application navigation consumes only session summaries; after selecting a session, the application layer explicitly loads the workbench. */
export function Sidebar({ snapshot, status, busy, resourceActivities, resourceNotices, selectedSessionId, renameDisabledSessionId, homeActive, view, onViewChange, collapsed, onToggleGroup, onHome, onSession, onRename, onArchive, onCompletedChange, onKeepAwakeChange, onTemplateSaved, onHide, onRetry }: {
  snapshot: AppSnapshot | null; status: RuntimeStatus; busy: boolean; selectedSessionId: string | null;
  resourceActivities: readonly ResourceActivity[];
  resourceNotices: readonly ResourceNoticeMark[];
  renameDisabledSessionId: string | null; onRename: (sessionId: string, title: string) => Promise<SessionResult>;
  onArchive: (sessionId: string) => Promise<SessionResult>;
  onTemplateSaved: () => void;
  onCompletedChange: (sessionId: string, completed: boolean) => Promise<void>;
  onKeepAwakeChange: (sessionId: string, keepAwake: boolean) => Promise<void>;
  view: SidebarView; onViewChange: (view: SidebarView) => void;
  /** Collapsed group keys: folder identities or `noFolderGroup`. */
  collapsed: ReadonlySet<string>; onToggleGroup: (key: string) => void;
  homeActive: boolean; onHome: () => void; onSession: (id: string) => void;
  onHide: () => void; onRetry: () => void;
}) {
  const i18n = useI18n();
  const { folders, ready } = useFolders();
  const { snapshot: configuration } = useConfiguration(status === "ready");
  const [creating, setCreating] = useState(false);
  const createTrigger = useRef<HTMLButtonElement>(null);
  const listHeading = useRef<HTMLHeadingElement>(null);
  const [folderAction, setFolderAction] = useState<FolderAction | null>(null);
  // Keep the last interacted row mounted while its menu or portaled session dialog owns focus.
  const [focusedRow, setFocusedRow] = useState<string | null>(null);
  const restoreFolderFocus = () => {
    const target = folderAction?.trigger;
    if (target?.isConnected && !target.disabled) target.focus({ preventScroll: true });
    else listHeading.current?.focus({ preventScroll: true });
  };
  const disabled = busy || status !== "ready";
  // Without folders both arrangements are the same flat list, so the switch is omitted.
  const grouped = folders.length > 0 && view === "folders";
  const groups = snapshot && grouped ? groupByFolder(folders, snapshot.sessions, session => session.folder_id, i18n.locale) : [];
  const rows: SidebarRow[] = sidebarListRows(snapshot?.sessions ?? [], grouped ? groups : null, collapsed);
  if (snapshot?.sessions.length === 0 && !grouped) rows.push({ kind: "empty-list", key: "empty-list" });
  if (!snapshot && status !== "unavailable") rows.push({ kind: "loading", key: "loading" });
  if (status === "unavailable") rows.push({ kind: "unavailable", key: "unavailable" });
  if (!snapshot && !busy && status !== "unavailable") rows.push({ kind: "retry", key: "retry" });
  const focusedIndex = rows.findIndex(item => item.key === focusedRow);
  // The flat list marks folder membership with the folder's dot once folders exist.
  const marked = folders.length > 0 && !grouped;
  const folderById = new Map(folders.map(folder => [folder.id, folder]));
  const row = (session: SessionSummary) => {
    const activities = resourceActivities.filter(activity => activity.resource.sessionId === session.id);
    const notices = resourceNotices.filter(notice => notice.resource.sessionId === session.id);
    const folder = marked && session.folder_id !== null ? folderById.get(session.folder_id) : undefined;
    const icon = session.sleeping ? <Moon className="text-muted-foreground" /> : <MessageSquare className="text-muted-foreground" />;
    // Sessions without a folder keep the dot slot so titles align.
    const media = !marked ? icon : <span className="flex items-center gap-1.5">
      {folder ? <Tooltip>
        <TooltipTrigger asChild>
          {/* Above the row's open overlay so hovering reaches the tooltip; a click still opens the session. */}
          <span className="relative z-10 -m-1 flex p-1" onClick={() => { if (!disabled) onSession(session.id); }}>
            <FolderDot color={folder.color} />
          </span>
        </TooltipTrigger>
        <TooltipContent side="right">{folder.name}</TooltipContent>
      </Tooltip> : <span aria-hidden="true" className="size-2 shrink-0" />}
      {icon}
    </span>;
    return <SessionActions key={session.id} sessionId={session.id} title={session.title} folderId={session.folder_id} disabled={disabled} sleeping={session.sleeping}
      keepAwake={session.keepAwake} onKeepAwakeChange={value => onKeepAwakeChange(session.id, value)}
      completed={session.completed} onCompletedChange={completed => onCompletedChange(session.id, completed)}
      renameDisabled={renameDisabledSessionId === session.id}
      onRename={title => onRename(session.id, title)} onArchive={() => onArchive(session.id)} onTemplateSaved={onTemplateSaved}>
      {trigger => <ListRow variant="navigation"
        selected={selectedSessionId === session.id} disabled={disabled} inactive={session.sleeping} onOpen={() => onSession(session.id)}
        tooltip={session.title}
        buttonProps={{ "aria-current": selectedSessionId === session.id ? "page" : undefined }}
        media={media}
        title={<span className={cn("relative block truncate", session.completed && "line-through")}>
          {session.title}{folder && <span className="sr-only">, {folder.name}</span>}
          {session.sleeping && <span className="sr-only">, {i18n.text(appMessages.sleeping)}</span>}
        </span>}
        actions={<><SessionStatus activities={activities} notices={notices} />{trigger}</>} />}
    </SessionActions>;
  };
  return <aside id="app-sidebar" className="app-sidebar" aria-label={i18n.formatMessage(appMessages.appNavigation)}>
    <header className="flex items-center justify-between gap-2 px-2 pb-5 pt-1">
      <span className="flex items-center gap-2 text-sm font-semibold"><span aria-hidden="true" className="shrink-0 text-xl leading-none font-normal text-foreground">⁂</span>{i18n.formatMessage(appMessages.appName)}</span>
      <IconButton size="icon-xs" label={i18n.formatMessage(appMessages.hideSidebar)} onClick={onHide}><PanelLeftClose /></IconButton>
    </header>
    <nav className="flex flex-col gap-1" aria-label={i18n.formatMessage(appMessages.mainViews)}>
      <Button variant={homeActive ? "selected" : "ghost"} className="w-full justify-start disabled:opacity-100" aria-current={homeActive ? "page" : undefined} disabled={homeActive} onClick={onHome}><House />{i18n.formatMessage(commonMessages.home)}</Button>
    </nav>
    <section className="mt-6 flex min-h-0 flex-1 flex-col" aria-labelledby="conversation-list-title">
      <div className="mb-1 flex items-center justify-between gap-2 pl-2">
        <h2 ref={listHeading} tabIndex={-1} id="conversation-list-title" className="type-label">{i18n.formatMessage(commonMessages.conversations)}</h2>
        <IconButton ref={createTrigger} size="icon-xs" label={i18n.text(folderMessages.create)} disabled={!ready} onClick={() => setCreating(true)}><FolderPlus /></IconButton>
      </div>
      {folders.length > 0 && <ToggleGroup type="single" variant="outline" size="sm" className="mb-2 w-full" aria-label={i18n.text(appMessages.sidebarView)}
        value={view} onValueChange={value => { if (value) onViewChange(value as SidebarView); }}>
        {sidebarViews.map(item => <ToggleGroupItem key={item} value={item} className="h-7 flex-1">{i18n.text(viewLabels[item])}</ToggleGroupItem>)}
      </ToggleGroup>}
      <VirtualList data={rows} className="-mx-1" viewportClassName="overflow-x-hidden"
        keepMounted={focusedIndex < 0 ? [] : [focusedIndex]}>
        {(item, index) => <div key={item.key} className={cn("px-1", index === rows.length - 1 && "pb-2")}
          onFocusCapture={() => setFocusedRow(item.key)}>
          {item.kind === "session" && <div className={cn(item.nested && "ml-[15px] border-l pl-1.5")}>{row(item.session)}</div>}
          {item.kind === "group" && <SidebarGroupHeader group={item.group} open={item.open} spaced={index > 0}
            onToggle={() => onToggleGroup(item.groupKey)} onAction={(kind, folder, trigger) => setFolderAction({ kind, folder, trigger })} />}
          {item.kind === "empty-group" && <div className="ml-[15px] border-l pl-1.5"><p className="type-caption px-2 py-1.5">{i18n.text(folderMessages.empty)}</p></div>}
          {item.kind === "empty-list" && <p className="type-caption px-2 py-3">{i18n.formatMessage(appMessages.noConversations)}</p>}
          {item.kind === "loading" && <p role="status" className="type-caption px-2 py-3">{i18n.formatMessage(appMessages.loadingConversations)}</p>}
          {item.kind === "unavailable" && <p role="status" className="type-caption px-2 py-3">{i18n.formatMessage(commonMessages.statusUnavailable)}</p>}
          {item.kind === "retry" && <Button variant="ghost" size="sm" onClick={onRetry}>{i18n.formatMessage(commonMessages.retry)}</Button>}
        </div>}
      </VirtualList>
    </section>
    {status === "ready" && configuration?.showUsage === true && <Suspense fallback={null}>
      <UsagePanel modelProviders={configuration.modelProviders} />
    </Suspense>}
    {folderAction?.kind === "edit" && <FolderDialog folder={folderAction.folder} onClose={() => setFolderAction(null)} onRestoreFocus={restoreFolderFocus} />}
    {folderAction?.kind === "delete" && <DeleteFolder folder={folderAction.folder} onClose={() => { setFolderAction(null); listHeading.current?.focus({ preventScroll: true }); }} onRestoreFocus={restoreFolderFocus} />}
    {creating && <FolderDialog onClose={() => setCreating(false)} onRestoreFocus={() => createTrigger.current?.focus({ preventScroll: true })} />}
  </aside>;
}

/** Only the header is virtualized here; child rows independently carry the group's guide line. */
function SidebarGroupHeader({ group, open, spaced, onToggle, onAction }: {
  group: FolderGroup<SessionSummary>; open: boolean; spaced: boolean; onToggle: () => void;
  onAction: (kind: FolderAction["kind"], folder: Folder, trigger: HTMLButtonElement | null) => void;
}) {
  const i18n = useI18n();
  const name = group.folder?.name ?? i18n.text(folderMessages.noFolder);
  const toggle = <Button type="button" data-action-menu-primary variant="ghost" aria-expanded={open} onClick={onToggle}
    className="h-full min-w-0 flex-1 justify-start gap-2 py-0 pl-2 pr-1 has-[>svg]:pl-2 has-[>svg]:pr-1 text-left font-normal">
    <ChevronRight aria-hidden="true" className={cn("size-3.5 shrink-0 text-muted-foreground motion-safe:transition-transform", open && "rotate-90")} />
    {group.folder ? <FolderDot color={group.folder.color} className="mx-0.5" /> : <FolderIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />}
    <span className={cn("min-w-0 flex-1 truncate", group.folder ? "font-medium" : "text-muted-foreground")}>{name}</span>
    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{group.items.length}</span>
  </Button>;
  const header = (trigger: ReactNode) => <div className="group/folder flex h-8 items-center rounded-md pr-1 transition-colors hover:bg-accent/60 has-[:focus-visible]:bg-accent/60">
    {toggle}
    {trigger}
  </div>;
  return <div className={cn(spaced && "pt-1")}>
    {group.folder ? <FolderGroupActions folder={group.folder} onAction={onAction}>{header}</FolderGroupActions> : header(null)}
  </div>;
}

function FolderGroupActions({ folder, onAction, children }: {
  children: (trigger: ReactNode) => ReactElement;
  folder: Folder; onAction: (kind: FolderAction["kind"], folder: Folder, trigger: HTMLButtonElement | null) => void;
}) {
  const i18n = useI18n();
  const { ready } = useFolders();
  const trigger = useRef<HTMLButtonElement>(null);
  const openingDialog = useRef(false);
  return <ActionMenu modal={false} onOpenChange={open => { if (open) openingDialog.current = false; }}>
    <ActionMenuTarget asChild disabled={!ready}>
      {children(<ActionMenuTrigger asChild>
        <Button ref={trigger} variant="ghost" size="icon-xs" disabled={!ready} aria-label={i18n.formatMessage(folderMessages.actions, { name: folder.name })}
          className="w-0 overflow-hidden p-0 opacity-0 group-hover/folder:w-6 group-hover/folder:opacity-100 group-focus-within/folder:w-6 group-focus-within/folder:opacity-100 data-[state=open]:w-6 data-[state=open]:opacity-100">
          <MoreHorizontal />
        </Button>
      </ActionMenuTrigger>)}
    </ActionMenuTarget>
    <ActionMenuContent align="end" onCloseAutoFocus={event => { if (openingDialog.current) event.preventDefault(); }}>
      <ActionMenuItem onSelect={() => { openingDialog.current = true; onAction("edit", folder, trigger.current); }}><Pencil />{i18n.text(folderMessages.edit)}…</ActionMenuItem>
      <ActionMenuSeparator />
      <ActionMenuItem variant="destructive" onSelect={() => { openingDialog.current = true; onAction("delete", folder, trigger.current); }}><Trash2 />{i18n.text(folderMessages.delete)}…</ActionMenuItem>
    </ActionMenuContent>
  </ActionMenu>;
}
