import type { UiText } from "@asterism-app/sdk/contracts";
import { cn } from "@asterism-app/ui/utils";
import type { FolderColor } from "../../../shared/folders";
import { folderMessages } from "../../../shared/folder-messages";

// Static class names keep every palette token visible to the Tailwind scanner.
const dots: Record<FolderColor, string> = {
  red: "bg-folder-red", orange: "bg-folder-orange", amber: "bg-folder-amber", green: "bg-folder-green",
  teal: "bg-folder-teal", blue: "bg-folder-blue", violet: "bg-folder-violet", pink: "bg-folder-pink",
};
const tints: Record<FolderColor, string> = {
  red: "bg-folder-red/15", orange: "bg-folder-orange/15", amber: "bg-folder-amber/15", green: "bg-folder-green/15",
  teal: "bg-folder-teal/15", blue: "bg-folder-blue/15", violet: "bg-folder-violet/15", pink: "bg-folder-pink/15",
};
export const folderColorLabels: Record<FolderColor, UiText> = {
  red: folderMessages.colorRed, orange: folderMessages.colorOrange, amber: folderMessages.colorAmber, green: folderMessages.colorGreen,
  teal: folderMessages.colorTeal, blue: folderMessages.colorBlue, violet: folderMessages.colorViolet, pink: folderMessages.colorPink,
};

/** Decorative color identity; the folder name always accompanies it. */
export function FolderDot({ color, className }: { color: FolderColor; className?: string }) {
  return <span aria-hidden="true" className={cn("inline-block size-2 shrink-0 rounded-full", dots[color], className)} />;
}
export function folderDotClass(color: FolderColor): string { return dots[color]; }
/** Light surface tint for previews that belong to a folder. */
export function folderTint(color: FolderColor): string { return tints[color]; }
