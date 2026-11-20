import { createPortal } from "react-dom";
import { GitCompare } from "lucide-react";
import type { ContextMenuItem, ContextMenuOpenContext } from "@pierre/trees";
import { useI18n, useRendererObject, type RendererResourceLocationAction } from "@asterism-app/sdk/renderer";
import { commonMessages } from "@asterism-app/ui/messages/common";
import { useResourceLocationActions } from "@asterism-app/ui/resource-location-actions";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@asterism-app/ui/ui/dropdown-menu";
import { Spinner } from "@asterism-app/ui/ui/spinner";
import { filesystemMessages } from "../messages/filesystem";

/** The tree owns triggering, dismissal on scroll, and focus restoration across virtualized rows. */
export function FileTreeMenu({ item, context, directory, deleted, openDiff }: {
  item: ContextMenuItem;
  context: ContextMenuOpenContext;
  directory: boolean;
  deleted: boolean;
  openDiff?: (origin?: HTMLElement) => void;
}) {
  const i18n = useI18n();
  const { ref } = useRendererObject();
  const { actions, loading, error, run } = useResourceLocationActions(ref, item.path, !deleted);
  // Directory locations have one native action: both native commands would open the same folder.
  const locationActions = deleted ? [] : actions.filter(action => !directory || (action.id !== "open" && action.id !== "open-system"));
  const menuActions: readonly RendererResourceLocationAction[] = openDiff
    ? [{ id: "open-diff", label: filesystemMessages.diffOpen, icon: <GitCompare />, run: options => openDiff(options?.origin ?? undefined) }, ...locationActions]
    : locationActions;
  const { anchorElement, anchorRect } = context;

  return <DropdownMenu open modal={false} onOpenChange={open => { if (!open) context.close(); }}>
    {/* Use the tree's viewport coordinates outside the transformed workbench canvas. */}
    {createPortal(<DropdownMenuTrigger asChild>
      <span aria-hidden className="pointer-events-none fixed" style={{ left: anchorRect.left, top: anchorRect.top, width: anchorRect.width, height: anchorRect.height }} />
    </DropdownMenuTrigger>, anchorElement.ownerDocument.body)}
    <DropdownMenuContent align="start" data-file-tree-context-menu-root="true"
      aria-label={item.name} aria-labelledby={undefined} onCloseAutoFocus={event => event.preventDefault()}>
      <DropdownMenuGroup>
        {menuActions.map(action => <DropdownMenuItem key={action.id} onSelect={event => {
          event.preventDefault();
          const root = anchorElement.getRootNode();
          const origin = root instanceof ShadowRoot
            ? root.querySelector<HTMLElement>(`[data-item-path="${CSS.escape(item.path)}"]:not([data-item-parked="true"])`)
            : null;
          context.close();
          void run(action, origin);
        }}>{action.icon}{i18n.text(action.label)}</DropdownMenuItem>)}
        {!deleted && (loading ? <DropdownMenuItem disabled><Spinner />{i18n.text(commonMessages.loading)}</DropdownMenuItem>
          : error ? <DropdownMenuItem disabled>{i18n.text(error)}</DropdownMenuItem> : null)}
        {!menuActions.length && (deleted || (!loading && !error)) && <DropdownMenuItem disabled>{i18n.text(commonMessages.noLocationActions)}</DropdownMenuItem>}
      </DropdownMenuGroup>
    </DropdownMenuContent>
  </DropdownMenu>;
}
