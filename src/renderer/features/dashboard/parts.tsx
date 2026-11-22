import { ArrowDownRight, ArrowUpRight, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@asterism-app/ui/utils";
import { Badge } from "@asterism-app/ui/ui/badge";
import type { BreakdownRow, TelemetryGroup } from "../../../shared/telemetry";
import { useI18n } from "../../shared/i18n";
import { exitTransition, fadeTransition } from "../../shared/weave/motion";
import { dashboardMessages as msg } from "../../messages/dashboard";
import { FolderDot } from "../folders/marks";
import { formatMeasure, formatPercent, groupColor, groupDetail, groupLabel } from "./format";
import { measureOf, type Measure } from "./metrics";
import { groupId } from "./model";

/** Signed relative change; cost and token growth are neutral facts, so direction uses arrows rather than good/bad tones. */
export function Change({ value }: { value: number | null }) {
  const i18n = useI18n();
  if (value === null || !Number.isFinite(value)) return null;
  const magnitude = formatPercent(i18n, Math.abs(value), 0);
  const up = value >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return <span className="type-caption inline-flex items-center gap-0.5 tabular-nums" aria-label={i18n.formatMessage(up ? msg.changeUp : msg.changeDown, { value: magnitude })}>
    <Icon aria-hidden="true" className="size-3" />{magnitude}
  </span>;
}

/** One headline number with its label, optional change, and supporting line. */
export function Stat({ label, value, change, detail, badge, footer, className }: {
  label: ReactNode; value: ReactNode; change?: number | null; detail?: ReactNode; badge?: ReactNode; footer?: ReactNode; className?: string;
}) {
  return <div className={cn("flex min-w-0 flex-col gap-1.5 p-4", className)}>
    <div className="flex min-w-0 items-center justify-between gap-2"><span className="type-label truncate">{label}</span>{badge}</div>
    <div className="flex min-w-0 items-baseline gap-2">
      <StatValue value={value} />
      {change !== undefined && <Change value={change} />}
    </div>
    {detail && <div className="type-caption min-w-0 truncate tabular-nums">{detail}</div>}
    {footer}
  </div>;
}

/** A headline value that changed rises into place; the same value across rerenders stays still. */
function StatValue({ value }: { value: ReactNode }) {
  const key = typeof value === "string" || typeof value === "number" ? String(value) : "node";
  return <span className="relative flex min-w-0 overflow-hidden">
    <AnimatePresence initial={false} mode="popLayout">
      <motion.span key={key} className="truncate text-2xl font-semibold tracking-tight tabular-nums"
        initial={{ opacity: 0, y: "40%" }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: "-40%", transition: exitTransition }} transition={fadeTransition}>
        {value}
      </motion.span>
    </AnimatePresence>
  </span>;
}

/** A group's identity: folder color mark, label, deletion state, and secondary detail. */
export function GroupName({ group, detail = true }: { group: TelemetryGroup; detail?: boolean }) {
  const i18n = useI18n();
  const color = groupColor(group);
  const label = groupLabel(i18n, group);
  const secondary = detail ? groupDetail(group) : null;
  const state = group.dimension === "folder" && group.deleted || group.dimension === "session" && group.status === "deleted" ? msg.deleted
    : group.dimension === "session" && group.status === "archived" ? msg.archived : null;
  return <span className="flex min-w-0 items-center gap-2">
    {color && <FolderDot color={color} />}
    <span className={cn("min-w-0 truncate", state === msg.deleted && "text-muted-foreground")}>{label}</span>
    {state && <Badge variant="secondary" className="shrink-0 font-normal">{i18n.text(state)}</Badge>}
    {secondary && <span className="type-caption min-w-0 shrink-[2] truncate">{secondary}</span>}
  </span>;
}

/** A ranked list where each row opens its details; bars compare rows by the chosen measure. `selected` is a `groupId`. */
export function RankedList({ rows, measure, onOpen, selected, limit }: {
  rows: readonly BreakdownRow[]; measure: Measure; onOpen: (row: BreakdownRow, origin: HTMLElement) => void; selected?: string | null; limit?: number;
}) {
  const i18n = useI18n();
  const shown = limit === undefined ? rows : rows.slice(0, limit);
  const max = Math.max(0, ...shown.map(row => measureOf(row.metrics, measure)));
  return <ul className="flex flex-col p-1">
    {shown.map(row => {
      const value = measureOf(row.metrics, measure);
      const color = groupColor(row.group);
      const id = groupId(row.group);
      return <li key={id}>
        <button type="button" aria-current={selected === id || undefined} onClick={event => onOpen(row, event.currentTarget)}
          className={cn("group/row flex w-full min-w-0 flex-col gap-1.5 rounded-md px-3 py-2 text-left text-sm transition-colors outline-none hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
            selected === id && "bg-selected text-selected-foreground hover:bg-selected")}>
          <span className="flex min-w-0 items-center gap-3">
            <span className="min-w-0 flex-1"><GroupName group={row.group} /></span>
            <span className="shrink-0 tabular-nums font-medium">{formatMeasure(i18n, measure, value)}</span>
            <ChevronRight aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground transition-colors group-hover/row:text-foreground" />
          </span>
          <span aria-hidden="true" className="h-1 w-full overflow-hidden rounded-full bg-muted">
            <span className={cn("block h-full rounded-full transition-[width] duration-500 ease-out", !color && "bg-primary/60")}
              style={{ width: `${max > 0 ? Math.max(2, value / max * 100) : 0}%`, ...(color ? { backgroundColor: `var(--folder-${color})` } : {}) }} />
          </span>
        </button>
      </li>;
    })}
  </ul>;
}
