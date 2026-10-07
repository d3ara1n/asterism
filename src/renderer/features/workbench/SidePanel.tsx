import { t } from "../../shared/i18n";
import { Button } from "../../shared/ui/button";
import { IslandPanel } from "../../shared/weave/IslandPanel";
import { useWorkbench } from "./context";

/** 对象面板浮岛：隐藏与重新打开卡片视图，不改变对象本身。 */
export function ObjectsPanel() {
  const { task, ready, busy, run } = useWorkbench();
  const writable = ready && !busy && !task.historical;
  return <IslandPanel title={t.objects}>
    <div className="flex flex-col gap-1">{task.objects.map(object => {
      const view = task.views.find(v => v.object_id === object.id);
      return <div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm" key={object.id}>
        <div className="min-w-0 flex-1"><p className="truncate">{object.title}</p><p className="type-caption">{object.kind === "agent" ? t.kindAgent : t.kindNote}</p></div>
        <Button variant="ghost" size="sm" disabled={!writable}
          onClick={() => { void run({ type: "view.set", task_id: task.id, object_id: object.id, hidden: !view?.hidden }); }}>{view?.hidden ? t.open : t.close}</Button>
      </div>;
    })}</div>
  </IslandPanel>;
}

/** 工作台事件历史浮岛：定位到事件只是查看，不恢复外部资源。 */
export function HistoryPanel() {
  const { task, busy, run } = useWorkbench();
  return <IslandPanel title={t.history}>
    <Button className="mb-3 w-full" variant={task.historical ? "secondary" : "default"} disabled={busy}
      onClick={() => { void run({ type: "workspace.read", task_id: task.id }); }}>{t.live}</Button>
    <div className="flex flex-col gap-0.5">{task.history.map(entry =>
      <Button key={entry.event_id} variant={task.historical && task.at_seq === entry.seq ? "secondary" : "ghost"}
        className="h-auto w-full flex-col items-start gap-0.5 py-1.5 font-normal" disabled={busy}
        onClick={() => { void run({ type: "workspace.read", task_id: task.id, at_seq: entry.seq }); }}>
        <span>{entry.label}</span><time className="type-caption">{new Date(entry.recorded_at).toLocaleString()}</time>
      </Button>)}</div>
  </IslandPanel>;
}
