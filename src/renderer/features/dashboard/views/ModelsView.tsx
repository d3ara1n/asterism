import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "../../../shared/ui/chart";
import { cn } from "@asterism-app/ui/utils";
import { generationModelKind, type BreakdownRow, type TelemetryDistribution } from "../../../../shared/telemetry";
import { useI18n } from "../../../shared/i18n";
import { dashboardMessages as msg } from "../../../messages/dashboard";
import { DataTable, type Column } from "../DataTable";
import { formatDuration, formatInteger, formatPercent, formatTokens, formatUsd, groupLabel } from "../format";
import { cacheHitRate, outputSpeed, pricePerMillion, successRate } from "../metrics";
import { ChartSkeleton, Panel, PanelState } from "../Panel";
import { GroupName, RankedList } from "../parts";
import { useTelemetry } from "../use-telemetry";
import { groupId } from "../model";
import type { ViewProps } from "./context";

/**
 * How models perform: cost efficiency, latency, speed, and reliability side by side. The performance table measures generation,
 * so it covers the generation category within the page filter.
 */
export function ModelsView({ state, page, openGroup, openKey }: ViewProps) {
  const i18n = useI18n();
  const generation = page.filter.modelKind === undefined || page.filter.modelKind === generationModelKind;
  const models = useTelemetry({ ...page.filter, modelKind: generationModelKind }, { kind: "breakdown", dimension: "model", limit: 200, latency: true }, state.revision, generation);
  const ttft = useTelemetry(page.filter, { kind: "distribution", field: "ttft" }, state.revision);
  const duration = useTelemetry(page.filter, { kind: "distribution", field: "duration" }, state.revision);
  const thinking = useTelemetry(page.filter, { kind: "breakdown", dimension: "thinking", limit: 20, latency: false }, state.revision);
  const errors = useTelemetry(page.filter, { kind: "breakdown", dimension: "error", limit: 12, latency: false }, state.revision);
  const rows = generation ? models.data?.rows ?? [] : [];
  const fastest = Math.max(0, ...rows.map(row => outputSpeed(row.metrics) ?? 0));
  const columns = useMemo<Column<BreakdownRow>[]>(() => [
    { id: "name", label: i18n.text(msg.dimensionModel), width: "minmax(14rem, 1fr)", render: row => <GroupName group={row.group} /> },
    { id: "requests", label: i18n.text(msg.requests), width: "5rem", align: "end", value: row => row.metrics.requests, render: row => i18n.formatNumber(row.metrics.requests) },
    { id: "cost", label: i18n.text(msg.cost), width: "6rem", align: "end", value: row => row.metrics.costUsd, render: row => formatUsd(i18n, row.metrics.costUsd) },
    { id: "price", label: i18n.text(msg.pricePerMillion), width: "6.5rem", align: "end", value: row => pricePerMillion(row.metrics),
      render: row => <span className="type-caption">{formatUsd(i18n, pricePerMillion(row.metrics))}</span> },
    { id: "ttft", label: i18n.text(msg.ttft), width: "8rem", align: "end", value: row => row.ttft?.p50 ?? null,
      render: row => <span>{formatDuration(i18n, row.ttft?.p50)}<span className="type-caption"> / {formatDuration(i18n, row.ttft?.p95)}</span></span> },
    { id: "speed", label: i18n.text(msg.speed), width: "9rem", align: "end", value: row => outputSpeed(row.metrics), render: row => {
      const speed = outputSpeed(row.metrics);
      return speed === null ? "—" : <span className="flex w-full items-center gap-2">
        <span aria-hidden="true" className="h-1 flex-1 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-chart-2" style={{ width: `${fastest ? speed / fastest * 100 : 0}%` }} /></span>
        <span className="w-14 text-right">{i18n.formatMessage(msg.perSecond, { value: formatTokens(Math.round(speed)) })}</span>
      </span>;
    } },
    { id: "cache", label: i18n.text(msg.cacheHit), width: "5rem", align: "end", value: row => cacheHitRate(row.metrics), render: row => formatPercent(i18n, cacheHitRate(row.metrics), 0) },
    { id: "success", label: i18n.text(msg.success), width: "5rem", align: "end", value: row => successRate(row.metrics), render: row => {
      const rate = successRate(row.metrics);
      return <span className={cn(rate !== null && rate < 0.9 && "text-destructive", rate !== null && rate >= 0.9 && rate < 0.97 && "text-warning")}>{formatPercent(i18n, rate, 0)}</span>;
    } },
  ], [i18n, fastest]);
  return <div className="flex flex-col gap-3">
    <Panel title={i18n.text(msg.performance)} state={generation ? models : undefined} empty={rows.length === 0 && <PanelState label={i18n.text(msg.noData)} />}>
      <DataTable label={i18n.text(msg.performance)} columns={columns} rows={rows} rowKey={row => groupId(row.group)} selected={openKey}
        sort={{ id: "cost", desc: true }} onOpen={(row, origin) => openGroup(row.group, origin)} />
    </Panel>
    <div className="grid gap-3 lg:grid-cols-2">
      <Panel title={i18n.text(msg.ttftDistribution)} state={ttft} skeleton={<ChartSkeleton className="h-48" />}>
        {ttft.data && <Distribution data={ttft.data} />}
      </Panel>
      <Panel title={i18n.text(msg.durationDistribution)} state={duration} skeleton={<ChartSkeleton className="h-48" />}>
        {duration.data && <Distribution data={duration.data} />}
      </Panel>
      <Panel title={i18n.text(msg.thinkingLevels)} state={thinking} empty={thinking.data?.rows.length === 0 && <PanelState label={i18n.text(msg.noData)} />}>
        {thinking.data && <RankedList rows={thinking.data.rows} measure="costUsd" selected={openKey} onOpen={(row, origin) => openGroup(row.group, origin)} />}
      </Panel>
      <Panel title={i18n.text(msg.errors)} state={errors} empty={errors.data?.rows.length === 0 && <PanelState label={i18n.text(msg.errorsEmpty)} />}>
        {errors.data && <ul className="flex flex-col divide-y">{errors.data.rows.map(row => <li key={row.group.key} className="flex items-center gap-3 px-4 py-2 text-sm">
          <span className="min-w-0 flex-1 truncate font-mono text-xs">{groupLabel(i18n, row.group)}</span>
          {row.group.dimension === "error" && row.group.origin && <span className="type-caption">{row.group.origin}</span>}
          <span className="tabular-nums">{formatInteger(i18n, row.metrics.requests)}</span>
        </li>)}</ul>}
      </Panel>
    </div>
  </div>;
}

