import { createContext, useContext, useRef, useState } from "react";
import { Check, ChevronDown, Folder as FolderIcon, FolderInput, FolderPlus } from "lucide-react";
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui";
import { folderMessages } from "../../../shared/folder-messages";
import { useI18n } from "../../shared/i18n";
import { Button } from "@asterism-app/ui/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem,
  DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@asterism-app/ui/ui/dropdown-menu";
import { existingFolder, useFolders } from "./context";
import { FolderDialog } from "./FolderDialog";
import { sortFolders } from "./grouping";
import { FolderDot } from "./marks";

// Radix radio values are strings; this value stands for the null membership.
const none = "";
// Folder dots and the default radio dot look alike, so choices drop the leading indicator slot and mark selection with a trailing check.
const choiceClass = "pl-2 [&>span:first-child]:hidden";
const selectedMark = <DropdownMenuPrimitive.ItemIndicator className="ml-auto flex"><Check /></DropdownMenuPrimitive.ItemIndicator>;

/** Radio choices shared by the move submenu and the Home picker: no folder first, then folders in navigation order. */
function FolderChoices({ value, onSelect }: { value: string | null; onSelect: (id: string | null) => void }) {
  const i18n = useI18n();
  const { folders } = useFolders();
  return <DropdownMenuRadioGroup value={existingFolder(folders, value)?.id ?? none} onValueChange={id => onSelect(id === none ? null : id)}>
    <DropdownMenuRadioItem value={none} className={choiceClass}>
      <FolderIcon className="text-muted-foreground" /><span className="truncate">{i18n.text(folderMessages.noFolder)}</span>{selectedMark}
    </DropdownMenuRadioItem>
    {sortFolders(folders, i18n.locale).map(folder => <DropdownMenuRadioItem key={folder.id} value={folder.id} className={choiceClass}>
      <FolderDot color={folder.color} className="mx-1" /><span className="truncate">{folder.name}</span>{selectedMark}
    </DropdownMenuRadioItem>)}
  </DropdownMenuRadioGroup>;
}

/** "Move to folder" submenu for row and card menus. `onCreate` opens a folder dialog outside the closing menu. */
export function MoveToFolderMenu({ value, disabled, onMove, onCreate }: {
  value: string | null; disabled?: boolean; onMove: (id: string | null) => void; onCreate: () => void;
}) {
  const i18n = useI18n();
  return <DropdownMenuSub>
    <DropdownMenuSubTrigger disabled={disabled}><FolderInput />{i18n.text(folderMessages.moveTo)}</DropdownMenuSubTrigger>
    <DropdownMenuSubContent className="min-w-44">
      <FolderChoices value={value} onSelect={id => { if (id !== value) onMove(id); }} />
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={onCreate}><FolderPlus />{i18n.text(folderMessages.create)}…</DropdownMenuItem>
    </DropdownMenuSubContent>
  </DropdownMenuSub>;
}

export interface HomeFolderState { id: string | null; select(id: string | null): void }
const HomeFolder = createContext<HomeFolderState | null>(null);
export const HomeFolderProvider = HomeFolder.Provider;

/** Host folder control placed by session entries in their toolbar; a deleted selection reads as no folder. */
export function HomeFolderPicker({ disabled }: { disabled?: boolean }) {
  const i18n = useI18n();
  const { folders, ready } = useFolders();
  const state = useContext(HomeFolder);
  const trigger = useRef<HTMLButtonElement>(null);
  const [creating, setCreating] = useState(false);
  if (!state) throw new Error("The Home folder picker must be rendered within Home.");
  const folder = existingFolder(folders, state.id);
  const label = folder?.name ?? i18n.text(folderMessages.noFolder);
  return <>
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button ref={trigger} variant="ghost" size="xs" disabled={disabled} aria-label={`${i18n.text(folderMessages.folder)}: ${label}`}
          className="max-w-48 text-muted-foreground hover:text-foreground">
          {folder ? <FolderDot color={folder.color} className="mx-0.5" /> : <FolderIcon />}<span className="truncate">{label}</span><ChevronDown className="opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-44" onCloseAutoFocus={event => { if (creating) event.preventDefault(); }}>
        <DropdownMenuLabel className="text-xs text-muted-foreground">{i18n.text(folderMessages.folder)}</DropdownMenuLabel>
        <FolderChoices value={state.id} onSelect={state.select} />
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={!ready} onSelect={() => setCreating(true)}><FolderPlus />{i18n.text(folderMessages.create)}…</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    {creating && <FolderDialog onSaved={state.select} onClose={() => setCreating(false)}
      onRestoreFocus={() => trigger.current?.focus({ preventScroll: true })} />}
  </>;
}
