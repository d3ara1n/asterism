import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import type { TemplateSummary } from "../../../shared/templates";
import { templateMessages } from "../../../shared/template-messages";
import { useI18n } from "../../shared/i18n";
import { commonMessages } from "@asterism-app/ui/messages/common";
import { filterCommandLabels } from "@asterism-app/ui/command-filter";
import { Button } from "@asterism-app/ui/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@asterism-app/ui/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@asterism-app/ui/ui/popover";
import { cn } from "@asterism-app/ui/utils";
import { folderMessages } from "../../../shared/folder-messages";
import { existingFolder, useFolders } from "../folders/context";
import { groupByFolder } from "../folders/grouping";
import { FolderDot } from "../folders/marks";
import { TemplateKindIcons } from "./TemplateObjects";

/**
 * Searchable template selection grouped like folder navigation. Contents and creation time distinguish equal names.
 * The popover is modal so its own scroll lock replaces the enclosing dialog's, keeping the list wheel-scrollable.
 */
export function TemplateTargetPicker({ id, templates, value, disabled, onValueChange }: {
  id: string; templates: readonly TemplateSummary[]; value: TemplateSummary | undefined; disabled: boolean;
  onValueChange: (templateId: string) => void;
}) {
  const i18n = useI18n();
  const { folders } = useFolders();
  const [open, setOpen] = useState(false);
  const groups = groupByFolder(folders, templates, template => template.folderId, i18n.locale).filter(group => group.items.length);
  const headings = groups.some(group => group.folder);
  const folder = value ? existingFolder(folders, value.folderId) : null;
  return <Popover modal open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <Button id={id} type="button" variant="outline" role="combobox" aria-expanded={open} disabled={disabled}
        className="w-full justify-between font-normal">
        {value ? <span className="flex min-w-0 items-center gap-2">
          {folder && <FolderDot color={folder.color} />}<span className="truncate">{value.title}</span>
        </span> : <span className="text-muted-foreground">{i18n.text(templateMessages.selectTarget)}</span>}
        <ChevronsUpDown className="opacity-50" />
      </Button>
    </PopoverTrigger>
    <PopoverContent motionPreset="command" align="start" className="w-(--radix-popover-trigger-width) p-0">
      <Command filter={filterCommandLabels}>
        <CommandInput placeholder={i18n.text(templateMessages.searchTemplates)} />
        <CommandList>
          <CommandEmpty>{i18n.text(commonMessages.noMatches)}</CommandEmpty>
          {groups.map(group => <CommandGroup key={group.folder?.id ?? ""} heading={headings && <span className="flex items-center gap-1.5">
            {group.folder ? <><FolderDot color={group.folder.color} />{group.folder.name}</> : i18n.text(folderMessages.noFolder)}
          </span>}>
            {group.items.map(template => <CommandItem key={template.id} value={template.id}
              keywords={[template.title, group.folder?.name ?? ""]} className="items-start"
              onSelect={() => { onValueChange(template.id); setOpen(false); }}>
              <Check className={cn("mt-0.5", template.id === value?.id ? "opacity-100" : "opacity-0")} />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate">{template.title}</span>
                <span className="type-caption flex min-w-0 items-center gap-2">
                  <TemplateKindIcons objects={template.objects} />
                  <span className="truncate">
                    {i18n.formatMessage(templateMessages.objectCount, { count: template.objects.length })}
                    {" · "}{i18n.formatDate(Date.parse(template.createdAt), { dateStyle: "medium", timeStyle: "short" })}
                  </span>
                </span>
              </span>
            </CommandItem>)}
          </CommandGroup>)}
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>;
}
