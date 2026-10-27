import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuGroup, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuItem, DropdownMenuSeparator } from "@asterism/ui/ui/dropdown-menu";

import { Button } from "@asterism/ui/ui/button";
import { MoreHorizontal, PenLine, Scaling, RotateCcw, Trash2 } from "lucide-react";

import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@asterism/ui/ui/alert-dialog";

import { Spinner } from "@asterism/ui/ui/spinner";
import { commonMessages } from "@asterism/ui/messages/common";
import { objectsMessages } from "../../messages/objects";
import { useI18n } from "../../shared/i18n";
import { useRef, useState } from "react";

import { maximumCardDimension, type CardSize, type WorkbenchObject } from "../../../shared/workbench";

import { useSessionActivity } from "../session/state";
import { useDisposalWarnings } from "../session/disposal";
import { useWorkbench } from "./context";
import type { ViewPatch } from "./ObjectCard";
import { RenameObject } from "./RenameObject";

/** The card menu centralizes name, view dimensions, and object removal. */
export function ObjectActions({ object, defaultSize, onView }: {
  object: WorkbenchObject; defaultSize: CardSize; onView: (patch: ViewPatch) => void;
}) {
  const i18n = useI18n();
  const { ready } = useWorkbench();
  const [dialog, setDialog] = useState<"rename" | "remove" | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const openingRename = useRef(false);
  return <><DropdownMenu><DropdownMenuTrigger asChild><Button ref={trigger} variant="ghost" size="icon-xs" aria-label={i18n.formatMessage(objectsMessages.objectActions)}><MoreHorizontal /></Button></DropdownMenuTrigger>
    <DropdownMenuContent align="end" onCloseAutoFocus={event => {
      if (openingRename.current) { event.preventDefault(); openingRename.current = false; }
    }}>
      <DropdownMenuGroup>
        <DropdownMenuItem disabled={!ready} onSelect={() => { openingRename.current = true; setDialog("rename"); }}>
          <PenLine />{i18n.text(objectsMessages.renameObject)}…
        </DropdownMenuItem>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuSub><DropdownMenuSubTrigger><Scaling />{i18n.formatMessage(objectsMessages.cardSize)}</DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <DropdownMenuGroup>
            {[{ label: i18n.formatMessage(objectsMessages.cardSizeLarge), scale: 1.5 }, { label: i18n.formatMessage(objectsMessages.cardSizeExtraLarge), scale: 2 }].map(({ label, scale }) =>
              <DropdownMenuItem key={scale} onSelect={() => onView({ size: {
                width: Math.min(maximumCardDimension, Math.round(defaultSize.width * scale)),
                height: Math.min(maximumCardDimension, Math.round(defaultSize.height * scale)),
              } })}>{label}</DropdownMenuItem>)}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onView({ size: null })}><RotateCcw />{i18n.formatMessage(objectsMessages.restoreCardSize)}</DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSeparator />
      <DropdownMenuGroup><DropdownMenuItem disabled={!ready} onSelect={() => setDialog("remove")}><Trash2 />{i18n.formatMessage(objectsMessages.removeObject, { title: object.title })}…</DropdownMenuItem></DropdownMenuGroup>
    </DropdownMenuContent>
  </DropdownMenu>{dialog === "remove" && <RemoveObject object={object} onClose={() => setDialog(null)} />}
    {dialog === "rename" && <RenameObject object={object} onClose={() => setDialog(null)} onRestoreFocus={() => trigger.current?.focus()} />}</>;
}
function RemoveObject({ object, onClose }: { object: WorkbenchObject; onClose: () => void }) {
  const i18n = useI18n();
  const { controller, session, ready, run } = useWorkbench();
  const progress = useSessionActivity(controller);
  const [saving, setSaving] = useState(false);
  const unsettled = progress.busyObjectIds.includes(object.id);
  const [warning] = useDisposalWarnings(session.id, [object.id]);
  const disabled = !ready || saving || unsettled;
  return <AlertDialog open onOpenChange={open => { if (!open && !saving) onClose(); }}><AlertDialogContent>
    <AlertDialogHeader><AlertDialogTitle>{i18n.formatMessage(objectsMessages.removeObjectTitle)}</AlertDialogTitle><AlertDialogDescription>{i18n.formatMessage(objectsMessages.removeObjectDescription, { title: object.title })}</AlertDialogDescription></AlertDialogHeader>
    {unsettled && <p className="type-caption">{i18n.formatMessage(objectsMessages.objectStillActive)}</p>}
    {warning && <p className="type-body text-destructive">{i18n.text(warning.warning)}</p>}
    <AlertDialogFooter><AlertDialogCancel disabled={saving}>{i18n.formatMessage(commonMessages.cancel)}</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={disabled} aria-busy={saving}
      onClick={event => { event.preventDefault(); setSaving(true); void run({ type: "object.remove", sessionId: session.id, objectId: object.id })
        .then(saved => { if (saved) onClose(); }).finally(() => setSaving(false)); }}>{saving && <Spinner />}{i18n.formatMessage(commonMessages.remove)}</AlertDialogAction></AlertDialogFooter>
  </AlertDialogContent></AlertDialog>;
}
