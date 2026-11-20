import { useMemo, useState } from "react";
import { CalendarDays, Clock } from "lucide-react";
import { localDateKey } from "../../../../shared/telemetry-time";
import { useI18n } from "../../../shared/i18n";
import { dashboardMessages as msg } from "../../../messages/dashboard";
import { CalendarHeatmap, RhythmMatrix } from "../charts";
import { formatMeasure } from "../format";
import { ChartSkeleton, Panel } from "../Panel";
import { Stat } from "../parts";
import { calendarStart, streaks } from "../range";
import { useTelemetry } from "../use-telemetry";
import { MeasureToggle } from "./OverviewView";
import type { ViewProps } from "./context";
import type { Measure } from "../metrics";

/** When work happens: the past year as a calendar, and the weekly rhythm within the page range. */
export function ActivityView({ state, page, openDay }: ViewProps) {
  const i18n = useI18n();
  const [measure, setMeasure] = useState<Measure>("totalTokens");
  const start = calendarStart(state.now, page.offset);
  // The calendar always covers the past year; dimension filters still apply.
  const yearFilter = useMemo(() => ({ ...page.filter, from: start, to: null }), [page.filter, start]);
  const year = useTelemetry(yearFilter, { kind: "series", granularity: "day", groupBy: null, limit: 1 }, state.revision);
  const matrix = useTelemetry(page.filter, { kind: "matrix" }, state.revision);
  const facts = useMemo(() => {
    const points = year.data?.points.filter(point => point.metrics.requests > 0) ?? [];
    const { current, longest } = streaks(new Set(points.map(point => point.key)), localDateKey(state.now, page.offset));
    const peak = points.reduce<(typeof points)[number] | null>((best, point) => !best || point.metrics[measure] > best.metrics[measure] ? point : best, null);
    return { active: points.length, current, longest, peak };
  }, [year.data, state.now, page.offset, measure]);
  return <div className="flex flex-col gap-3">
    <Panel title={i18n.text(msg.calendar)} icon={<CalendarDays />} state={year} skeleton={<ChartSkeleton className="h-40" />}
      actions={<MeasureToggle value={measure} onChange={setMeasure} />}>
      {year.data && <>
        <div className="grid grid-cols-2 divide-x border-b md:grid-cols-4">
          <Stat label={i18n.text(msg.activeDays)} value={i18n.formatNumber(facts.active)} />
          <Stat label={i18n.text(msg.currentStreak)} value={i18n.formatMessage(msg.daysValue, { count: facts.current })} />
          <Stat label={i18n.text(msg.longestStreak)} value={i18n.formatMessage(msg.daysValue, { count: facts.longest })} />
          {facts.peak ? <button type="button" onClick={() => openDay(facts.peak!.start)}
            className="text-left transition-colors outline-none hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
            <Stat label={i18n.text(msg.peakDay)} value={i18n.formatDate(facts.peak.start, { month: "short", day: "numeric" })}
              detail={formatMeasure(i18n, measure, facts.peak.metrics[measure])} />
          </button> : <Stat label={i18n.text(msg.peakDay)} value="—" />}
        </div>
        <CalendarHeatmap series={year.data} start={start} now={state.now} offset={page.offset} measure={measure} onSelectDay={openDay} />
      </>}
    </Panel>
    <Panel title={i18n.text(msg.rhythm)} icon={<Clock />} state={matrix} skeleton={<ChartSkeleton className="h-48" />}>
      {matrix.data && <RhythmMatrix matrix={matrix.data} measure={measure} />}
    </Panel>
  </div>;
}
