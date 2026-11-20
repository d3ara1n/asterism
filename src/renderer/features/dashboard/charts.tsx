import { useMemo, useState, type ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@asterism-app/ui/ui/tooltip";
import { cn } from "@asterism-app/ui/utils";
import { useI18n } from "../../shared/i18n";
import { dashboardMessages as msg } from "../../messages/dashboard";
import { folderCssColor, formatInteger, formatTokens, formatUsd } from "./format";

export function FolderDotInline({ color, className }: { color: string | null | undefined; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block size-2 shrink-0 rounded-full", className)}
      style={{ backgroundColor: folderCssColor(color) }}
    />
  );
}

export function SectionCard({
  title,
  subtitle,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("surface flex min-w-0 flex-col rounded-xl", className)}>
      <header className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3.5 pb-2">
        <div className="min-w-0">
          <h2 className="type-section truncate text-sm font-medium text-foreground">{title}</h2>
          {subtitle && <p className="type-caption mt-0.5 text-muted-foreground">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
      </header>
      <div className={cn("min-w-0 flex-1 px-4 pb-4 pt-1", bodyClassName)}>{children}</div>
    </section>
  );
}

export function KpiCard({
  label,
  value,
  subtext,
  delta,
  invertDelta = false,
  badge,
  footer,
}: {
  label: ReactNode;
  value: ReactNode;
  subtext?: ReactNode;
  delta?: { text: string; direction: "up" | "down" | "flat" } | null;
  invertDelta?: boolean;
  badge?: ReactNode;
  footer?: ReactNode;
}) {
  const deltaClass = !delta || delta.direction === "flat"
    ? "bg-muted text-muted-foreground"
    : (delta.direction === "up" ? !invertDelta : invertDelta)
      ? "bg-muted text-foreground"
      : "bg-muted text-muted-foreground";

  return (
    <div className="surface flex min-w-0 flex-col justify-between gap-2 rounded-xl px-4 py-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="type-label truncate text-muted-foreground">{label}</span>
        {badge}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="truncate text-2xl font-semibold tracking-tight tabular-nums text-foreground">{value}</span>
        {delta && (
          <span className={cn("shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium tabular-nums", deltaClass)}>
            {delta.text}
          </span>
        )}
      </div>
      {(subtext || footer) && (
        <div className="flex flex-col gap-1.5">
          {subtext && <div className="type-caption truncate tabular-nums text-muted-foreground">{subtext}</div>}
          {footer}
        </div>
      )}
    </div>
  );
}

export function ChartTooltipBox({
  title,
  rows,
}: {
  title: ReactNode;
  rows: readonly { label: string; value: string; color?: string }[];
}) {
  return (
    <div className="surface-floating min-w-[168px] rounded-lg border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <div className="mb-1.5 font-medium text-foreground">{title}</div>
      <div className="flex flex-col gap-1">
        {rows.map((row, idx) => (
          <div key={idx} className="flex items-center justify-between gap-4">
            <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
              {row.color && <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />}
              <span className="truncate">{row.label}</span>
            </span>
            <span className="shrink-0 font-medium tabular-nums text-foreground">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** 52-week GitHub-style activity calendar heatmap with click-to-drilldown. */
export function CalendarHeatmap({
  data,
  metric,
  onSelectDay,
}: {
  data: readonly { date: string; costUsd: number; totalTokens: number; requests: number }[];
  metric: "totalTokens" | "costUsd" | "requests";
  onSelectDay: (date: string) => void;
}) {
  const i18n = useI18n();
  const [hovered, setHovered] = useState<{ date: string; costUsd: number; totalTokens: number; requests: number } | null>(null);

  const { weeks, monthLabels, maxVal } = useMemo(() => {
    const byDate = new Map(data.map(d => [d.date, d]));
    const today = new Date();
    const endDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    // Go back 52 weeks aligned to Monday.
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 364);
    const startWeekday = (startDate.getDay() + 6) % 7; // Mon = 0
    startDate.setDate(startDate.getDate() - startWeekday);

    const weekList: { date: string; entry: { date: string; costUsd: number; totalTokens: number; requests: number }; inRange: boolean }[][] = [];
    const months: { weekIndex: number; label: string }[] = [];
    let lastMonth = -1;
    let peak = 0;

    const cursor = new Date(startDate);
    let weekIdx = 0;
    while (cursor <= endDate) {
      const week: typeof weekList[number] = [];
      for (let d = 0; d < 7; d++) {
        const y = cursor.getFullYear();
        const m = cursor.getMonth();
        const day = cursor.getDate();
        const key = `${y}-${m + 1 < 10 ? "0" : ""}${m + 1}-${day < 10 ? "0" : ""}${day}`;
        const inRange = cursor <= endDate;
        const entry = byDate.get(key) ?? { date: key, costUsd: 0, totalTokens: 0, requests: 0 };
        if (inRange) {
          const val = entry[metric];
          if (val > peak) peak = val;
        }
        if (d === 0 && m !== lastMonth && inRange) {
          months.push({ weekIndex: weekIdx, label: cursor.toLocaleDateString(i18n.locale, { month: "short" }) });
          lastMonth = m;
        }
        week.push({ date: key, entry, inRange });
        cursor.setDate(cursor.getDate() + 1);
      }
      weekList.push(week);
      weekIdx++;
    }
    return { weeks: weekList, monthLabels: months, maxVal: peak };
  }, [data, metric, i18n.locale]);

  const levelOf = (val: number): number => {
    if (val <= 0 || maxVal <= 0) return 0;
    const ratio = val / maxVal;
    if (ratio < 0.2) return 1;
    if (ratio < 0.45) return 2;
    if (ratio < 0.75) return 3;
    return 4;
  };

  const opacities = [0, 0.24, 0.46, 0.72, 1];
  const cell = 11;
  const gap = 3;
  const step = cell + gap;
  const leftPad = 26;
  const topPad = 18;
  const width = leftPad + weeks.length * step + 4;
  const height = topPad + 7 * step + 2;
  const weekdayLabels = useMemo(() => {
    // 2024-01-01 is Monday
    return [0, 2, 4].map(offset => {
      const d = new Date(2024, 0, 1 + offset);
      return { row: offset, label: d.toLocaleDateString(i18n.locale, { weekday: "narrow" }) };
    });
  }, [i18n.locale]);

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto pb-1">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full min-w-[660px]" role="img" aria-label={i18n.text(msg.calendarTitle)}>
          {monthLabels.map((m, i) => (
            <text
              key={`${m.weekIndex}-${i}`}
              x={leftPad + m.weekIndex * step}
              y={11}
              className="fill-muted-foreground text-[9px]"
            >
              {m.label}
            </text>
          ))}
          {weekdayLabels.map(w => (
            <text
              key={w.row}
              x={0}
              y={topPad + w.row * step + 9}
              className="fill-muted-foreground text-[9px]"
            >
              {w.label}
            </text>
          ))}
          {weeks.map((week, wi) =>
            week.map((day, di) => {
              if (!day.inRange) return null;
              const lvl = levelOf(day.entry[metric]);
              const x = leftPad + wi * step;
              const y = topPad + di * step;
              const active = day.entry.requests > 0;
              return (
                <rect
                  key={day.date}
                  x={x}
                  y={y}
                  width={cell}
                  height={cell}
                  rx={2.5}
                  className={cn(
                    lvl === 0 ? "fill-muted" : "",
                    active && "cursor-pointer transition-opacity hover:stroke-foreground hover:stroke-[1.2]",
                  )}
                  style={lvl > 0 ? { fill: "var(--chart-2)", fillOpacity: opacities[lvl] } : undefined}
                  onMouseEnter={() => setHovered(day.entry)}
                  onMouseLeave={() => setHovered(prev => (prev?.date === day.date ? null : prev))}
                  onClick={() => { if (active) onSelectDay(day.date); }}
                />
              );
            }),
          )}
        </svg>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <div className="min-h-[18px] tabular-nums">
          {hovered ? (
            <span>
              <strong className="font-medium text-foreground">{hovered.date}</strong>
              {" · "}
              {formatTokens(hovered.totalTokens)} tok
              {" · "}
              {formatUsd(hovered.costUsd)}
              {" · "}
              {formatInteger(hovered.requests)} req
            </span>
          ) : (
            <span className="opacity-70">&nbsp;</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-[11px]">
          <span>{i18n.text(msg.less)}</span>
          {opacities.map((op, i) => (
            <span
              key={i}
              className={cn("inline-block size-2.5 rounded-[2px]", i === 0 && "bg-muted")}
              style={i > 0 ? { backgroundColor: "var(--chart-2)", opacity: op } : undefined}
            />
          ))}
          <span>{i18n.text(msg.more)}</span>
        </div>
      </div>
    </div>
  );
}

/** 7 (Mon-Sun) x 24 (00-23) local schedule intensity matrix. */
export function ScheduleMatrix({
  data,
  metric,
}: {
  data: readonly { weekday: number; hour: number; requests: number; totalTokens: number; costUsd: number }[];
  metric: "requests" | "totalTokens" | "costUsd";
}) {
  const i18n = useI18n();
  const lookup = useMemo(() => {
    const map = new Map<string, { weekday: number; hour: number; requests: number; totalTokens: number; costUsd: number }>();
    let max = 0;
    for (const item of data) {
      map.set(`${item.weekday}:${item.hour}`, item);
      if (item[metric] > max) max = item[metric];
    }
    return { map, max };
  }, [data, metric]);

  const weekdays = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(2024, 0, 1 + i); // Monday Jan 1 2024
    return d.toLocaleDateString(i18n.locale, { weekday: "short" });
  }), [i18n.locale]);

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-[36px_repeat(24,minmax(0,1fr))] items-center gap-1">
        <div />
        {Array.from({ length: 24 }, (_, h) => (
          <div key={h} className="text-center text-[10px] tabular-nums text-muted-foreground">
            {h % 3 === 0 ? String(h).padStart(2, "0") : ""}
          </div>
        ))}
        {weekdays.map((dayLabel, w) => (
          <div key={w} className="contents">
            <div className="truncate pr-1 text-right text-[11px] text-muted-foreground">{dayLabel}</div>
            {Array.from({ length: 24 }, (_, h) => {
              const cell = lookup.map.get(`${w}:${h}`);
              const val = cell ? cell[metric] : 0;
              const ratio = lookup.max > 0 ? val / lookup.max : 0;
              const opacity = ratio <= 0 ? 0 : Math.max(0.18, Math.min(1, ratio));
              return (
                <Tooltip key={h} delayDuration={100}>
                  <TooltipTrigger asChild>
                    <div
                      className={cn("aspect-square w-full rounded-[3px] transition-transform hover:scale-110", ratio <= 0 && "bg-muted")}
                      style={ratio > 0 ? { backgroundColor: "var(--chart-1)", opacity } : undefined}
                    />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs tabular-nums">
                    <div className="font-medium">{dayLabel} {String(h).padStart(2, "0")}:00–{String(h).padStart(2, "0")}:59</div>
                    {cell ? (
                      <div className="opacity-85">
                        {formatInteger(cell.requests)} req · {formatTokens(cell.totalTokens)} tok · {formatUsd(cell.costUsd)}
                      </div>
                    ) : (
                      <div className="opacity-70">0</div>
                    )}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
