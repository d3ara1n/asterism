import { useRef, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useI18n } from "@asterism-app/sdk/renderer";
import type { UiText } from "@asterism-app/sdk/contracts";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@asterism-app/ui/ui/command";
import { filterCommandLabels } from "@asterism-app/ui/command-filter";
import { commandMessages as messages } from "../../messages/command";

export interface CommandEntry {
  id: string;
  label: string;
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

const pageTransition = { duration: 0.16, ease: [0, 0, 0.2, 1] } as const;

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
  const reducedMotion = useReducedMotion();
  const input = useRef<HTMLInputElement>(null);
  return <Command label={i18n.text(messages.title)} filter={filterCommandLabels} value={value} onValueChange={onValue}
    className="h-auto min-h-0 bg-transparent **:data-[slot=command-input-wrapper]:h-12 **:data-[slot=command-input-wrapper]:px-4">
    {page.title && <div className="flex items-center px-2 pt-2">
      <button type="button" className="type-caption flex h-6 items-center gap-0.5 rounded-md pr-2 pl-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        aria-label={i18n.text(messages.back)} onMouseDown={event => event.preventDefault()}
        onClick={() => { onBack(); input.current?.focus({ preventScroll: true }); }}>
        <ChevronLeft className="size-3.5" />{page.title}
      </button>
    </div>}
    <CommandInput ref={input} value={search} onValueChange={onSearch} placeholder={page.placeholder} className="h-12"
      onKeyDown={event => {
        if (event.key === "Backspace" && !search && page.title && !event.nativeEvent.isComposing) { event.preventDefault(); onBack(); }
      }} />
    <CommandList className="max-h-[min(24rem,calc(100cqh-9rem))] min-h-0 scroll-py-2 h-(--cmdk-list-height) transition-[height] duration-150 ease-out motion-reduce:transition-none">
      <motion.div key={page.id} className="p-1.5"
        initial={reducedMotion ? false : { opacity: 0, x: depth > 0 ? 10 : -10 }}
        animate={{ opacity: 1, x: 0 }} transition={pageTransition}>
        <CommandEmpty className="type-caption py-8 text-center">{i18n.text(messages.empty)}</CommandEmpty>
        {visibleGroups(page).map(group => <CommandGroup key={group.id} heading={group.heading} className="p-0">
          {group.entries.map(entry => <CommandItem key={entry.id} value={entry.id} keywords={[entry.label]}
            disabled={disabled || entry.disabled} onSelect={entry.onSelect}
            className="h-9 gap-2.5 rounded-md px-2.5">
            {entry.icon}
            <span className="min-w-0 shrink truncate">{entry.label}</span>
            {entry.detail && <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{entry.detail}</span>}
            {entry.submenu && <ChevronRight className="ml-auto" />}
          </CommandItem>)}
        </CommandGroup>)}
      </motion.div>
    </CommandList>
  </Command>;
}
