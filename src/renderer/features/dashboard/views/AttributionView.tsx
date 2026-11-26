import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { SearchInput } from "@asterism-app/ui/ui/search-input";
import { ToggleGroup, ToggleGroupItem } from "@asterism-app/ui/ui/toggle-group";
import type { BreakdownRow, TelemetryDimension } from "../../../../shared/telemetry";
import { useI18n } from "../../../shared/i18n";
import { dashboardMessages as msg } from "../../../messages/dashboard";
import { SeriesLegend, TrendChart } from "../charts";
import { DataTable, type Column } from "../DataTable";
import { formatDuration, formatPercent, formatRelative, formatTokens, formatUsd, groupDetail, groupLabel } from "../format";
import { cacheHitRate, successRate } from "../metrics";
import { ChartSkeleton, Panel, PanelState } from "../Panel";
import { GroupName } from "../parts";
import { useTelemetry } from "../use-telemetry";
import { groupId } from "../model";
import { MeasureToggle } from "./OverviewView";
import { attributionDimensions, dimensionLabels } from "./dimensions";
import type { ViewProps } from "./context";
import type { Measure } from "../metrics";

const rowLimit = 500;

/** Where usage went: one dimension at a time, with its share over time and a sortable table of every value. */
export function AttributionView({ model, state, page, openGroup, openKey }: ViewProps) {
  const i18n = useI18n();
  const dimension = state.attribution;
  const [measure, setMeasure] = useState<Measure>("costUsd");
  const [query, setQuery] = useState("");
  const series = useTelemetry(page.filter, { kind: "series", granularity: page.window.granularity, groupBy: dimension, limit: 8 }, state.revision);
  const breakdown = useTelemetry(page.filter, { kind: "breakdown", dimension, limit: rowLimit, latency: false }, state.revision);
  const rows = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase(i18n.locale);
    const all = breakdown.data?.rows ?? [];
    return needle ? all.filter(row => `${groupLabel(i18n, row.group)} ${groupDetail(i18n, row.group) ?? ""}`.toLocaleLowerCase(i18n.locale).includes(needle)) : all;
  }, [breakdown.data, query, i18n]);
  const total = breakdown.data?.rows.reduce((sum, row) => sum + row.metrics.costUsd, 0) ?? 0;
  const columns = useMemo(() => attributionColumns(i18n, dimension, total), [i18n, dimension, total]);
  return <div className="flex flex-col gap-3">
    <div className="flex flex-wrap items-center gap-2">
      <ToggleGroup type="single" variant="segmented" value={dimension} aria-label={i18n.text(msg.dimension)}
        onValueChange={value => { if (value) model.setAttribution(value as TelemetryDimension); }}>
        {attributionDimensions.map(key => <ToggleGroupItem key={key} value={key}>{i18n.text(dimensionLabels[key])}</ToggleGroupItem>)}
      </ToggleGroup>
    </div>
    <Panel title={i18n.text(dimensionLabels[dimension])} state={series} skeleton={<ChartSkeleton className="h-64" />}
      empty={series.data?.groups.length === 0 && <PanelState label={i18n.text(msg.noData)} />} actions={<MeasureToggle value={measure} onChange={setMeasure} />}>
      {series.data && <><TrendChart series={series.data} measure={measure} className="h-64 pt-2" /><SeriesLegend series={series.data} /></>}
    </Panel>
    <Panel title={breakdown.data && breakdown.data.total > breakdown.data.rows.length
      ? i18n.formatMessage(msg.shownOf, { shown: breakdown.data.rows.length, total: breakdown.data.total }) : i18n.text(dimensionLabels[dimension])}
      state={breakdown} actions={<div className="w-56"><SearchInput value={query} onChange={setQuery} label={i18n.text(msg.search)} /></div>}
      empty={breakdown.data?.rows.length === 0 ? <PanelState label={i18n.text(msg.noData)} />
        : rows.length === 0 && <PanelState icon={<Search />} label={i18n.text(msg.noMatches)} />}>
      <DataTable label={i18n.text(dimensionLabels[dimension])} columns={columns} rows={rows} rowKey={row => groupId(row.group)} selected={openKey}
        sort={{ id: "cost", desc: true }} onOpen={(row, origin) => openGroup(row.group, origin)} />
    </Panel>
  </div>;
}

function attributionColumns(i18n: ReturnType<typeof useI18n>, dimension: TelemetryDimension, totalCost: number): Column<BreakdownRow>[] {
  const columns: Column<BreakdownRow>[] = [
    { id: "name", label: i18n.text(dimensionLabels[dimension]), width: "minmax(14rem, 1fr)", render: row => <GroupName group={row.group} /> },
    { id: "cost", label: i18n.text(msg.cost), width: "6rem", align: "end", value: row => row.metrics.costUsd, render: row => formatUsd(i18n, row.metrics.costUsd) },
    { id: "share", label: i18n.text(msg.share), width: "4.5rem", align: "end", value: row => row.metrics.costUsd,
      render: row => <span className="type-caption">{formatPercent(i18n, totalCost > 0 ? row.metrics.costUsd / totalCost : null, 0)}</span> },
    { id: "tokens", label: i18n.text(msg.tokens), width: "5.5rem", align: "end", value: row => row.metrics.totalTokens, render: row => formatTokens(row.metrics.totalTokens) },
    { id: "requests", label: i18n.text(msg.requests), width: "5rem", align: "end", value: row => row.metrics.requests, render: row => i18n.formatNumber(row.metrics.requests) },
  ];
  if (dimension !== "session") columns.push({ id: "sessions", label: i18n.text(msg.sessions), width: "5rem", align: "end", value: row => row.sessions, render: row => i18n.formatNumber(row.sessions) });
  columns.push(
    { id: "cache", label: i18n.text(msg.cacheHit), width: "5rem", align: "end", value: row => cacheHitRate(row.metrics), render: row => formatPercent(i18n, cacheHitRate(row.metrics), 0) },
    { id: "success", label: i18n.text(msg.success), width: "4.5rem", align: "end", value: row => successRate(row.metrics), render: row => formatPercent(i18n, successRate(row.metrics), 0) },
    { id: "duration", label: i18n.text(msg.duration), width: "5.5rem", align: "end", value: row => row.metrics.durationMs, render: row => formatDuration(i18n, row.metrics.durationMs) },
    { id: "last", label: i18n.text(msg.lastActive), width: "6.5rem", align: "end", value: row => row.metrics.lastAt, render: row => <span className="type-caption">{formatRelative(i18n, row.metrics.lastAt)}</span> },
  );
  return columns;
}
