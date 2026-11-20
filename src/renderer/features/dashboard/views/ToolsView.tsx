import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { SearchInput } from "@asterism-app/ui/ui/search-input";
import { ToggleGroup, ToggleGroupItem } from "@asterism-app/ui/ui/toggle-group";
import { cn } from "@asterism-app/ui/utils";
import type { ExternalRow, ToolRow } from "../../../../shared/telemetry";
import { useI18n } from "../../../shared/i18n";
import { dashboardMessages as msg } from "../../../messages/dashboard";
import { DataTable, type Column } from "../DataTable";
import { formatCurrency, formatDuration, formatPercent, formatUsd } from "../format";
import { Panel, PanelState } from "../Panel";
import { RankedList } from "../parts";
import { useTelemetry } from "../use-telemetry";
import type { ViewProps } from "./context";

/** What the work invoked: tool calls by tool or resource type, plugin purposes, and other metered services. */
export function ToolsView({ state, page, openGroup, openKey }: ViewProps) {
  const i18n = useI18n();
  const [groupBy, setGroupBy] = useState<"tool" | "resource">("tool");
  const [query, setQuery] = useState("");
  const tools = useTelemetry(page.filter, { kind: "tools", groupBy }, state.revision);
  const purposes = useTelemetry(page.filter, { kind: "breakdown", dimension: "purpose", limit: 50, latency: false }, state.revision);
  const external = useTelemetry(page.filter, { kind: "external" }, state.revision);
  const modelScoped = page.filter.providerId !== undefined || page.filter.purposeId !== undefined || page.filter.thinking !== undefined;
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const all = tools.data?.rows ?? [];
    return needle ? all.filter(row => (row.toolName ?? row.resourceKind ?? "").toLowerCase().includes(needle)) : all;
  }, [tools.data, query]);
  const columns = useMemo<Column<ToolRow>[]>(() => [
    { id: "name", label: i18n.text(groupBy === "tool" ? msg.groupTool : msg.groupResource), width: "minmax(14rem, 1fr)",
      render: row => <span className="min-w-0 truncate font-mono text-xs">{row.toolName ?? row.resourceKind ?? i18n.text(msg.noResource)}</span> },
    { id: "calls", label: i18n.text(msg.calls), width: "5rem", align: "end", value: row => row.calls, render: row => i18n.formatNumber(row.calls) },
    { id: "success", label: i18n.text(msg.success), width: "5rem", align: "end", value: row => row.calls ? row.succeeded / row.calls : null, render: row => {
      const rate = row.calls ? row.succeeded / row.calls : null;
      return <span className={cn(rate !== null && rate < 0.8 && "text-destructive", rate !== null && rate >= 0.8 && rate < 0.95 && "text-warning")}>{formatPercent(i18n, rate, 0)}</span>;
    } },
    { id: "failed", label: i18n.text(msg.failed), width: "4.5rem", align: "end", value: row => row.failed + row.rejected,
      render: row => <span className="type-caption">{i18n.formatNumber(row.failed + row.rejected)}</span> },
    { id: "duration", label: i18n.text(msg.duration), width: "8.5rem", align: "end", value: row => row.duration.p50,
      render: row => <span>{formatDuration(i18n, row.duration.p50)}<span className="type-caption"> / {formatDuration(i18n, row.duration.p95)}</span></span> },
    { id: "total", label: i18n.text(msg.totalTime), width: "6rem", align: "end", value: row => row.durationMs, render: row => formatDuration(i18n, row.durationMs) },
  ], [i18n, groupBy]);
  const externalColumns = useMemo<Column<ExternalRow>[]>(() => [
    { id: "name", label: i18n.text(msg.external), width: "minmax(12rem, 1fr)", render: row => <span className="flex min-w-0 flex-col">
      <span className="truncate">{row.category}{row.provider ? ` · ${row.provider}` : ""}</span>
      <span className="type-caption truncate">{row.pluginName ? i18n.text(row.pluginName) : row.pluginId}</span>
    </span> },
    { id: "count", label: i18n.text(msg.calls), width: "5rem", align: "end", value: row => row.count, render: row => i18n.formatNumber(row.count) },
    { id: "failed", label: i18n.text(msg.failed), width: "4.5rem", align: "end", value: row => row.failed, render: row => <span className="type-caption">{i18n.formatNumber(row.failed)}</span> },
    { id: "amount", label: i18n.text(msg.cost), width: "7rem", align: "end", value: row => row.currency === "USD" ? row.amount : null,
      render: row => row.amount === null || !row.currency ? <span className="type-caption">{i18n.text(msg.unpriced)}</span>
        : row.currency === "USD" ? formatUsd(i18n, row.amount) : formatCurrency(i18n, row.amount, row.currency) },
  ], [i18n]);
  return <div className="flex flex-col gap-3">
    <Panel title={i18n.text(msg.toolCalls)} state={tools}
      actions={<>
        <ToggleGroup type="single" size="sm" variant="outline" value={groupBy} aria-label={i18n.text(msg.dimension)}
          onValueChange={value => { if (value) setGroupBy(value as typeof groupBy); }}>
          <ToggleGroupItem value="tool" className="h-7 px-2 text-xs">{i18n.text(msg.groupTool)}</ToggleGroupItem>
          <ToggleGroupItem value="resource" className="h-7 px-2 text-xs">{i18n.text(msg.groupResource)}</ToggleGroupItem>
        </ToggleGroup>
        <div className="w-48"><SearchInput value={query} onChange={setQuery} label={i18n.text(msg.search)} /></div>
      </>}
      empty={tools.data?.rows.length === 0 ? <PanelState label={i18n.text(msg.toolsEmpty)} /> : rows.length === 0 && <PanelState icon={<Search />} label={i18n.text(msg.noMatches)} />}>
      <DataTable label={i18n.text(msg.toolCalls)} columns={columns} rows={rows} rowKey={row => `${row.toolName ?? ""}\n${row.resourceKind ?? ""}`} sort={{ id: "calls", desc: true }} />
    </Panel>
    <div className="grid gap-3 lg:grid-cols-2">
      <Panel title={i18n.text(msg.plugins)} state={purposes} empty={purposes.data?.rows.length === 0 && <PanelState label={i18n.text(msg.noData)} />}>
        {purposes.data && <RankedList rows={purposes.data.rows} measure="costUsd" selected={openKey} onOpen={(row, origin) => openGroup(row.group, origin)} />}
      </Panel>
      <Panel title={i18n.text(msg.external)} state={external}
        empty={external.data?.rows.length === 0 && <PanelState label={i18n.text(modelScoped ? msg.externalExcluded : msg.externalEmpty)} />}>
        {external.data && <DataTable label={i18n.text(msg.external)} columns={externalColumns} rows={external.data.rows}
          rowKey={row => [row.pluginId, row.category, row.provider, row.unit, row.currency].join("\n")} />}
      </Panel>
    </div>
  </div>;
}
