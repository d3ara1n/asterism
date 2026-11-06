import { Archive, Coffee, LayoutTemplate, ListChecks, MoreHorizontal, Pencil } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import type { SessionResult } from "../../shared/session";
import { RenameSession } from "../features/session/RenameSession";
import { SaveTemplate } from "../features/templates/SaveTemplate";
import { templateMessages } from "../../shared/template-messages";
import { useDisposalWarnings } from "../features/session/disposal";
import { appMessages } from "../messages/app";
import { useI18n } from "../shared/i18n";
import { commonMessages } from "@asterism-app/ui/messages/common";
import { ListRowAction } from "@asterism-app/ui/ui/list-row";
import { Spinner } from "@asterism-app/ui/ui/spinner";
import { useFolders } from "../features/folders/context";
import { FolderDialog } from "../features/folders/FolderDialog";
import { MoveToFolderMenu } from "../features/folders/menus";
import { toast } from "../shared/toast";
import { DropdownMenu, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@asterism-app/ui/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@asterism-app/ui/ui/alert-dialog";

// Two-state rows keep their identity icon in the shared leading column and show state with a trailing switch-shaped indicator.
// The row remains the single menuitemcheckbox target; the indicator is presentation only.
function ToggleItem({ icon, label, checked, disabled, onCheckedChange }: {
  icon: ReactNode; label: string; checked: boolean; disabled: boolean; onCheckedChange: (checked: boolean) => void;
}) {
  return <DropdownMenuCheckboxItem checked={checked} disabled={disabled} onCheckedChange={onCheckedChange}
    className="group/toggle pl-2 [&>span:first-child]:hidden [&_svg:not([class*='text-'])]:text-muted-foreground">
    {icon}{label}
    <span aria-hidden className="ml-auto inline-flex h-3.5 w-6 shrink-0 items-center rounded-full p-px transition-colors motion-reduce:transition-none group-data-[state=checked]/toggle:bg-primary group-data-[state=unchecked]/toggle:bg-input dark:group-data-[state=unchecked]/toggle:bg-input/80">
      <span className="block size-3 rounded-full bg-background transition-transform motion-reduce:transition-none group-data-[state=checked]/toggle:translate-x-2.5 dark:group-data-[state=checked]/toggle:bg-primary-foreground dark:group-data-[state=unchecked]/toggle:bg-foreground" />
    </span>
  </DropdownMenuCheckboxItem>;
}

/** Session row menu: rename, folder membership, save as template, and archive; actions are independent of session navigation. */
export function SessionActions({ sessionId, title, folderId, disabled, sleeping, renameDisabled, onRename, onArchive, onTemplateSaved, completed, onCompletedChange, keepAwake, onKeepAwakeChange }: {
  sessionId: string; title: string; folderId: string | null; disabled: boolean; sleeping: boolean; renameDisabled: boolean;
  onRename: (title: string) => Promise<SessionResult>;
  onArchive: () => Promise<SessionResult>;
  onTemplateSaved: () => void;
  completed: boolean; onCompletedChange: (completed: boolean) => Promise<void>;
  keepAwake: boolean; onKeepAwakeChange: (keepAwake: boolean) => Promise<void>;
}) {
  const i18n = useI18n();
  const { run } = useFolders();
  const trigger = useRef<HTMLButtonElement>(null);
  const [togglingAwake, setTogglingAwake] = useState(false);
  const [marking, setMarking] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  /** Archiving always requires confirmation; resources with disposal notices are listed additionally, using the same content as exit confirmation. */
  const [confirming, setConfirming] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const warnings = useDisposalWarnings(sessionId, confirming ? "all" : null);
  const cannotRename = disabled || sleeping || renameDisabled;
  const move = async (target: string | null) => {
    const failure = await run({ type: "session.move", sessionId, folderId: target });
    if (failure) toast.error(i18n.text(failure));
  };
  const markCompleted = async (value: boolean) => {
    setMarking(true);
    try { await onCompletedChange(value); }
    finally { setMarking(false); }
  };
  const setAwake = async (value: boolean) => {
    setTogglingAwake(true);
    try { await onKeepAwakeChange(value); }
    finally { setTogglingAwake(false); }
  };
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
      <DropdownMenuContent align="end" onCloseAutoFocus={event => { if (renaming || confirming || savingTemplate || creatingFolder) event.preventDefault(); }}>
        <DropdownMenuItem disabled={cannotRename} onSelect={() => setRenaming(true)}>
          <Pencil />{i18n.text(appMessages.renameConversation)}…
        </DropdownMenuItem>
        <ToggleItem icon={<ListChecks />} label={i18n.text(appMessages.completed)} checked={completed} disabled={disabled || marking}
          onCheckedChange={value => { void markCompleted(value); }} />
        <ToggleItem icon={<Coffee />} label={i18n.text(appMessages.keepAwake)} checked={keepAwake} disabled={disabled || togglingAwake}
          onCheckedChange={value => { void setAwake(value); }} />
        <MoveToFolderMenu value={folderId} disabled={disabled} onMove={target => { void move(target); }} onCreate={() => setCreatingFolder(true)} />
        <DropdownMenuItem disabled={disabled || sleeping} onSelect={() => setSavingTemplate(true)}>
          <LayoutTemplate />{i18n.text(templateMessages.saveAs)}…
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" disabled={disabled || archiving} onSelect={() => setConfirming(true)}>
          <Archive />{i18n.text(appMessages.archiveConversation)}…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    {renaming && <RenameSession title={title} disabled={cannotRename} onSave={onRename}
      onClose={() => setRenaming(false)} onRestoreFocus={() => trigger.current?.focus({ preventScroll: true })} />}
    {savingTemplate && <SaveTemplate sessionId={sessionId} title={title} folderId={folderId} disabled={disabled} onSaved={onTemplateSaved}
      onClose={() => setSavingTemplate(false)} onRestoreFocus={() => trigger.current?.focus({ preventScroll: true })} />}
    {creatingFolder && <FolderDialog onSaved={target => { void move(target); }} onClose={() => setCreatingFolder(false)}
      onRestoreFocus={() => trigger.current?.focus({ preventScroll: true })} />}
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
