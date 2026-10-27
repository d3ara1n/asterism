import { BrandMark } from "@asterism/ui/ui/brand-mark";
import { Button } from "@asterism/ui/ui/button";
import { IconButton } from "@asterism/ui/ui/icon-button";
import { ListRow } from "@asterism/ui/ui/list-row";
import { PanelLeftClose, House, MessageSquare, Settings } from "lucide-react";

import { appMessages } from "../messages/app";
import { commonMessages } from "@asterism/ui/messages/common";
import { settingsMessages } from "../messages/settings";
import { useI18n } from "../shared/i18n";

import type { AppSnapshot, RuntimeStatus } from "../../shared/contracts";
import type { SessionResult } from "../../shared/session";
import { SessionActions } from "./SessionActions";
import { SessionStatus } from "./SessionStatus";
import type { ResourceStatusMark } from "./resource-status";

/** Application navigation consumes only session summaries; after selecting a session, the application layer explicitly loads the workbench. */
export function Sidebar({ snapshot, status, busy, resourceStatuses, selectedSessionId, renameDisabledSessionId, homeActive, onHome, onSession, onRename, onArchive, onTemplateSaved, onSettings, onHide, onRetry }: {
  snapshot: AppSnapshot | null; status: RuntimeStatus; busy: boolean; selectedSessionId: string | null;
  resourceStatuses: readonly ResourceStatusMark[];
  renameDisabledSessionId: string | null; onRename: (sessionId: string, title: string) => Promise<SessionResult>;
  onArchive: (sessionId: string) => Promise<SessionResult>;
  onTemplateSaved: () => void;
  homeActive: boolean; onHome: () => void; onSession: (id: string) => void;
  onSettings: () => void; onHide: () => void; onRetry: () => void;
}) {
  const i18n = useI18n();
  const disabled = busy || status !== "ready";
  return <aside id="app-sidebar" className="app-sidebar" aria-label={i18n.formatMessage(appMessages.appNavigation)}>
    <header className="flex items-center justify-between gap-2 px-2 pb-5 pt-1">
      <span className="flex items-center gap-2 text-sm font-semibold"><BrandMark className="size-5 text-primary" />{i18n.formatMessage(appMessages.appName)}</span>
      <IconButton size="icon-xs" label={i18n.formatMessage(appMessages.hideSidebar)} onClick={onHide}><PanelLeftClose /></IconButton>
    </header>
    <nav className="flex flex-col gap-1" aria-label={i18n.formatMessage(appMessages.mainViews)}>
      <Button variant={homeActive ? "selected" : "ghost"} className="w-full justify-start disabled:opacity-100" aria-current={homeActive ? "page" : undefined} disabled={homeActive} onClick={onHome}><House />{i18n.formatMessage(commonMessages.home)}</Button>
    </nav>
    <section className="mt-6 flex min-h-0 flex-1 flex-col" aria-labelledby="conversation-list-title">
      <h2 id="conversation-list-title" className="type-label mb-2 px-2">{i18n.formatMessage(commonMessages.conversations)}</h2>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {snapshot?.sessions.map(session => {
          const marks = resourceStatuses.filter(mark => mark.resource.sessionId === session.id);
          return <ListRow key={session.id} variant="navigation"
            selected={selectedSessionId === session.id} disabled={disabled} onOpen={() => onSession(session.id)}
            buttonProps={{ title: session.title, "aria-current": selectedSessionId === session.id ? "page" : undefined }}
            media={<MessageSquare className="text-muted-foreground" />} title={<span className="block truncate">{session.title}</span>}
            actions={<>
              <SessionStatus marks={marks} />
              <SessionActions sessionId={session.id} title={session.title} disabled={disabled} renameDisabled={renameDisabledSessionId === session.id}
                onRename={title => onRename(session.id, title)} onArchive={() => onArchive(session.id)} onTemplateSaved={onTemplateSaved} />
            </>} />;
        })}
        {snapshot?.sessions.length === 0 && <p className="type-caption px-2 py-3">{i18n.formatMessage(appMessages.noConversations)}</p>}
        {!snapshot && status !== "unavailable" && <p role="status" className="type-caption px-2 py-3">{i18n.formatMessage(appMessages.loadingConversations)}</p>}
        {status === "unavailable" && <p role="status" className="type-caption px-2 py-3">{i18n.formatMessage(commonMessages.statusUnavailable)}</p>}
        {!snapshot && !busy && status !== "unavailable" && <Button variant="ghost" size="sm" onClick={onRetry}>{i18n.formatMessage(commonMessages.retry)}</Button>}
      </div>
    </section>
    <footer className="mt-3 border-t pt-2">
      <Button variant="ghost" className="w-full justify-start" onClick={onSettings}><Settings />{i18n.formatMessage(settingsMessages.settings)}</Button>
    </footer>
  </aside>;
}
