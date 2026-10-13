import { BrandMark } from "../shared/ui/brand-mark";
import { Button } from "../shared/ui/button";
import { PanelLeftClose, House, MessageSquare, Settings } from "lucide-react";

import { appMessages } from "../messages/app";
import { commonMessages } from "../messages/common";
import { settingsMessages } from "../messages/settings";
import { useI18n } from "../shared/i18n";

import type { AppSnapshot, RuntimeStatus } from "../../shared/contracts";
import type { SessionResult } from "../../shared/session";
import { SessionActions } from "./SessionActions";

/** 应用导航只消费会话摘要；选择会话后由应用层显式加载工作台。 */
export function Sidebar({ snapshot, status, busy, selectedSessionId, renameDisabledSessionId, homeActive, onHome, onSession, onRename, onSettings, onHide, onRetry }: {
  snapshot: AppSnapshot | null; status: RuntimeStatus; busy: boolean; selectedSessionId: string | null;
  renameDisabledSessionId: string | null; onRename: (sessionId: string, title: string) => Promise<SessionResult>;
  homeActive: boolean; onHome: () => void; onSession: (id: string) => void;
  onSettings: () => void; onHide: () => void; onRetry: () => void;
}) {
  const i18n = useI18n();
  const disabled = busy || status !== "ready";
  return <aside id="app-sidebar" className="app-sidebar" aria-label={i18n.formatMessage(appMessages.appNavigation)}>
    <header className="flex items-center justify-between gap-2 px-2 pb-5 pt-1">
      <span className="flex items-center gap-2 text-sm font-semibold"><BrandMark className="size-5 text-primary" />{i18n.formatMessage(appMessages.appName)}</span>
      <Button variant="ghost" size="icon-xs" aria-label={i18n.formatMessage(appMessages.hideSidebar)} title={i18n.formatMessage(appMessages.hideSidebar)} onClick={onHide}><PanelLeftClose /></Button>
    </header>
    <nav className="flex flex-col gap-1" aria-label={i18n.formatMessage(appMessages.mainViews)}>
      <Button variant={homeActive ? "secondary" : "ghost"} className="w-full justify-start disabled:opacity-100" aria-current={homeActive ? "page" : undefined} disabled={homeActive} onClick={onHome}><House />{i18n.formatMessage(commonMessages.home)}</Button>
    </nav>
    <section className="mt-6 flex min-h-0 flex-1 flex-col" aria-labelledby="conversation-list-title">
      <h2 id="conversation-list-title" className="type-label mb-2 px-2">{i18n.formatMessage(commonMessages.conversations)}</h2>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {snapshot?.sessions.map(session => <div key={session.id} className="group/session relative">
          <Button variant={selectedSessionId === session.id ? "secondary" : "ghost"} className="w-full justify-start pr-9"
            aria-current={selectedSessionId === session.id ? "page" : undefined} disabled={disabled}
            onClick={() => onSession(session.id)} title={session.title}>
            <MessageSquare className="text-muted-foreground" /><span className="truncate">{session.title}</span>
          </Button>
          <SessionActions title={session.title} disabled={disabled} renameDisabled={renameDisabledSessionId === session.id}
            onRename={title => onRename(session.id, title)} />
        </div>)}
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
