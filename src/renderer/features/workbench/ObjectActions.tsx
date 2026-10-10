import { useState } from "react";
import { MoreHorizontal, Trash2 } from "lucide-react";
import type { WorkbenchObject } from "../../../shared/workbench";
import { t } from "../../shared/i18n";
import { Button } from "../../shared/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../../shared/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../../shared/ui/alert-dialog";
import { Spinner } from "../../shared/ui/spinner";
import { useSession, useSessionProgress } from "../session/state";
import { useWorkbench } from "./context";

/** 领域操作放在卡片菜单，快速对象目录只负责定位。 */
export function ObjectActions({ object }: { object: WorkbenchObject }) {
  const { ready, busy, historical } = useWorkbench();
  const [open, setOpen] = useState(false);
  return <><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-xs" aria-label={t.objectActions}><MoreHorizontal /></Button></DropdownMenuTrigger>
    <DropdownMenuContent align="end"><DropdownMenuItem disabled={!ready || busy || historical} onSelect={() => setOpen(true)}><Trash2 />{t.removeObject(object.title)}…</DropdownMenuItem></DropdownMenuContent>
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
