import { MoreHorizontal, Pencil } from "lucide-react";
import { useRef, useState } from "react";
import type { SessionResult } from "../../shared/session";
import { RenameSession } from "../features/session/RenameSession";
import { appMessages } from "../messages/app";
import { useI18n } from "../shared/i18n";
import { Button } from "@atelier/ui/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@atelier/ui/ui/dropdown-menu";

/** 会话列表的操作入口；按钮与导航按钮平级，操作不会触发会话导航。 */
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
        <Button ref={trigger} variant="ghost" size="icon-xs" disabled={disabled}
          className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover/session:opacity-100 group-focus-within/session:opacity-100 data-[state=open]:opacity-100"
          aria-label={i18n.formatMessage(appMessages.conversationActions, { title })}>
          <MoreHorizontal />
        </Button>
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
