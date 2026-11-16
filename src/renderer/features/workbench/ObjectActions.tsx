import { ActionMenu, ActionMenuTarget, ActionMenuTrigger, ActionMenuContent, ActionMenuGroup, ActionMenuItem, ActionMenuSeparator } from "@asterism-app/ui/ui/action-menu";

import { Button } from "@asterism-app/ui/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@asterism-app/ui/ui/tooltip";
import { MoreHorizontal, PenLine, Trash2 } from "lucide-react";

import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@asterism-app/ui/ui/alert-dialog";

import { Spinner } from "@asterism-app/ui/ui/spinner";
import { commonMessages } from "@asterism-app/ui/messages/common";
import { objectsMessages } from "../../messages/objects";
import { useI18n } from "../../shared/i18n";
import { useRef, useState, type ReactElement, type ReactNode } from "react";

import type { CardAppearance } from "@asterism-app/sdk/contracts";
import type { WorkbenchObject } from "../../../shared/workbench";

import { useSessionActivity } from "../session/state";
import { useDisposalWarnings } from "../session/disposal";
import { DisposalWarningsNotice } from "../session/DisposalWarnings";
import { useWorkbench } from "./context";
import type { ViewPatch } from "./ObjectCard";
import { RenameObject } from "./RenameObject";
import { SizeMenu } from "./SizeMenu";
import { cardSize } from "./sizing";

/** The card menu centralizes name, view dimensions, and object removal. */
export function ObjectActions({ object, appearance, onView, children }: {
  object: WorkbenchObject; appearance: CardAppearance; onView: (patch: ViewPatch) => void;
  children: (trigger: ReactNode, renderHeader: (header: ReactElement) => ReactNode) => ReactNode;
}) {
  const i18n = useI18n();
  const defaultSize = cardSize(appearance);
  const { ready } = useWorkbench();
  const [dialog, setDialog] = useState<"rename" | "remove" | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const openingRename = useRef(false);
  const menuTrigger = <Tooltip>
    <TooltipTrigger asChild><ActionMenuTrigger asChild>
      <Button ref={trigger} variant="ghost" size="icon-xs" aria-label={i18n.formatMessage(objectsMessages.objectActions)}><MoreHorizontal /></Button>
    </ActionMenuTrigger></TooltipTrigger>
    <TooltipContent>{i18n.text(objectsMessages.objectActions)}</TooltipContent>
  </Tooltip>;
  return <><ActionMenu>
    {children(menuTrigger, header => <ActionMenuTarget asChild blankOnly>{header}</ActionMenuTarget>)}
    <ActionMenuContent align="end" onCloseAutoFocus={event => {
      if (openingRename.current) { event.preventDefault(); openingRename.current = false; }
    }}>
      <ActionMenuGroup>
        <ActionMenuItem disabled={!ready} onSelect={() => { openingRename.current = true; setDialog("rename"); }}>
          <PenLine />{i18n.text(objectsMessages.renameObject)}…
        </ActionMenuItem>
      </ActionMenuGroup>
      <ActionMenuSeparator />
      <SizeMenu onRestore={() => onView({ size: null })} onScale={scale => onView({ size: scale === 1 ? null : cardSize(appearance, {
        width: Math.round(defaultSize.width * scale),
        height: Math.round(defaultSize.height * scale),
      }) })} />
      <ActionMenuSeparator />
      <ActionMenuGroup><ActionMenuItem disabled={!ready} onSelect={() => setDialog("remove")}><Trash2 />{i18n.formatMessage(objectsMessages.removeObject, { title: object.title })}…</ActionMenuItem></ActionMenuGroup>
    </ActionMenuContent>
  </ActionMenu>{dialog === "remove" && <RemoveObject object={object} onClose={() => setDialog(null)} />}
    {dialog === "rename" && <RenameObject object={object} onClose={() => setDialog(null)} onRestoreFocus={() => trigger.current?.focus()} />}</>;
}
function RemoveObject({ object, onClose }: { object: WorkbenchObject; onClose: () => void }) {
  const i18n = useI18n();
  const { controller, session, ready, run } = useWorkbench();
  const progress = useSessionActivity(controller);
  const [saving, setSaving] = useState(false);
  const unsettled = progress.busyObjectIds.includes(object.id);
  const warnings = useDisposalWarnings(session.id, [object.id]);
  const disabled = !ready || saving || unsettled || warnings.status === "loading";
  return <AlertDialog open onOpenChange={open => { if (!open && !saving) onClose(); }}><AlertDialogContent>
    <AlertDialogHeader><AlertDialogTitle>{i18n.formatMessage(objectsMessages.removeObjectTitle)}</AlertDialogTitle><AlertDialogDescription>{i18n.formatMessage(objectsMessages.removeObjectDescription, { title: object.title })}</AlertDialogDescription></AlertDialogHeader>
    {unsettled && <p className="type-caption">{i18n.formatMessage(objectsMessages.objectStillActive)}</p>}
    <DisposalWarningsNotice state={warnings} />
    <AlertDialogFooter><AlertDialogCancel disabled={saving}>{i18n.formatMessage(commonMessages.cancel)}</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={disabled} aria-busy={saving}
      onClick={event => { event.preventDefault(); setSaving(true); void run({ type: "object.remove", sessionId: session.id, objectId: object.id })
        .then(saved => { if (saved) onClose(); }).finally(() => setSaving(false)); }}>{saving && <Spinner />}{i18n.text(warnings.status === "error" ? objectsMessages.disposalContinue : commonMessages.remove)}</AlertDialogAction></AlertDialogFooter>
  </AlertDialogContent></AlertDialog>;
}
