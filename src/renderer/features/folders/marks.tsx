import type { UiText } from "@asterism-app/sdk/contracts";
import { cn } from "@asterism-app/ui/utils";
import type { FolderColor } from "../../../shared/folders";
import { folderMessages } from "../../../shared/folder-messages";

// Static class names keep every palette token visible to the Tailwind scanner.
const dots: Record<FolderColor, string> = {
  red: "bg-folder-red", orange: "bg-folder-orange", amber: "bg-folder-amber", green: "bg-folder-green",
  teal: "bg-folder-teal", cyan: "bg-folder-cyan", blue: "bg-folder-blue", indigo: "bg-folder-indigo",
  violet: "bg-folder-violet", plum: "bg-folder-plum", pink: "bg-folder-pink", brown: "bg-folder-brown",
};
const tints: Record<FolderColor, string> = {
  red: "bg-folder-red/15", orange: "bg-folder-orange/15", amber: "bg-folder-amber/15", green: "bg-folder-green/15",
  teal: "bg-folder-teal/15", cyan: "bg-folder-cyan/15", blue: "bg-folder-blue/15", indigo: "bg-folder-indigo/15",
  violet: "bg-folder-violet/15", plum: "bg-folder-plum/15", pink: "bg-folder-pink/15", brown: "bg-folder-brown/15",
};
export const folderColorLabels: Record<FolderColor, UiText> = {
  red: folderMessages.colorRed, orange: folderMessages.colorOrange, amber: folderMessages.colorAmber, green: folderMessages.colorGreen,
  teal: folderMessages.colorTeal, cyan: folderMessages.colorCyan, blue: folderMessages.colorBlue, indigo: folderMessages.colorIndigo,
  violet: folderMessages.colorViolet, plum: folderMessages.colorPlum, pink: folderMessages.colorPink, brown: folderMessages.colorBrown,
};

/** Decorative color identity; the folder name always accompanies it. */
export function FolderDot({ color, className }: { color: FolderColor; className?: string }) {
  return <span aria-hidden="true" className={cn("inline-block size-2 shrink-0 rounded-full", dots[color], className)} />;
}
export function folderDotClass(color: FolderColor): string { return dots[color]; }
/** Light surface tint for previews that belong to a folder. */
export function folderTint(color: FolderColor): string { return tints[color]; }
