import { IconButton } from "@asterism-app/ui/ui/icon-button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@asterism-app/ui/ui/alert-dialog";
import { X } from "lucide-react";
import { useState, type ReactNode, type Ref } from "react";

import { commonMessages } from "@asterism-app/ui/messages/common";
import { formsMessages } from "../../messages/forms";
import { useI18n } from "../i18n";
import { useCloseGuard, useIsland } from "./Screen";
import type { IslandWidth } from "./model";

/** Standard panel island width, shared by settings details, editors, and islands opened by plugins. */
export const panelIslandWidth: IslandWidth = { min: 400, grow: 1, max: 620 };

/**
 * Panel island: the shared container for extended operations (editors, details, etc.); non-modal and does not block other islands.
 * The titlebar is fixed and the content area scrolls independently; primary action and close sit at the right of the titlebar, with no bottom action bar to avoid resembling a dialog.
 * Secondary actions sit with their corresponding content groups. When dirty is true, confirm discarding changes before closing this island (including parent closure or replacement).
 */
export function IslandPanel({ title, description, action, toolbar, dirty, compact, contentRef, children }: {
  title: string; description?: string; action?: ReactNode; toolbar?: ReactNode; dirty?: boolean;
  compact?: boolean; contentRef?: Ref<HTMLDivElement>; children: ReactNode;
}) {
  const i18n = useI18n();
  const island = useIsland();
  const [asking, setAsking] = useState<((discard: boolean) => void) | null>(null);
  useCloseGuard(dirty ? () => new Promise<boolean>(resolve => setAsking(() => resolve)) : null);
  const answer = (discard: boolean) => { asking?.(discard); setAsking(null); };
  return <div className="island-panel">
    <header className="island-panel-header">
      <div className="min-w-0 flex-1">
        <h2 className="type-section truncate">{title}</h2>
        {description && <p className="type-caption truncate">{description}</p>}
      </div>
      {action}
      <IconButton label={i18n.formatMessage(commonMessages.close)} onClick={() => void island.close()}><X /></IconButton>
    </header>
    {toolbar && <div className="shrink-0 space-y-2 border-b px-3 py-3">{toolbar}</div>}
    <div ref={contentRef} className={`island-panel-content${compact ? " px-2 py-2" : ""}`}>{children}</div>
    <AlertDialog open={asking !== null} onOpenChange={open => { if (!open) answer(false); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{i18n.formatMessage(formsMessages.discardTitle)}</AlertDialogTitle>
          <AlertDialogDescription>{i18n.formatMessage(formsMessages.discardDescription, { title })}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{i18n.formatMessage(formsMessages.keepEditing)}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => answer(true)}>{i18n.formatMessage(formsMessages.discard)}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
