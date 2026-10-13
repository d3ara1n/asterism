import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuItem, DropdownMenuSeparator } from "../../shared/ui/dropdown-menu";

import { Button } from "../../shared/ui/button";
import { MoreHorizontal, Scaling, RotateCcw, Trash2 } from "lucide-react";

import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "../../shared/ui/alert-dialog";

import { Spinner } from "../../shared/ui/spinner";
import { commonMessages } from "../../messages/common";
import { objectsMessages } from "../../messages/objects";
import { useI18n } from "../../shared/i18n";
import { useState } from "react";

import { maximumCardDimension, type CardSize, type WorkbenchObject } from "../../../shared/workbench";

import { useSession, useSessionProgress } from "../session/state";
import { useWorkbench } from "./context";
import type { ViewPatch } from "./ObjectCard";

/** 卡片菜单集中管理视图尺寸与对象移除；快速对象目录只负责定位。 */
export function ObjectActions({ object, defaultSize, onView }: {
  object: WorkbenchObject; defaultSize: CardSize; onView: (patch: ViewPatch) => void;
}) {
  const i18n = useI18n();
  const { ready, busy } = useWorkbench();
  const [open, setOpen] = useState(false);
  return <><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-xs" aria-label={i18n.formatMessage(objectsMessages.objectActions)}><MoreHorizontal /></Button></DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuSub><DropdownMenuSubTrigger><Scaling />{i18n.formatMessage(objectsMessages.cardSize)}</DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          {[{ label: i18n.formatMessage(objectsMessages.cardSizeLarge), scale: 1.5 }, { label: i18n.formatMessage(objectsMessages.cardSizeExtraLarge), scale: 2 }].map(({ label, scale }) =>
            <DropdownMenuItem key={scale} onSelect={() => onView({ size: {
              width: Math.min(maximumCardDimension, Math.round(defaultSize.width * scale)),
              height: Math.min(maximumCardDimension, Math.round(defaultSize.height * scale)),
            } })}>{label}</DropdownMenuItem>)}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => onView({ size: null })}><RotateCcw />{i18n.formatMessage(objectsMessages.restoreCardSize)}</DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSeparator />
      <DropdownMenuItem disabled={!ready || busy} onSelect={() => setOpen(true)}><Trash2 />{i18n.formatMessage(objectsMessages.removeObject, { title: object.title })}…</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>{open && <RemoveObject object={object} onClose={() => setOpen(false)} />}</>;
}
function RemoveObject({ object, onClose }: { object: WorkbenchObject; onClose: () => void }) {
  const i18n = useI18n();
  const { controller, session, ready, busy, run } = useWorkbench();
  const progress = useSessionProgress(controller);
  const { state } = useSession(controller);
  const [saving, setSaving] = useState(false);
  const unsettled = progress.unsettledObjectIds.includes(object.id);
  const disabled = !ready || busy || saving || unsettled;
  return <AlertDialog open onOpenChange={open => { if (!open && !saving) onClose(); }}><AlertDialogContent>
    <AlertDialogHeader><AlertDialogTitle>{i18n.formatMessage(objectsMessages.removeObjectTitle)}</AlertDialogTitle><AlertDialogDescription>{i18n.formatMessage(objectsMessages.removeObjectDescription, { title: object.title })}</AlertDialogDescription></AlertDialogHeader>
    {unsettled && <p className="type-caption">{i18n.formatMessage(objectsMessages.objectStillActive)}</p>}
    {state.error && <p className="type-caption" role="alert">{i18n.text(state.error)}</p>}
    <AlertDialogFooter><AlertDialogCancel disabled={saving}>{i18n.formatMessage(commonMessages.cancel)}</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={disabled} aria-busy={saving}
      onClick={event => { event.preventDefault(); setSaving(true); void run({ type: "object.remove", sessionId: session.id, objectId: object.id })
        .then(saved => { if (saved) onClose(); }).finally(() => setSaving(false)); }}>{saving && <Spinner />}{i18n.formatMessage(commonMessages.remove)}</AlertDialogAction></AlertDialogFooter>
  </AlertDialogContent></AlertDialog>;
}
