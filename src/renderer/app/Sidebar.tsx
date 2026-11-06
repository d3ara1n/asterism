import { useRef, useState, type ReactNode } from "react";
import { BrandMark } from "@asterism-app/ui/ui/brand-mark";
import { Button } from "@asterism-app/ui/ui/button";
import { IconButton } from "@asterism-app/ui/ui/icon-button";
import { ListRow } from "@asterism-app/ui/ui/list-row";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@asterism-app/ui/ui/collapsible";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@asterism-app/ui/ui/dropdown-menu";
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
import type { ResourceStatusMark } from "./resource-status";
import { useFolders } from "../features/folders/context";
import { groupByFolder, type FolderGroup } from "../features/folders/grouping";
import { FolderDot } from "../features/folders/marks";
import { DeleteFolder, FolderDialog } from "../features/folders/FolderDialog";

type SessionSummary = AppSnapshot["sessions"][number];
/** Collapse key of the no-folder group; folder groups use their identity. */
export const noFolderGroup = "none";

/** Application navigation consumes only session summaries; after selecting a session, the application layer explicitly loads the workbench. */
export function Sidebar({ snapshot, status, busy, resourceStatuses, selectedSessionId, renameDisabledSessionId, homeActive, collapsed, onToggleGroup, onHome, onSession, onRename, onArchive, onCompletedChange, onKeepAwakeChange, onTemplateSaved, onHide, onRetry }: {
  snapshot: AppSnapshot | null; status: RuntimeStatus; busy: boolean; selectedSessionId: string | null;
  resourceStatuses: readonly ResourceStatusMark[];
  renameDisabledSessionId: string | null; onRename: (sessionId: string, title: string) => Promise<SessionResult>;
  onArchive: (sessionId: string) => Promise<SessionResult>;
  onTemplateSaved: () => void;
  onCompletedChange: (sessionId: string, completed: boolean) => Promise<void>;
  onKeepAwakeChange: (sessionId: string, keepAwake: boolean) => Promise<void>;
  /** Collapsed group keys: folder identities or `noFolderGroup`. */
  collapsed: ReadonlySet<string>; onToggleGroup: (key: string) => void;
  homeActive: boolean; onHome: () => void; onSession: (id: string) => void;
  onHide: () => void; onRetry: () => void;
}) {
  const i18n = useI18n();
  const { folders, ready } = useFolders();
  const [creating, setCreating] = useState(false);
  const createTrigger = useRef<HTMLButtonElement>(null);
  const disabled = busy || status !== "ready";
  const groups = snapshot ? groupByFolder(folders, snapshot.sessions, session => session.folder_id, i18n.locale) : [];
  const row = (session: SessionSummary) => {
    const marks = resourceStatuses.filter(mark => mark.resource.sessionId === session.id);
    return <ListRow key={session.id} variant="navigation"
      selected={selectedSessionId === session.id} disabled={disabled} inactive={session.sleeping} onOpen={() => onSession(session.id)}
      buttonProps={{ title: session.title, "aria-current": selectedSessionId === session.id ? "page" : undefined }}
      media={session.sleeping ? <Moon className="text-muted-foreground" /> : <MessageSquare className="text-muted-foreground" />}
      title={<span className={cn("block truncate", session.completed && "line-through")}>
        {session.title}{session.sleeping && <span className="sr-only">, {i18n.text(appMessages.sleeping)}</span>}
      </span>}
      actions={<>
        <SessionStatus marks={marks} />
        <SessionActions sessionId={session.id} title={session.title} folderId={session.folder_id} disabled={disabled} sleeping={session.sleeping}
          keepAwake={session.keepAwake} onKeepAwakeChange={value => onKeepAwakeChange(session.id, value)}
          completed={session.completed} onCompletedChange={completed => onCompletedChange(session.id, completed)}
          renameDisabled={renameDisabledSessionId === session.id}
          onRename={title => onRename(session.id, title)} onArchive={() => onArchive(session.id)} onTemplateSaved={onTemplateSaved} />
      </>} />;
  };
  return <aside id="app-sidebar" className="app-sidebar" aria-label={i18n.formatMessage(appMessages.appNavigation)}>
    <header className="flex items-center justify-between gap-2 px-2 pb-5 pt-1">
      <span className="flex items-center gap-2 text-sm font-semibold"><BrandMark className="size-5 text-primary" />{i18n.formatMessage(appMessages.appName)}</span>
      <IconButton size="icon-xs" label={i18n.formatMessage(appMessages.hideSidebar)} onClick={onHide}><PanelLeftClose /></IconButton>
    </header>
    <nav className="flex flex-col gap-1" aria-label={i18n.formatMessage(appMessages.mainViews)}>
      <Button variant={homeActive ? "selected" : "ghost"} className="w-full justify-start disabled:opacity-100" aria-current={homeActive ? "page" : undefined} disabled={homeActive} onClick={onHome}><House />{i18n.formatMessage(commonMessages.home)}</Button>
    </nav>
    <section className="mt-6 flex min-h-0 flex-1 flex-col" aria-labelledby="conversation-list-title">
      <div className="mb-1 flex items-center justify-between gap-2 pl-2">
        <h2 id="conversation-list-title" className="type-label">{i18n.formatMessage(commonMessages.conversations)}</h2>
        <IconButton ref={createTrigger} size="icon-xs" label={i18n.text(folderMessages.create)} disabled={!ready} onClick={() => setCreating(true)}><FolderPlus /></IconButton>
      </div>
      <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 pb-2">
        {folders.length === 0 ? snapshot?.sessions.map(row) : groups.map(group => {
          const key = group.folder?.id ?? noFolderGroup;
          return <SidebarGroup key={key} group={group} open={!collapsed.has(key)} onToggle={() => onToggleGroup(key)}>
            {group.items.map(row)}
          </SidebarGroup>;
        })}
        {snapshot?.sessions.length === 0 && folders.length === 0 && <p className="type-caption px-2 py-3">{i18n.formatMessage(appMessages.noConversations)}</p>}
        {!snapshot && status !== "unavailable" && <p role="status" className="type-caption px-2 py-3">{i18n.formatMessage(appMessages.loadingConversations)}</p>}
        {status === "unavailable" && <p role="status" className="type-caption px-2 py-3">{i18n.formatMessage(commonMessages.statusUnavailable)}</p>}
        {!snapshot && !busy && status !== "unavailable" && <Button variant="ghost" size="sm" onClick={onRetry}>{i18n.formatMessage(commonMessages.retry)}</Button>}
      </div>
    </section>
    {creating && <FolderDialog onClose={() => setCreating(false)} onRestoreFocus={() => createTrigger.current?.focus({ preventScroll: true })} />}
  </aside>;
}

