import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronRight } from "lucide-react";
import { cn } from "@asterism-app/ui/utils";

export interface Column<T> {
  id: string;
  label: string;
  /** CSS grid track, such as `minmax(12rem, 1fr)` or `6rem`. */
  width: string;
  align?: "end";
  /** Sortable columns order rows by this value. */
  value?: (row: T) => number | null;
  render: (row: T) => ReactNode;
}

/**
 * A sortable list laid out on a grid; each row is one button that opens the row's details. The first column holds the row identity,
 * and figures align at the end with tabular digits. Rows keep their order until the reader sorts another column.
 */
export function DataTable<T>({ columns, rows, rowKey, onOpen, selected, sort: initial, label }: {
  columns: readonly Column<T>[]; rows: readonly T[]; rowKey: (row: T) => string; onOpen?: (row: T, origin: HTMLElement) => void;
  selected?: string | null; sort?: { id: string; desc: boolean }; label: string;
}) {
  const [sort, setSort] = useState(initial ?? null);
  const sorted = useMemo(() => {
    const column = sort && columns.find(item => item.id === sort.id);
    if (!column?.value) return rows;
    const value = column.value;
    return [...rows].sort((a, b) => {
      const left = value(a), right = value(b);
      if (left === right) return 0;
      if (left === null) return 1;
      if (right === null) return -1;
      return sort!.desc ? right - left : left - right;
    });
  }, [rows, columns, sort]);
  const template = `${columns.map(column => column.width).join(" ")}${onOpen ? " 1rem" : ""}`;
  return <div role="table" aria-label={label} className="min-w-0 overflow-x-auto">
    <div className="min-w-fit">
      <div role="row" className="type-label grid items-center gap-3 border-b px-4 py-2" style={{ gridTemplateColumns: template }}>
        {columns.map(column => {
          const active = sort?.id === column.id;
          const content = <>{column.label}{active && (sort!.desc ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />)}</>;
          return <div key={column.id} role="columnheader" aria-sort={active ? sort!.desc ? "descending" : "ascending" : undefined}
            className={cn("flex min-w-0", column.align === "end" && "justify-end")}>
            {column.value
              ? <button type="button" className={cn("inline-flex items-center gap-1 truncate rounded-sm outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring", active && "text-foreground")}
                onClick={() => setSort(active ? { id: column.id, desc: !sort!.desc } : { id: column.id, desc: true })}>{content}</button>
              : <span className="truncate">{content}</span>}
          </div>;
        })}
      </div>
      <div role="rowgroup" className="p-1">
        {sorted.map(row => {
          const key = rowKey(row);
          const cells = columns.map(column => <div key={column.id} role="cell"
            className={cn("flex min-w-0 items-center", column.align === "end" && "justify-end tabular-nums")}>{column.render(row)}</div>);
          const className = cn("grid w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm", selected === key && "bg-selected text-selected-foreground");
          return onOpen
            ? <button key={key} type="button" role="row" aria-current={selected === key || undefined} style={{ gridTemplateColumns: template }}
              className={cn(className, "group/row transition-colors outline-none hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring")}
              onClick={event => onOpen(row, event.currentTarget)}>
              {cells}<ChevronRight aria-hidden="true" className="size-3.5 text-muted-foreground transition-colors group-hover/row:text-foreground" />
            </button>
            : <div key={key} role="row" className={className} style={{ gridTemplateColumns: template }}>{cells}</div>;
        })}
      </div>
    </div>
  </div>;
}
