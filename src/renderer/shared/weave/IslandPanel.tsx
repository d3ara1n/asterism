import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@asterism-app/ui/ui/alert-dialog";
import { useState } from "react";

import { formsMessages } from "@asterism-app/ui/messages/forms";
import { useI18n } from "../i18n";
import { IslandMenu } from "./IslandMenu";
import { Panel, type PanelProps } from "./Panel";
import { useCloseGuard, useIsland } from "./Screen";
import type { IslandWidth } from "./model";
import { useUnsavedChanges } from "./unsaved";

/** Standard panel island width, shared by settings details, editors, and islands opened by plugins. */
export const panelIslandWidth: IslandWidth = { min: 400, grow: 1, max: 620 };

/**
 * Panel island: the shared container for extended operations (editors, details, etc.); non-modal and does not block other islands.
 * The titlebar is fixed and the content area scrolls independently; primary action and close sit at the right of the titlebar, with no bottom action bar to avoid resembling a dialog.
 * Secondary actions sit with their corresponding content groups. When dirty is true, confirm discarding changes before closing this island, including closure through the island that opened it.
 */
export function IslandPanel({ dirty, ...props }: Omit<PanelProps, "onClose" | "tools"> & { dirty?: boolean }) {
  const i18n = useI18n();
  const island = useIsland();
  useUnsavedChanges(props.title, !!dirty);
  const [asking, setAsking] = useState<((discard: boolean) => void) | null>(null);
  useCloseGuard(dirty ? () => new Promise<boolean>(resolve => setAsking(() => resolve)) : null);
  const answer = (discard: boolean) => { asking?.(discard); setAsking(null); };
  return <>
    <Panel {...props} tools={<IslandMenu />} onClose={() => void island.close()} />
    <AlertDialog open={asking !== null} onOpenChange={open => { if (!open) answer(false); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{i18n.formatMessage(formsMessages.discardTitle)}</AlertDialogTitle>
          <AlertDialogDescription>{i18n.formatMessage(formsMessages.discardDescription, { title: props.title })}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{i18n.formatMessage(formsMessages.keepEditing)}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => answer(true)}>{i18n.formatMessage(formsMessages.discard)}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}
