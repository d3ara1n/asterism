import { useState, type ReactNode } from "react";
import { cn } from "../utils";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia } from "./empty";
import { VirtualList } from "./virtual-list";

/** A group heading or one item; keys stay stable across filtering so a focused row remains mounted. */
export type PanelListEntry<T> =
  | { kind: "heading"; key: string; title: ReactNode; meta?: ReactNode }
  | { kind: "item"; key: string; item: T };

/**
 * Body of a list-only island panel (`layout="fill"`): one virtualized viewport flush with the panel, no nested card.
 * Rows are inset 4px so hover and selection fills sit inside the island border while row text aligns with the panel title;
 * hairlines between consecutive items share that text inset. A notice (such as discovery issues) scrolls with the list.
 * When state is present it replaces the list: empty, loading, failure, and no-match all use one centered presentation.
 */
export function PanelList<T>({ entries, renderItem, notice, state }: {
  entries: readonly PanelListEntry<T>[];
  renderItem: (item: T) => ReactNode;
  notice?: ReactNode;
  state?: ReactNode;
}) {
  const [focused, setFocused] = useState<string | null>(null);
  if (state) return <div className="flex min-h-0 flex-1 flex-col">
    {notice && <div className="shrink-0 px-5 pt-4">{notice}</div>}
    {state}
  </div>;
  const rows: (PanelListEntry<T> | { kind: "notice"; key: string })[] = notice ? [{ kind: "notice", key: "panel-list:notice" }, ...entries] : [...entries];
  const focusedIndex = rows.findIndex(row => row.key === focused);
  return <VirtualList data={rows} keepMounted={focusedIndex >= 0 ? [focusedIndex] : []} viewportClassName="py-2">
    {(row, index) => {
      if (row.kind === "notice") return <div key={row.key} className="px-5 pt-2 pb-3">{notice}</div>;
      if (row.kind === "heading") return <div key={row.key} className={cn("flex min-w-0 items-baseline gap-2 px-5 pb-1", index > 0 && "pt-4")}>
        <h3 className="type-label min-w-0 flex-1 truncate">{row.title}</h3>
        {row.meta && <span className="type-caption shrink-0">{row.meta}</span>}
      </div>;
      const separated = rows[index - 1]?.kind === "item";
      return <div key={row.key} className="px-1" onFocusCapture={() => setFocused(row.key)}>
        {separated && <div className="mx-4 border-t" aria-hidden="true" />}
        {renderItem(row.item)}
      </div>;
    }}
  </VirtualList>;
}

/** Centered state for a list panel: an icon and a short label, with an optional recovery action. */
export function PanelListState({ icon, label, action }: { icon?: ReactNode; label: ReactNode; action?: ReactNode }) {
  return <Empty role="status" className="gap-4">
    <EmptyHeader>
      {icon && <EmptyMedia variant="icon" className="text-muted-foreground">{icon}</EmptyMedia>}
      <EmptyDescription>{label}</EmptyDescription>
    </EmptyHeader>
    {action && <EmptyContent>{action}</EmptyContent>}
  </Empty>;
}