/** A collapsible navigation group: folder identity in the header, sessions nested under a guide line. */
function SidebarGroup({ group, open, onToggle, children }: {
  group: FolderGroup<SessionSummary>; open: boolean; onToggle: () => void; children: ReactNode;
}) {
  const i18n = useI18n();
  const name = group.folder?.name ?? i18n.text(folderMessages.noFolder);
  return <Collapsible open={open} onOpenChange={onToggle} className="mt-1 first:mt-0">
    <div className="group/folder flex h-8 items-center rounded-md pr-1 transition-colors hover:bg-accent/60 has-[:focus-visible]:bg-accent/60">
      <CollapsibleTrigger asChild>
        <button type="button" className="flex min-w-0 flex-1 items-center gap-2 self-stretch pl-2 pr-1 text-left text-sm outline-none">
          <ChevronRight aria-hidden="true" className={cn("size-3.5 shrink-0 text-muted-foreground motion-safe:transition-transform", open && "rotate-90")} />
          {group.folder ? <FolderDot color={group.folder.color} className="mx-0.5" /> : <FolderIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />}
          <span className={cn("min-w-0 flex-1 truncate", group.folder ? "font-medium" : "text-muted-foreground")}>{name}</span>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{group.items.length}</span>
        </button>
      </CollapsibleTrigger>
      {group.folder && <FolderGroupActions folder={group.folder} />}
    </div>
    <CollapsibleContent>
      <div className="ml-[15px] flex flex-col border-l pl-1.5">
        {children}
        {!group.items.length && <p className="type-caption px-2 py-1.5">{i18n.text(folderMessages.empty)}</p>}
      </div>
    </CollapsibleContent>
  </Collapsible>;
}

function FolderGroupActions({ folder }: { folder: Folder }) {
  const i18n = useI18n();
  const { ready } = useFolders();
  const trigger = useRef<HTMLButtonElement>(null);
  const [dialog, setDialog] = useState<"edit" | "delete" | null>(null);
  const restore = () => trigger.current?.focus({ preventScroll: true });
  return <>
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button ref={trigger} variant="ghost" size="icon-xs" disabled={!ready} aria-label={i18n.formatMessage(folderMessages.actions, { name: folder.name })}
          className="w-0 overflow-hidden p-0 opacity-0 group-hover/folder:w-6 group-hover/folder:opacity-100 group-focus-within/folder:w-6 group-focus-within/folder:opacity-100 data-[state=open]:w-6 data-[state=open]:opacity-100">
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onCloseAutoFocus={event => { if (dialog) event.preventDefault(); }}>
        <DropdownMenuItem onSelect={() => setDialog("edit")}><Pencil />{i18n.text(folderMessages.edit)}…</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => setDialog("delete")}><Trash2 />{i18n.text(folderMessages.delete)}…</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    {dialog === "edit" && <FolderDialog folder={folder} onClose={() => setDialog(null)} onRestoreFocus={restore} />}
    {dialog === "delete" && <DeleteFolder folder={folder} onClose={() => setDialog(null)} onRestoreFocus={restore} />}
  </>;
}
