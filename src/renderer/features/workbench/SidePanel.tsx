import { t } from "../../shared/i18n";
import { Button } from "../../shared/ui/button";
import { IslandPanel } from "../../shared/weave/IslandPanel";
import { s } from "../configuration/state";
import { useWorkbench } from "./context";
import { useModuleViews } from "../../modules/views";

/** 对象面板浮岛：隐藏与重新打开卡片视图，不改变对象本身。 */
export function ObjectsPanel() {
  const { session, ready, busy, historical, run } = useWorkbench();
  const registry = useModuleViews();
  const writable = ready && !busy;
  return <IslandPanel title={t.objects}>
    <div className="flex flex-col gap-1">{session.objects.map(object => {
      const view = session.views.find(v => v.objectId === object.id);
      return <div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm" key={object.id}>
        <div className="min-w-0 flex-1"><p className="truncate">{object.title}</p><p className="type-caption">{registry.card(object.presentation)?.label ?? object.kind}</p></div>
        <Button variant="ghost" size="sm" disabled={!writable}
          onClick={() => { void run({ type: "view.set", sessionId: session.id, objectId: object.id, hidden: !view?.hidden }); }}>{view?.hidden ? t.open : t.close}</Button>
        {object.kind !== "agent" && <Button variant="ghost" size="sm" disabled={!writable || historical}
          onClick={() => { void run({ type: "object.remove", sessionId: session.id, objectId: object.id }); }}>{s("Remove", "移除")}</Button>}
      </div>;
    })}</div>
  </IslandPanel>;
}
