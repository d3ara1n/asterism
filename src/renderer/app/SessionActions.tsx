import { Archive, MoreHorizontal, Pencil } from "lucide-react";
import { useRef, useState } from "react";
import type { SessionResult } from "../../shared/session";
import { RenameSession } from "../features/session/RenameSession";
import { useDisposalWarnings } from "../features/session/disposal";
import { appMessages } from "../messages/app";
import { useI18n } from "../shared/i18n";
import { commonMessages } from "@atelier/ui/messages/common";
import { ListRowAction } from "@atelier/ui/ui/list-row";
import { Spinner } from "@atelier/ui/ui/spinner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@atelier/ui/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@atelier/ui/ui/alert-dialog";

/** 会话行菜单：重命名与归档；操作独立于会话导航。 */
export function SessionActions({ sessionId, title, disabled, renameDisabled, onRename, onArchive }: {
  sessionId: string; title: string; disabled: boolean; renameDisabled: boolean;
  onRename: (title: string) => Promise<SessionResult>;
  onArchive: () => Promise<SessionResult>;
}) {
  const i18n = useI18n();
  const trigger = useRef<HTMLButtonElement>(null);
  const [renaming, setRenaming] = useState(false);
  /** 归档总要二次确认；资源声明了结束提示时额外列出，内容与退出确认一致。 */
  const [confirming, setConfirming] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const warnings = useDisposalWarnings(sessionId, confirming ? "all" : null);
  const cannotRename = disabled || renameDisabled;
  const archive = async () => {
    setArchiving(true);
    try { const result = await onArchive(); if (result.ok) setConfirming(false); }
    finally { setArchiving(false); }
  };
  return <>
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <ListRowAction ref={trigger} disabled={disabled}
          aria-label={i18n.formatMessage(appMessages.conversationActions, { title })}>
          <MoreHorizontal />
        </ListRowAction>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onCloseAutoFocus={event => { if (renaming || confirming) event.preventDefault(); }}>
        <DropdownMenuItem disabled={cannotRename} onSelect={() => setRenaming(true)}>
          <Pencil />{i18n.text(appMessages.renameConversation)}…
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" disabled={disabled || archiving} onSelect={() => setConfirming(true)}>
          <Archive />{i18n.text(appMessages.archiveConversation)}…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    {renaming && <RenameSession title={title} disabled={cannotRename} onSave={onRename}
      onClose={() => setRenaming(false)} onRestoreFocus={() => trigger.current?.focus({ preventScroll: true })} />}
    <AlertDialog open={confirming} onOpenChange={open => { if (!open && !archiving) { setConfirming(false); trigger.current?.focus({ preventScroll: true }); } }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{i18n.text(appMessages.archiveConversationTitle)}</AlertDialogTitle>
          <AlertDialogDescription>{i18n.text(appMessages.archiveConversationDescription)}</AlertDialogDescription>
        </AlertDialogHeader>
        {warnings.length > 0 && <ul className="type-body space-y-1 text-destructive">
          {warnings.map(item => <li key={item.objectId}><span className="font-medium">{item.title}</span>：{i18n.text(item.warning)}</li>)}
        </ul>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={archiving}>{i18n.formatMessage(commonMessages.cancel)}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={archiving} aria-busy={archiving}
            onClick={event => { event.preventDefault(); void archive(); }}>
            {archiving && <Spinner />}{i18n.text(appMessages.archiveConfirm)}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}
