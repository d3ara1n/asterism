import { X } from "lucide-react";
import type { AppSnapshot, Command } from "../../../shared/contracts";
import { t } from "../../shared/i18n";
import { Button, IconButton } from "../../shared/ui/button";

export type PanelKind = "objects" | "history";

/** 工作台内的对象与历史面板；应用级会话导航由侧栏承载。 */
export function SidePanel({ panel, snapshot, busy, writable, run, onClose }: {
  panel: PanelKind; snapshot: AppSnapshot | null; busy: boolean; writable: boolean;
  run: (command: Command) => Promise<boolean>; onClose: () => void;
}) {
  const task = snapshot?.task;
  const title = panel === "objects" ? t.objects : t.history;
  return <aside aria-label={title} className="floating-panel absolute bottom-[var(--overlay-inset)] left-[var(--overlay-inset)] top-[var(--overlay-inset)] z-20 flex w-72 flex-col">
    <header className="flex items-center justify-between p-2 pl-3">
      <h2 className="type-section">{title}</h2>
      <IconButton label={t.closePanel} onClick={onClose}><X /></IconButton>
    </header>
    <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
      {panel === "objects" && task?.objects.map(object => {
        const view = task.views.find(v => v.object_id === object.id);
        return <div className="list-item" key={object.id}>
          <div className="min-w-0 flex-1"><p className="truncate">{object.title}</p><p className="type-caption">{object.kind === "agent" ? t.kindAgent : t.kindNote}</p></div>
          <Button variant="ghost" size="sm" disabled={!writable} onClick={() => { void run({ type: "view.set", task_id: task.id, object_id: object.id, hidden: !view?.hidden }); }}>{view?.hidden ? t.open : t.close}</Button>
        </div>;
      })}
      {panel === "history" && task && <>
        <Button className="mb-3 w-full" variant={task.historical ? "secondary" : "default"} disabled={busy} onClick={() => { void run({ type: "workspace.read", task_id: task.id }); }}>{t.live}</Button>
        {task.history.map(entry => <button className={`list-item flex-col items-start gap-0.5 ${task.historical && task.at_seq === entry.seq ? "bg-secondary" : ""}`} key={entry.event_id} disabled={busy} onClick={() => { void run({ type: "workspace.read", task_id: task.id, at_seq: entry.seq }); }}>
          <span>{entry.label}</span><time className="type-caption">{new Date(entry.recorded_at).toLocaleString()}</time>
        </button>)}
      </>}
    </div>
  </aside>;
}
