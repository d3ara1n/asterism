import { House, MessageSquare, PanelLeftClose, Plus, Settings } from "lucide-react";
import type { AppSnapshot, RuntimeStatus } from "../../shared/contracts";
import { t } from "../shared/i18n";
import { Button, IconButton } from "../shared/ui/button";
import { WeftMark } from "../shared/ui/weft-mark";

/** 应用导航只消费会话摘要；选择会话后由应用层显式加载工作台。 */
export function Sidebar({ snapshot, status, busy, selectedTaskId, homeActive, onHome, onTask, onSettings, onHide, onRetry }: {
  snapshot: AppSnapshot | null; status: RuntimeStatus; busy: boolean; selectedTaskId: string | null;
  homeActive: boolean; onHome: () => void; onTask: (id: string) => void;
  onSettings: () => void; onHide: () => void; onRetry: () => void;
}) {
  return <aside id="app-sidebar" className="app-sidebar" aria-label={t.appNavigation}>
    <header className="flex items-center justify-between gap-2 px-2 pb-5 pt-1">
      <span className="flex items-center gap-2 text-sm font-semibold"><WeftMark className="size-5 text-primary" />{t.appName}</span>
      <IconButton label={t.hideSidebar} onClick={onHide}><PanelLeftClose /></IconButton>
    </header>
    <nav className="flex flex-col gap-1" aria-label={t.mainViews}>
      <button className="list-item" aria-current={homeActive ? "page" : undefined} onClick={onHome}><House className="size-4" />{t.home}</button>
      <Button variant="secondary" className="mt-2 w-full justify-start" onClick={onHome}><Plus />{t.newConversation}</Button>
    </nav>
    <section className="mt-6 flex min-h-0 flex-1 flex-col" aria-labelledby="conversation-list-title">
      <h2 id="conversation-list-title" className="type-label mb-2 px-2">{t.conversations}</h2>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {snapshot?.tasks.map(task => <button key={task.id} className="list-item"
          aria-current={selectedTaskId === task.id ? "page" : undefined} disabled={busy || status !== "ready"}
          onClick={() => onTask(task.id)} title={task.title}>
          <MessageSquare className="size-3.5 shrink-0 text-muted-foreground" /><span className="truncate">{task.title}</span>
        </button>)}
        {snapshot?.tasks.length === 0 && <p className="type-caption px-2 py-3">{t.noConversations}</p>}
        {!snapshot && status !== "unavailable" && <p role="status" className="type-caption px-2 py-3">{t.loadingConversations}</p>}
        {status === "unavailable" && <p role="status" className="type-caption px-2 py-3">{t.statusUnavailable}</p>}
        {!snapshot && !busy && status !== "unavailable" && <Button variant="ghost" size="sm" onClick={onRetry}>{t.retry}</Button>}
      </div>
    </section>
    <footer className="mt-3 border-t border-border/70 pt-2">
      <button className="list-item" onClick={onSettings}><Settings className="size-4" />{t.settings}</button>
    </footer>
  </aside>;
}
