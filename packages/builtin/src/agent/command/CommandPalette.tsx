import { useRef, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { useI18n } from "@asterism-app/sdk/renderer";
import type { UiText } from "@asterism-app/sdk/contracts";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@asterism-app/ui/ui/command";
import { filterCommandLabels } from "@asterism-app/ui/command-filter";
import { CommandBack, isCommandBackKey, useCommandPageMotion } from "@asterism-app/ui/command-page";
import { commandDetail, commandEmpty, commandHeading, commandListMotion, commandRow } from "@asterism-app/ui/command-styles";
import { cn } from "@asterism-app/ui/utils";
import { commandMessages as messages } from "../../messages/command";

export interface CommandEntry {
  id: string;
  label: string;
  /** Additional search aliases. */
  keywords?: readonly string[];
  /** Secondary text shown after the label; excluded from search. */
  detail?: string;
  icon: ReactNode;
  /** Whether the current context satisfies the command's conditions; unmet commands are not shown. Defaults to true. */
  when?: boolean;
  /** A transient pending state; the command stays visible but cannot run. */
  disabled?: boolean;
  /** Selecting the entry opens a nested page instead of acting. */
  submenu?: boolean;
  onSelect(): void;
}
/** Nested pages may omit the heading when their crumb already names the group. */
export interface CommandGroupData { id: string; heading?: string; entries: readonly CommandEntry[] }
export interface CommandPage {
  id: string;
  /** Present on nested pages; shown as the return crumb. */
  title?: string;
  placeholder: string;
  groups: readonly CommandGroupData[];
}

/** Shell operations available to command features. */
export interface CommandHost {
  /** Push a nested list page contributed under this id. */
  openPage(id: string): void;
  /** Replace the list with a full panel contributed under this id; the panel has no parent level. */
  openPanel(id: string): void;
  close(): void;
}
/** One feature's commands: root groups, nested pages, full panels, and its pending operation and feedback. */
export interface CommandContribution {
  groups: readonly CommandGroupData[];
  pages?: Readonly<Record<string, CommandPage>>;
  panels?: Readonly<Record<string, () => ReactNode>>;
  /** A pending operation blocks every command and dismissal until it settles. */
  busy?: boolean;
  error?: UiText | null;
}

/** Groups with their applicable entries; groups left empty are omitted. */
const visibleGroups = (page: CommandPage) => page.groups
  .map(group => ({ ...group, entries: group.entries.filter(entry => entry.when !== false) }))
  .filter(group => group.entries.length > 0);

export const firstEntry = (page: CommandPage) =>
  visibleGroups(page).flatMap(group => group.entries).find(entry => !entry.disabled)?.id ?? "";

/** Command identity is independent of display names and search text; the owner keeps the page stack, search, and selection. */
export function CommandPalette({ page, depth, disabled, search, onSearch, value, onValue, onBack }: {
  page: CommandPage; depth: number;
  /** Disables every entry while an operation is pending. */
  disabled: boolean;
  search: string; onSearch(search: string): void;
  value: string; onValue(value: string): void;
  onBack(): void;
}) {
  const i18n = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const body = useCommandPageMotion<HTMLDivElement>(page.id, depth);
  return <Command label={i18n.text(messages.title)} filter={filterCommandLabels} value={value} onValueChange={onValue}
    className="h-auto min-h-0 bg-transparent **:data-[slot=command-input-wrapper]:h-12 **:data-[slot=command-input-wrapper]:px-4">
    {page.title && <CommandBack label={page.title} onBack={() => { onBack(); input.current?.focus({ preventScroll: true }); }} />}
    <CommandInput ref={input} value={search} onValueChange={onSearch} placeholder={page.placeholder} className="h-12"
      onKeyDown={event => {
        if (page.title && isCommandBackKey(event, search)) { event.preventDefault(); onBack(); }
      }} />
    <CommandList className={`max-h-[min(24rem,calc(100cqh-9rem))] min-h-0 scroll-py-2 ${commandListMotion}`}>
      <div ref={body} className="p-1.5">
        <CommandEmpty className={commandEmpty}>{i18n.text(messages.empty)}</CommandEmpty>
        {/* The heading element carries the shared style; cmdk's wrapper keeps only its accessible labelling. */}
        {visibleGroups(page).map(group => <CommandGroup key={group.id} heading={group.heading && <div className={commandHeading}>{group.heading}</div>}
          className="p-0 [&_[cmdk-group-heading]]:p-0">
          {group.entries.map(entry => <CommandItem key={entry.id} value={entry.id} keywords={[entry.label, group.heading ?? page.title ?? "", ...entry.keywords ?? []]}
            disabled={disabled || entry.disabled} onSelect={entry.onSelect}
            className={commandRow}>
            {entry.icon}
            <span className="min-w-0 shrink truncate">{entry.label}</span>
            {entry.detail && <span className={cn("min-w-0 flex-1 truncate", commandDetail)}>{entry.detail}</span>}
            {entry.submenu && <ChevronRight className="ml-auto" />}
          </CommandItem>)}
        </CommandGroup>)}
      </div>
    </CommandList>
  </Command>;
}
