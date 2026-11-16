import { ActionMenuGroup, ActionMenuItem, ActionMenuSeparator, ActionMenuSub, ActionMenuSubContent, ActionMenuSubTrigger } from "@asterism-app/ui/ui/action-menu";
import { RotateCcw, Scaling } from "lucide-react";

import { objectsMessages } from "../../messages/objects";
import { useI18n } from "../../shared/i18n";

/** Size presets as scales of the surface's medium size. */
export const sizePresets = [
  { label: objectsMessages.cardSizeSmall, scale: 0.75 },
  { label: objectsMessages.cardSizeMedium, scale: 1 },
  { label: objectsMessages.cardSizeLarge, scale: 1.5 },
] as const;

/** Size submenu for canvas cards; islands size through the island menu. */
export function SizeMenu({ onScale, onRestore }: { onScale: (scale: number) => void; onRestore: () => void }) {
  const i18n = useI18n();
  return <ActionMenuSub><ActionMenuSubTrigger><Scaling />{i18n.formatMessage(objectsMessages.cardSize)}</ActionMenuSubTrigger>
    <ActionMenuSubContent>
      <ActionMenuGroup>
        {sizePresets.map(({ label, scale }) =>
          <ActionMenuItem key={scale} onSelect={() => onScale(scale)}>{i18n.text(label)}</ActionMenuItem>)}
        <ActionMenuSeparator />
        <ActionMenuItem onSelect={onRestore}><RotateCcw />{i18n.formatMessage(objectsMessages.restoreCardSize)}</ActionMenuItem>
      </ActionMenuGroup>
    </ActionMenuSubContent>
  </ActionMenuSub>;
}
