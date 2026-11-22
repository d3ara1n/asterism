import { useMemo, useState, type KeyboardEvent } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "../../shared/ui/chart";
import { Tooltip, TooltipContent, TooltipTrigger } from "@asterism-app/ui/ui/tooltip";
import { cn } from "@asterism-app/ui/utils";
import type { TelemetryMatrix, TelemetrySeries } from "../../../shared/telemetry";
import { bucketKeys, dateKeyStart, type Granularity } from "../../../shared/telemetry-time";
import { useI18n } from "../../shared/i18n";
import { dashboardMessages as msg } from "../../messages/dashboard";
import { formatMeasure, groupLabel, measureLabels, seriesColor } from "./format";
import { measureOf, type Measure } from "./metrics";

function bucketLabel(locale: string, start: number, granularity: Granularity, long: boolean): string {
  const options: Intl.DateTimeFormatOptions = granularity === "hour" ? { hour: "2-digit", minute: "2-digit", ...(long ? { month: "short", day: "numeric" } : {}) }
    : granularity === "month" ? { year: "numeric", month: "short" }
    : { month: "short", day: "numeric", ...(long ? { year: "numeric" } : {}) };
  return new Intl.DateTimeFormat(locale, options).format(start);
}

/** Bars over time: one series for the total, or stacked groups with the remainder last. Day bars open that day. */
export function TrendChart({ series, measure, onSelectDay, className }: {
  series: TelemetrySeries; measure: Measure; onSelectDay?: (dayStart: number) => void; className?: string;
}) {
  const i18n = useI18n();
  const stacked = series.groups.length > 0;
  const { data, config, keys } = useMemo(() => {
    const keys = stacked ? series.groups.map((_, index) => `g${index}`) : ["total"];
    const config: ChartConfig = stacked
      ? Object.fromEntries(series.groups.map((group, index) => [`g${index}`, { label: groupLabel(i18n, group), color: seriesColor(group, index) }]))
      : { total: { label: i18n.text(measureLabels[measure]), color: "var(--chart-1)" } };
    const data = series.points.map(point => {
      const row: Record<string, number | string> = { start: point.start, label: bucketLabel(i18n.locale, point.start, series.granularity, false) };
      if (stacked) series.groups.forEach((group, index) => { row[`g${index}`] = point.groups[group.key] ? measureOf(point.groups[group.key]!, measure) : 0; });
      else row.total = measureOf(point.metrics, measure);
      return row;
    });
    return { data, config, keys };
  }, [series, measure, stacked, i18n]);
  const clickable = onSelectDay && series.granularity === "day";
  return <ChartContainer config={config} className={cn("aspect-auto h-64 w-full", className)}>
    <BarChart data={data} margin={{ top: 12, right: 12, left: 4, bottom: 0 }} accessibilityLayer
      onClick={state => {
        const index = typeof state?.activeTooltipIndex === "number" ? state.activeTooltipIndex : Number(state?.activeTooltipIndex);
        const point = Number.isInteger(index) ? data[index] : undefined;
        if (clickable && point) onSelectDay(Number(point.start));
      }}>
      <CartesianGrid vertical={false} />
      <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
      <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={value => formatMeasure(i18n, measure, Number(value), true)} />
      <ChartTooltip cursor={{ fillOpacity: 0.5 }} content={<ChartTooltipContent
        labelFormatter={(_, payload) => {
          const start = Number(payload?.[0]?.payload?.start);
          return Number.isFinite(start) ? bucketLabel(i18n.locale, start, series.granularity, true) : null;
        }}
        formatter={(value, name, item) => <div className="flex w-full items-center gap-2">
          <span aria-hidden="true" className="size-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: item.color }} />
          <span className="min-w-0 flex-1 truncate text-muted-foreground">{config[String(name)]?.label}</span>
          <span className="font-medium tabular-nums text-foreground">{formatMeasure(i18n, measure, Number(value))}</span>
        </div>} />} />
      {keys.map((key, index) => <Bar key={key} dataKey={key} stackId={stacked ? "groups" : undefined} fill={`var(--color-${key})`}
        radius={index === keys.length - 1 ? [3, 3, 0, 0] : 0} maxBarSize={32} className={clickable ? "cursor-pointer" : undefined} />)}
    </BarChart>
  </ChartContainer>;
}

