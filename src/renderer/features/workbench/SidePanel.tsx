import { t } from "../../shared/i18n";
import { Button } from "../../shared/ui/button";
import { IslandPanel } from "../../shared/weave/IslandPanel";
import { s } from "../configuration/state";
import { useWorkbench } from "./context";

/** 对象面板浮岛：隐藏与重新打开卡片视图，不改变对象本身。 */
export function ObjectsPanel() {
  const { task, ready, busy, run } = useWorkbench();
  const writable = ready && !busy;
  return <IslandPanel title={t.objects}>
    <div className="flex flex-col gap-1">{task.objects.map(object => {
      const view = task.views.find(v => v.object_id === object.id);
      return <div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm" key={object.id}>
        <div className="min-w-0 flex-1"><p className="truncate">{object.title}</p><p className="type-caption">{object.kind === "agent" ? t.kindAgent : object.kind === "directory" ? s("Directory", "目录") : t.kindNote}</p></div>
        <Button variant="ghost" size="sm" disabled={!writable}
          onClick={() => { void run({ type: "view.set", session_id: task.id, object_id: object.id, hidden: !view?.hidden }); }}>{view?.hidden ? t.open : t.close}</Button>
        {object.kind !== "agent" && <Button variant="ghost" size="sm" disabled={!writable}
          onClick={() => { void run({ type: "object.remove", session_id: task.id, object_id: object.id }); }}>{s("Remove", "移除")}</Button>}
      </div>;
    })}</div>
  </IslandPanel>;
}
