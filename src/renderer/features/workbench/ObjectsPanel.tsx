import { useState } from "react";
import type { WorkbenchObject } from "../../../shared/workbench";
import { t } from "../../shared/i18n";
import { Button } from "../../shared/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "../../shared/ui/alert-dialog";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "../../shared/ui/item";
import { Spinner } from "../../shared/ui/spinner";
import { IslandPanel } from "../../shared/weave/IslandPanel";
import { useWorkbench } from "./context";
import { useModuleViews } from "../../modules/views";

/** 对象面板浮岛：隐藏与重新打开卡片视图；移除对象前需确认。 */
export function ObjectsPanel() {
  const { session, ready, busy, historical, run } = useWorkbench();
  const registry = useModuleViews();
  const [removing, setRemoving] = useState<WorkbenchObject | null>(null);
  const writable = ready && !busy;
  return <IslandPanel title={t.objects}>
    <ItemGroup className="gap-1">
      {session.objects.map(object => {
        const hidden = session.views.find(v => v.objectId === object.id)?.hidden ?? false;
        return <Item key={object.id} size="sm" className="px-2 py-1.5">
          <ItemContent className="min-w-0">
            <ItemTitle className="truncate">{object.title}</ItemTitle>
            <ItemDescription>{registry.card(object.presentation)?.label ?? object.kind}</ItemDescription>
          </ItemContent>
          <ItemActions>
            <Button variant="ghost" size="sm" disabled={!writable}
              aria-label={hidden ? t.openObject(object.title) : t.closeObject(object.title)}
              onClick={() => { void run({ type: "view.set", sessionId: session.id, objectId: object.id, hidden: !hidden }); }}>
              {hidden ? t.open : t.close}
            </Button>
            {object.kind !== "agent" && <Button variant="ghost" size="sm" disabled={!writable || historical}
              aria-label={t.removeObject(object.title)} onClick={() => setRemoving(object)}>
              {t.remove}
            </Button>}
          </ItemActions>
        </Item>;
      })}
    </ItemGroup>
    <AlertDialog open={!!removing} onOpenChange={open => { if (!open) setRemoving(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t.removeObjectTitle}</AlertDialogTitle>
          <AlertDialogDescription>{removing && t.removeObjectDescription(removing.title)}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t.cancel}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={!writable || historical} aria-busy={busy} onClick={event => {
            // 等待运行时受理后再关闭；失败时保留对话框。
            event.preventDefault();
            if (!removing) return;
            void run({ type: "object.remove", sessionId: session.id, objectId: removing.id })
              .then(saved => { if (saved) setRemoving(null); });
          }}>{busy && <Spinner aria-hidden="true" />}{t.remove}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </IslandPanel>;
}