/** Legend chips for a grouped series; colors always appear with their names. */
export function SeriesLegend({ series }: { series: TelemetrySeries }) {
  const i18n = useI18n();
  if (!series.groups.length) return null;
  return <ul className="flex flex-wrap gap-x-4 gap-y-1 px-4 pb-3">
    {series.groups.map((group, index) => <li key={group.key} className="type-caption flex min-w-0 items-center gap-1.5">
      <span aria-hidden="true" className="size-2 shrink-0 rounded-[2px]" style={{ backgroundColor: seriesColor(group, index) }} />
      <span className="max-w-48 truncate">{groupLabel(i18n, group)}</span>
    </li>)}
  </ul>;
}

/** A Monday at UTC midnight; weekday names format it in UTC so the local offset cannot shift the day. */
const mondayUtc = Date.UTC(2024, 0, 1);
const levels = [0, 0.25, 0.5, 0.75, 1];
const levelOf = (value: number, max: number) => value <= 0 || max <= 0 ? 0 : Math.min(4, Math.ceil(value / max * 4));
function Cell({ level, label, onSelect, className }: { level: number; label: string; onSelect?: () => void; className?: string }) {
  const style = level ? { backgroundColor: "var(--chart-2)", opacity: 0.2 + levels[level]! * 0.8 } : undefined;
  return <Tooltip>
    <TooltipTrigger asChild>
      {onSelect
        ? <button type="button" aria-label={label} onClick={onSelect} style={style}
          className={cn("rounded-[3px] outline-none focus-visible:ring-2 focus-visible:ring-ring", !level && "bg-muted", className)} />
        : <span role="img" aria-label={label} style={style} className={cn("rounded-[3px]", !level && "bg-muted", className)} />}
    </TooltipTrigger>
    <TooltipContent className="tabular-nums">{label}</TooltipContent>
  </Tooltip>;
}

export function IntensityScale() {
  const i18n = useI18n();
  return <div className="type-caption flex items-center gap-1" aria-hidden="true">
    {i18n.text(msg.less)}
    {levels.map((_, level) => <span key={level} className={cn("size-2.5 rounded-[2px]", !level && "bg-muted")}
      style={level ? { backgroundColor: "var(--chart-2)", opacity: 0.2 + levels[level]! * 0.8 } : undefined} />)}
    {i18n.text(msg.moreScale)}
  </div>;
}

