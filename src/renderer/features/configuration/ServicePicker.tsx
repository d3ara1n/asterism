import type { ReactNode } from "react";
import { SearchInput } from "@asterism-app/ui/ui/search-input";
import { cn } from "@asterism-app/ui/utils";
import { IslandPanel } from "../../shared/weave/IslandPanel";

export interface ServiceChoice {
  key: string; name: string; description?: ReactNode; mark: ReactNode;
  /** Passive state beside the name as plain text, such as already added or a connection count. */
  note?: string;
  disabled?: boolean;
  /** An entry that leaves the catalog, such as a custom connection. */
  open?: boolean;
  onPick(): void;
}
export interface ServiceChoiceGroup { key: string; title?: string; choices: readonly ServiceChoice[] }

/**
 * Creation step shared by provider kinds: choosing a service decides which fields the connection form needs, so the choice comes
 * first. Each kind supplies its own grouping, availability, and badges; the panel, search, and tiles are common.
 */
export function ServicePicker({ title, hint, groups, search, empty, footer }: {
  title: string; hint: string; groups: readonly ServiceChoiceGroup[];
  search?: { value: string; onChange(value: string): void; label: string };
  /** Shown when no group has choices. */ empty?: ReactNode;
  /** A choice outside the groups that stays available while searching. */ footer?: ServiceChoice;
}) {
  return <IslandPanel title={title} toolbar={search && <SearchInput value={search.value} onChange={search.onChange} label={search.label} />}>
    <div className="flex flex-col gap-5">
      <p className="type-caption">{hint}</p>
      {groups.map(group => <section key={group.key} aria-label={group.title}>
        {group.title && <h3 className="type-label mb-2">{group.title}</h3>}
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-2">
          {group.choices.map(choice => <li key={choice.key} className="flex"><ServiceTile choice={choice} /></li>)}
        </ul>
      </section>)}
      {!groups.length && empty}
      {footer && <ServiceTile choice={footer} />}
    </div>
  </IslandPanel>;
}

/** Unavailable choices, such as an added web service, recede to a translucent dashed outline with no fill. */
function ServiceTile({ choice }: { choice: ServiceChoice }) {
  return <button type="button" disabled={choice.disabled} onClick={choice.onPick}
    className={cn("flex min-h-16 w-full min-w-0 items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors outline-none",
      "focus-visible:ring-[3px] focus-visible:ring-ring/50 enabled:hover:bg-accent disabled:cursor-default",
      choice.open || choice.disabled ? "border border-dashed border-input" : "bg-card-shell", choice.disabled && "opacity-60")}>
    {choice.mark}
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="flex min-w-0 items-baseline justify-between gap-1.5">
        <span className="type-section truncate">{choice.name}</span>
        {choice.note && <span className="type-caption shrink-0">{choice.note}</span>}
      </span>
      {choice.description && <span className="type-caption">{choice.description}</span>}
    </span>
  </button>;
}
