import type { ComponentProps, ReactElement, ReactNode } from "react";
import { ArrowLeft, ArrowRight, MoreHorizontal, RotateCcw, Scaling } from "lucide-react";

import { IconButton } from "@asterism-app/ui/ui/icon-button";
import { ActionMenu, ActionMenuTarget, ActionMenuContent, ActionMenuGroup, ActionMenuItem, ActionMenuSeparator, ActionMenuSub, ActionMenuSubContent, ActionMenuSubTrigger, ActionMenuTrigger } from "@asterism-app/ui/ui/action-menu";
import { islandsMessages } from "../../messages/islands";
import { useI18n } from "../i18n";
import { useIsland } from "./Screen";

/** Size presets as scales of the island's medium width. */
const sizePresets = [
  { label: islandsMessages.sizeSmall, scale: 0.75 },
  { label: islandsMessages.sizeMedium, scale: 1 },
  { label: islandsMessages.sizeLarge, scale: 1.5 },
] as const;

/** Island chrome menu: window size and position belong to the containing ordinary island, independent of its content. Root islands keep their header without these controls. */
export function IslandMenu({ triggerSize, children }: {
  triggerSize?: ComponentProps<typeof IconButton>["size"];
  children: (trigger: ReactNode, renderHeader: (header: ReactElement) => ReactNode) => ReactNode;
}) {
  const i18n = useI18n();
  const arrangement = useIsland().arrangement;
  if (!arrangement) return children(null, header => header);
  const label = i18n.text(islandsMessages.actions);
  return <ActionMenu>
    {children(<IconButton label={label} size={triggerSize} asChild>
      <ActionMenuTrigger><MoreHorizontal /></ActionMenuTrigger>
    </IconButton>, header => <ActionMenuTarget asChild blankOnly>{header}</ActionMenuTarget>)}
    <ActionMenuContent align="end">
      <ActionMenuSub><ActionMenuSubTrigger><Scaling />{i18n.text(islandsMessages.size)}</ActionMenuSubTrigger>
        <ActionMenuSubContent>
          <ActionMenuGroup>
            {sizePresets.map(({ label, scale }) =>
              <ActionMenuItem key={scale} onSelect={() => arrangement.resize(Math.round(arrangement.medium * scale))}>{i18n.text(label)}</ActionMenuItem>)}
            <ActionMenuSeparator />
            <ActionMenuItem disabled={arrangement.size === null} onSelect={() => arrangement.resize(null)}><RotateCcw />{i18n.text(islandsMessages.restoreSize)}</ActionMenuItem>
          </ActionMenuGroup>
        </ActionMenuSubContent>
      </ActionMenuSub>
      <ActionMenuSeparator />
      <ActionMenuItem disabled={arrangement.first} onSelect={() => arrangement.move(-1)}><ArrowLeft />{i18n.text(islandsMessages.moveLeft)}</ActionMenuItem>
      <ActionMenuItem disabled={arrangement.last} onSelect={() => arrangement.move(1)}><ArrowRight />{i18n.text(islandsMessages.moveRight)}</ActionMenuItem>
    </ActionMenuContent>
  </ActionMenu>;
}
