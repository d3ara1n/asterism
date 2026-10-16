import { MoreHorizontal, Pencil } from "lucide-react";
import { useRef, useState } from "react";
import type { SessionResult } from "../../shared/session";
import { RenameSession } from "../features/session/RenameSession";
import { appMessages } from "../messages/app";
import { useI18n } from "../shared/i18n";
import { ListRowAction } from "@atelier/ui/ui/list-row";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@atelier/ui/ui/dropdown-menu";

/** 会话行菜单与重命名；操作独立于会话导航。 */
export function SessionActions({ title, disabled, renameDisabled, onRename }: {
  title: string; disabled: boolean; renameDisabled: boolean;
  onRename: (title: string) => Promise<SessionResult>;
}) {
  const i18n = useI18n();
  const trigger = useRef<HTMLButtonElement>(null);
  const [renaming, setRenaming] = useState(false);
  const cannotRename = disabled || renameDisabled;
  return <>
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <ListRowAction ref={trigger} disabled={disabled}
          aria-label={i18n.formatMessage(appMessages.conversationActions, { title })}>
          <MoreHorizontal />
        </ListRowAction>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onCloseAutoFocus={event => { if (renaming) event.preventDefault(); }}>
        <DropdownMenuItem disabled={cannotRename} onSelect={() => setRenaming(true)}>
          <Pencil />{i18n.text(appMessages.renameConversation)}…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    {renaming && <RenameSession title={title} disabled={cannotRename} onSave={onRename}
      onClose={() => setRenaming(false)} onRestoreFocus={() => trigger.current?.focus({ preventScroll: true })} />}
  </>;
}
