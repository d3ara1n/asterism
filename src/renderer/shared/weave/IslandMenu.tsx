import { ArrowLeft, ArrowRight, MoreHorizontal, RotateCcw, Scaling } from "lucide-react";

import { Button } from "@asterism-app/ui/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@asterism-app/ui/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@asterism-app/ui/ui/tooltip";
import { islandsMessages } from "../../messages/islands";
import { useI18n } from "../i18n";
import { useIsland } from "./Screen";

/** Size presets as scales of the island's medium width. */
const sizePresets = [
  { label: islandsMessages.sizeSmall, scale: 0.75 },
  { label: islandsMessages.sizeMedium, scale: 1 },
  { label: islandsMessages.sizeLarge, scale: 1.5 },
] as const;

/** Island chrome menu: window size and position belong to the containing ordinary island, independent of its content. Renders nothing elsewhere. */
export function IslandMenu() {
  const i18n = useI18n();
  const arrangement = useIsland().arrangement;
  if (!arrangement) return null;
  const label = i18n.text(islandsMessages.actions);
  return <DropdownMenu><Tooltip>
    <TooltipTrigger asChild><DropdownMenuTrigger asChild>
      <Button variant="ghost" size="icon-xs" aria-label={label}><MoreHorizontal /></Button>
    </DropdownMenuTrigger></TooltipTrigger>
    <TooltipContent>{label}</TooltipContent>
  </Tooltip>
    <DropdownMenuContent align="end">
      <DropdownMenuSub><DropdownMenuSubTrigger><Scaling />{i18n.text(islandsMessages.size)}</DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <DropdownMenuGroup>
            {sizePresets.map(({ label, scale }) =>
              <DropdownMenuItem key={scale} onSelect={() => arrangement.resize(Math.round(arrangement.medium * scale))}>{i18n.text(label)}</DropdownMenuItem>)}
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={arrangement.size === null} onSelect={() => arrangement.resize(null)}><RotateCcw />{i18n.text(islandsMessages.restoreSize)}</DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSeparator />
      <DropdownMenuItem disabled={arrangement.first} onSelect={() => arrangement.move(-1)}><ArrowLeft />{i18n.text(islandsMessages.moveLeft)}</DropdownMenuItem>
      <DropdownMenuItem disabled={arrangement.last} onSelect={() => arrangement.move(1)}><ArrowRight />{i18n.text(islandsMessages.moveRight)}</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>;
}