/** 53 weekly columns of local days; active days open their details. Arrow keys move between days. */
export function CalendarHeatmap({ series, start, now, offset, measure, onSelectDay }: {
  series: TelemetrySeries; start: number; now: number; offset: number; measure: Measure; onSelectDay: (dayStart: number) => void;
}) {
  const i18n = useI18n();
  const values = useMemo(() => new Map(series.points.map(point => [point.key, measureOf(point.metrics, measure)])), [series, measure]);
  const days = useMemo(() => bucketKeys(start, now + 1, "day", offset), [start, now, offset]);
  const max = Math.max(0, ...values.values());
  const weeks: string[][] = [];
  days.forEach((key, index) => { (weeks[Math.floor(index / 7)] ??= []).push(key); });
  const monthFormat = new Intl.DateTimeFormat(i18n.locale, { month: "short" });
  const dayFormat = new Intl.DateTimeFormat(i18n.locale, { year: "numeric", month: "short", day: "numeric", weekday: "short" });
  const weekday = new Intl.DateTimeFormat(i18n.locale, { weekday: "narrow", timeZone: "UTC" });
  const move = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -7, ArrowRight: 7 }[event.key];
    if (step === undefined || !(event.target instanceof HTMLElement)) return;
    const cells = [...event.currentTarget.querySelectorAll<HTMLElement>("[data-day]")];
    const target = cells[cells.indexOf(event.target) + step];
    if (target) { event.preventDefault(); target.focus(); }
  };
  return <div className="flex min-w-0 flex-col gap-3 overflow-x-auto p-4">
    <div className="grid w-max grid-flow-col gap-[3px]" style={{ gridTemplateRows: "auto repeat(7, 11px)" }} onKeyDown={move}>
      <span />
      {[0, 1, 2, 3, 4, 5, 6].map(index => <span key={index} className="type-caption pr-1 text-[10px] leading-[11px]">
        {index % 2 === 0 ? weekday.format(mondayUtc + index * 86_400_000) : ""}</span>)}
      {weeks.map((week, column) => {
        // A column names the month that begins within it.
        const monthStart = week.find(key => key.endsWith("-01"));
        return [<span key={`m${column}`} className="type-caption h-4 w-[11px] overflow-visible text-[10px] whitespace-nowrap">{monthStart ? monthFormat.format(dateKeyStart(monthStart, offset)) : ""}</span>,
          ...Array.from({ length: 7 }, (_, row) => {
            const key = week[row];
            if (!key) return <span key={`${column}-${row}`} />;
            const value = values.get(key) ?? 0;
            const dayStart = dateKeyStart(key, offset);
            const label = i18n.formatMessage(msg.calendarDay, { date: dayFormat.format(dayStart), value: formatMeasure(i18n, measure, value) });
            return <span key={key} data-day={key} className="contents">
              <Cell level={levelOf(value, max)} label={label} className="size-[11px]" onSelect={value > 0 ? () => onSelectDay(dayStart) : undefined} />
            </span>;
          })];
      })}
    </div>
    <div className="flex justify-end"><IntensityScale /></div>
  </div>;
}

/** Local weekday × hour intensity. */
export function RhythmMatrix({ matrix, measure }: { matrix: TelemetryMatrix; measure: Measure }) {
  const i18n = useI18n();
  const cells = useMemo(() => new Map(matrix.cells.map(cell => [`${cell.weekday}:${cell.hour}`, cell])), [matrix]);
  const max = Math.max(0, ...matrix.cells.map(cell => measureOf(cell, measure)));
  const weekday = new Intl.DateTimeFormat(i18n.locale, { weekday: "short", timeZone: "UTC" });
  const [hovered, setHovered] = useState<number | null>(null);
  return <div className="flex min-w-0 flex-col gap-3 overflow-x-auto p-4">
    <div className="grid min-w-[36rem] gap-[3px]" style={{ gridTemplateColumns: "2.5rem repeat(24, minmax(0, 1fr))" }} onPointerLeave={() => setHovered(null)}>
      <span />
      {Array.from({ length: 24 }, (_, hour) => <span key={hour} className={cn("type-caption text-center text-[10px] tabular-nums", hovered === hour && "text-foreground")}>
        {hour % 3 === 0 ? String(hour).padStart(2, "0") : ""}</span>)}
      {Array.from({ length: 7 }, (_, day) => {
        const name = weekday.format(mondayUtc + day * 86_400_000);
        return [<span key={`d${day}`} className="type-caption truncate pr-1 text-right text-[11px] leading-none self-center">{name}</span>,
          ...Array.from({ length: 24 }, (_, hour) => {
            const cell = cells.get(`${day}:${hour}`);
            const value = cell ? measureOf(cell, measure) : 0;
            return <span key={`${day}-${hour}`} className="contents" onPointerEnter={() => setHovered(hour)}>
              <Cell level={levelOf(value, max)} className="aspect-square w-full"
                label={i18n.formatMessage(msg.rhythmCell, { day: name, hour: String(hour).padStart(2, "0"), value: formatMeasure(i18n, measure, value) })} />
            </span>;
          })];
      })}
    </div>
    <div className="flex justify-end"><IntensityScale /></div>
  </div>;
}
