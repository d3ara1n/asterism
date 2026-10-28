import { DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger } from "@asterism-app/ui/ui/dropdown-menu";
import { RotateCcw, Scaling } from "lucide-react";

import { objectsMessages } from "../../messages/objects";
import { useI18n } from "../../shared/i18n";

/** Size presets as scales of the surface's medium size. */
export const sizePresets = [
  { label: objectsMessages.cardSizeSmall, scale: 0.75 },
  { label: objectsMessages.cardSizeMedium, scale: 1 },
  { label: objectsMessages.cardSizeLarge, scale: 1.5 },
] as const;

/** Shared size submenu for object surfaces: cards and the focus island present the same entry and presets. */
export function SizeMenu({ onScale, onRestore }: { onScale: (scale: number) => void; onRestore: () => void }) {
  const i18n = useI18n();
  return <DropdownMenuSub><DropdownMenuSubTrigger><Scaling />{i18n.formatMessage(objectsMessages.cardSize)}</DropdownMenuSubTrigger>
    <DropdownMenuSubContent>
      <DropdownMenuGroup>
        {sizePresets.map(({ label, scale }) =>
          <DropdownMenuItem key={scale} onSelect={() => onScale(scale)}>{i18n.text(label)}</DropdownMenuItem>)}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onRestore}><RotateCcw />{i18n.formatMessage(objectsMessages.restoreCardSize)}</DropdownMenuItem>
      </DropdownMenuGroup>
    </DropdownMenuSubContent>
  </DropdownMenuSub>;
}
