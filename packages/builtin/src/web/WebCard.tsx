import type { ReactNode } from "react";
import { Download, Search } from "lucide-react";
import { useI18n, type I18n } from "@asterism/sdk/renderer";
import { StatusIcon, type StatusTone } from "@asterism/ui/ui/status";
import { Spinner } from "@asterism/ui/ui/spinner";
import { cn } from "@asterism/ui/utils";
import type { WebCardData } from "./contract";
import { webMessages as messages } from "../messages/web";

type Stats = WebCardData["stats"];
type Counts = Stats["search"];
const outcomeTone: Record<Stats["recent"][number]["outcome"], StatusTone> = { succeeded: "success", failed: "error", cancelled: "neutral" };

function duration(i18n: I18n, ms: number) {
  return ms < 1000
    ? i18n.formatNumber(Math.round(ms), { style: "unit", unit: "millisecond", unitDisplay: "short" })
    : i18n.formatNumber(ms / 1000, { style: "unit", unit: "second", unitDisplay: "short", maximumFractionDigits: 1 });
}
function cost(i18n: I18n, items: Stats["cost"]) {
  return items.map(item => i18n.formatNumber(item.amount, { style: "currency", currency: item.currency, minimumFractionDigits: 2, maximumFractionDigits: 4 })).join(" · ");
}

/** Metric block: main value above and secondary explanation below; tabular numerals support side-by-side comparison. */
function Metric({ label, value, note }: { label: string; value: ReactNode; note?: ReactNode }) {
  return <div className="flex min-w-0 flex-col gap-0.5 rounded-md border px-2.5 py-2">
    <dt className="type-label truncate">{label}</dt>
    <dd className="type-body truncate font-medium tabular-nums">{value}</dd>
    {note && <dd className="type-caption truncate tabular-nums">{note}</dd>}
  </div>;
}
function countNote(i18n: I18n, counts: Counts) {
  const parts = [counts.failed > 0 && i18n.formatMessage(messages.failedCount, { count: counts.failed }),
    counts.cancelled > 0 && i18n.formatMessage(messages.cancelledCount, { count: counts.cancelled })].filter(Boolean);
  return parts.length ? parts.join(" · ") : undefined;
}
const total = (counts: Counts) => counts.succeeded + counts.failed + counts.cancelled;

/** The Web card is this session's network usage panel: statistics exist only in memory for this run, and provider configuration is managed in settings. */
export function WebCard({ data }: { data: WebCardData }) {
  const i18n = useI18n(), { stats } = data;
  const requests = total(stats.search) + total(stats.fetch);
  if (!data.configured && !requests) return <div className="nodrag nopan flex min-h-0 flex-1 flex-col justify-center p-2">
    <p className="type-caption text-center text-balance">{i18n.text(messages.empty)}</p>
  </div>;
  return <div className="nodrag nopan flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-2">
    <dl className="grid grid-cols-3 gap-1.5">
      <Metric label={i18n.text(messages.searches)} value={i18n.formatNumber(total(stats.search))} note={countNote(i18n, stats.search)} />
      <Metric label={i18n.text(messages.fetches)} value={i18n.formatNumber(total(stats.fetch))} note={countNote(i18n, stats.fetch)} />
      <Metric label={i18n.text(messages.cost)} value={stats.cost.length ? cost(i18n, stats.cost) : "—"} />
    </dl>
    <p className="type-caption flex min-w-0 items-center gap-1.5 px-0.5 tabular-nums" role="status">
      {stats.inFlight > 0 && <><Spinner aria-hidden="true" className="size-3 motion-reduce:animate-none" />
        <span className="shrink-0">{i18n.formatMessage(messages.inFlight, { count: stats.inFlight })}</span><span aria-hidden="true">·</span></>}
      <span className="truncate">{stats.averageMs === null ? i18n.text(messages.noRequests)
        : i18n.formatMessage(messages.durations, { average: duration(i18n, stats.averageMs), last: duration(i18n, stats.lastMs ?? stats.averageMs) })}</span>
    </p>
    {stats.recent.length > 0 && <section className="flex min-w-0 flex-col gap-1">
      <h4 className="type-label px-0.5">{i18n.text(messages.recent)}</h4>
      <ol className="flex flex-col">
        {stats.recent.map(item => {
          const Icon = item.kind === "search" ? Search : Download;
          const when = i18n.formatDate(item.at, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
          return <li key={`${item.at}/${item.kind}/${item.subject}`} className="flex min-w-0 items-center gap-1.5 rounded-sm px-0.5 py-1" title={`${when} · ${item.subject}`}>
            <Icon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
            <span className={cn("type-caption min-w-0 flex-1 truncate text-foreground select-text", item.kind === "fetch" && "font-mono")} translate="no">{item.subject}</span>
            <span className="type-caption shrink-0 tabular-nums">{[item.cost.length > 0 && cost(i18n, item.cost), duration(i18n, item.durationMs)].filter(Boolean).join(" · ")}</span>
            <StatusIcon tone={outcomeTone[item.outcome]} className="size-3.5 shrink-0" />
            <span className="sr-only">{i18n.formatMessage(messages.outcome, { outcome: item.outcome })}</span>
          </li>;
        })}
      </ol>
    </section>}
  </div>;
}
