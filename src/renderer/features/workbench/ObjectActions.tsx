import { useState } from "react";
import { MoreHorizontal, RotateCcw, Scaling, Trash2 } from "lucide-react";
import { maximumCardDimension, type CardSize, type WorkbenchObject } from "../../../shared/workbench";
import { t } from "../../shared/i18n";
import { Button } from "../../shared/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent } from "../../shared/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../../shared/ui/alert-dialog";
import { Spinner } from "../../shared/ui/spinner";
import { useSession, useSessionProgress } from "../session/state";
import { useWorkbench } from "./context";
import type { ViewPatch } from "./ObjectCard";

/** 卡片菜单集中管理视图尺寸与对象移除；快速对象目录只负责定位。 */
export function ObjectActions({ object, defaultSize, onView }: {
  object: WorkbenchObject; defaultSize: CardSize; onView: (patch: ViewPatch) => void;
}) {
  const { ready, busy, historical } = useWorkbench();
  const [open, setOpen] = useState(false);
  return <><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-xs" aria-label={t.objectActions}><MoreHorizontal /></Button></DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuSub><DropdownMenuSubTrigger><Scaling />{t.cardSize}</DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          {[{ label: t.cardSizeLarge, scale: 1.5 }, { label: t.cardSizeExtraLarge, scale: 2 }].map(({ label, scale }) =>
            <DropdownMenuItem key={label} onSelect={() => onView({ size: {
              width: Math.min(maximumCardDimension, Math.round(defaultSize.width * scale)),
              height: Math.min(maximumCardDimension, Math.round(defaultSize.height * scale)),
            } })}>{label}</DropdownMenuItem>)}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => onView({ size: null })}><RotateCcw />{t.restoreCardSize}</DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSeparator />
      <DropdownMenuItem disabled={!ready || busy || historical} onSelect={() => setOpen(true)}><Trash2 />{t.removeObject(object.title)}…</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>{open && <RemoveObject object={object} onClose={() => setOpen(false)} />}</>;
}
function RemoveObject({ object, onClose }: { object: WorkbenchObject; onClose: () => void }) {
  const { controller, session, ready, busy, historical, run } = useWorkbench();
  const progress = useSessionProgress(controller);
  const { state } = useSession(controller);
  const [saving, setSaving] = useState(false);
  const unsettled = progress.unsettledObjectIds.includes(object.id);
  const disabled = !ready || busy || historical || saving || unsettled;
  return <AlertDialog open onOpenChange={open => { if (!open && !saving) onClose(); }}><AlertDialogContent>
    <AlertDialogHeader><AlertDialogTitle>{t.removeObjectTitle}</AlertDialogTitle><AlertDialogDescription>{t.removeObjectDescription(object.title)}</AlertDialogDescription></AlertDialogHeader>
    {unsettled && <p className="type-caption">{t.objectStillActive}</p>}
    {state.error && <p className="type-caption" role="alert">{state.error}</p>}
    <AlertDialogFooter><AlertDialogCancel disabled={saving}>{t.cancel}</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={disabled} aria-busy={saving}
      onClick={event => { event.preventDefault(); setSaving(true); void run({ type: "object.remove", sessionId: session.id, objectId: object.id })
        .then(saved => { if (saved) onClose(); }).finally(() => setSaving(false)); }}>{saving && <Spinner />}{t.remove}</AlertDialogAction></AlertDialogFooter>
  </AlertDialogContent></AlertDialog>;
}