function Distribution({ data }: { data: TelemetryDistribution }) {
  const i18n = useI18n();
  const rows = data.counts.map((count, index) => {
    const from = index === 0 ? null : data.edges[index - 1]!, to = data.edges[index] ?? null;
    const label = from === null ? i18n.formatMessage(msg.bucketBelow, { value: formatDuration(i18n, to) })
      : to === null ? i18n.formatMessage(msg.bucketAbove, { value: formatDuration(i18n, from) })
      : i18n.formatMessage(msg.bucketBetween, { from: formatDuration(i18n, from), to: formatDuration(i18n, to) });
    return { label, count };
  });
  if (!rows.some(row => row.count > 0)) return <PanelState label={i18n.text(msg.noData)} />;
  return <ChartContainer config={{ count: { label: i18n.text(msg.requests), color: "var(--chart-4)" } }} className="aspect-auto h-48 w-full pt-2">
    <BarChart data={rows} margin={{ top: 12, right: 12, left: 4, bottom: 0 }} accessibilityLayer>
      <CartesianGrid vertical={false} />
      <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} interval={0} />
      <YAxis tickLine={false} axisLine={false} width={40} allowDecimals={false} />
      <ChartTooltip cursor={{ fillOpacity: 0.5 }} content={<ChartTooltipContent />} />
      <Bar dataKey="count" fill="var(--color-count)" radius={[3, 3, 0, 0]} maxBarSize={40} />
    </BarChart>
  </ChartContainer>;
}
