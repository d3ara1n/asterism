import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ToggleGroup, ToggleGroupItem } from "@asterism-app/ui/ui/toggle-group";
import { useI18n } from "../../shared/i18n";
import { dashboardMessages as msg } from "../../messages/dashboard";
import type { TelemetryActivityReply, TelemetryDrilldownTarget } from "../../../shared/telemetry";
import { formatDuration, formatInteger, formatTokens, formatUsd } from "./format";
import { CalendarHeatmap, ChartTooltipBox, KpiCard, ScheduleMatrix, SectionCard } from "./charts";

type HeatmapMetric = "totalTokens" | "costUsd" | "requests";

export function ActivityTab({
  data,
  onDrilldown,
}: {
  data: TelemetryActivityReply;
  onDrilldown: (target: TelemetryDrilldownTarget) => void;
}) {
  const i18n = useI18n();
  const [calMetric, setCalMetric] = useState<HeatmapMetric>("totalTokens");
  const [matrixMetric, setMatrixMetric] = useState<HeatmapMetric>("requests");

  const { streaks } = data;

  return (
    <div className="flex flex-col gap-4">
      {/* Habit KPI Strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiCard label={i18n.text(msg.activeDays)} value={formatInteger(streaks.activeDays)} />
        <KpiCard label={i18n.text(msg.currentStreak)} value={i18n.formatMessage(msg.daysUnit, { count: streaks.currentStreak })} />
        <KpiCard label={i18n.text(msg.longestStreak)} value={i18n.formatMessage(msg.daysUnit, { count: streaks.longestStreak })} />
        <KpiCard
          label={i18n.text(msg.dailyAverage)}
          value={formatTokens(streaks.avgDailyTokens)}
          subtext={formatUsd(streaks.avgDailyCostUsd)}
        />
        <button
          type="button"
          disabled={!streaks.peakDay}
          onClick={() => { if (streaks.peakDay) onDrilldown({ kind: "day", date: streaks.peakDay.date }); }}
          className="text-left disabled:cursor-default"
        >
          <KpiCard
            label={i18n.text(msg.peakDay)}
            value={streaks.peakDay ? streaks.peakDay.date : "—"}
            subtext={streaks.peakDay ? `${formatTokens(streaks.peakDay.totalTokens)} · ${formatUsd(streaks.peakDay.costUsd)}` : undefined}
          />
        </button>
      </div>

      {/* 52-Week Calendar Heatmap */}
      <SectionCard
        title={i18n.text(msg.calendarTitle)}
        actions={
          <ToggleGroup type="single" size="sm" variant="outline" value={calMetric} onValueChange={v => { if (v) setCalMetric(v as HeatmapMetric); }}>
            <ToggleGroupItem value="totalTokens" className="h-7 px-2 text-xs">{i18n.text(msg.metricTokens)}</ToggleGroupItem>
            <ToggleGroupItem value="costUsd" className="h-7 px-2 text-xs">{i18n.text(msg.metricCost)}</ToggleGroupItem>
            <ToggleGroupItem value="requests" className="h-7 px-2 text-xs">{i18n.text(msg.metricRequests)}</ToggleGroupItem>
          </ToggleGroup>
        }
      >
        <CalendarHeatmap
          data={data.calendar}
          metric={calMetric}
          onSelectDay={date => onDrilldown({ kind: "day", date })}
        />
      </SectionCard>

      {/* Weekly 7x24 Rhythm + Latency Distribution */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <SectionCard
          className="xl:col-span-3"
          title={i18n.text(msg.matrixTitle)}
          actions={
            <ToggleGroup type="single" size="sm" variant="outline" value={matrixMetric} onValueChange={v => { if (v) setMatrixMetric(v as HeatmapMetric); }}>
              <ToggleGroupItem value="requests" className="h-7 px-2 text-xs">{i18n.text(msg.metricRequests)}</ToggleGroupItem>
              <ToggleGroupItem value="totalTokens" className="h-7 px-2 text-xs">{i18n.text(msg.metricTokens)}</ToggleGroupItem>
              <ToggleGroupItem value="costUsd" className="h-7 px-2 text-xs">{i18n.text(msg.metricCost)}</ToggleGroupItem>
            </ToggleGroup>
          }
        >
          <ScheduleMatrix data={data.matrix} metric={matrixMetric} />
        </SectionCard>

        <SectionCard
          className="xl:col-span-2"
          title={i18n.text(msg.latencyTitle)}
          subtitle={i18n.formatMessage(msg.totalGenTime, { duration: formatDuration(data.totalGenerationMs) })}
        >
          <div className="h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.latencyBuckets} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" strokeOpacity={0.6} />
                <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={38} />
                <Tooltip
                  cursor={{ fill: "var(--accent)", fillOpacity: 0.35 }}
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <ChartTooltipBox
                        title={label}
                        rows={[{ label: i18n.text(msg.metricRequests), value: formatInteger(Number(payload[0]?.value ?? 0)), color: "var(--chart-4)" }]}
                      />
                    );
                  }}
                />
                <Bar dataKey="count" fill="var(--chart-4)" radius={[4, 4, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
