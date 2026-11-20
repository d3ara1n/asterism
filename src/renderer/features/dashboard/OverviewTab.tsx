import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertCircle, ArrowUpRight, ChevronRight, RotateCw } from "lucide-react";
import { Badge } from "@asterism-app/ui/ui/badge";
import { IconButton } from "@asterism-app/ui/ui/icon-button";
import { Progress } from "@asterism-app/ui/ui/progress";
import { ToggleGroup, ToggleGroupItem } from "@asterism-app/ui/ui/toggle-group";
import { cn } from "@asterism-app/ui/utils";
import { formatUsageAmount, usageItemLabel } from "@asterism-app/sdk/renderer";
import { quotaRemaining, usageItemLevel, usageLevel, type ProviderUsageState } from "@asterism-app/sdk/contracts";
import { usageLevelTones } from "@asterism-app/ui/usage-level";
import { useI18n } from "../../shared/i18n";
import { dashboardMessages as msg } from "../../messages/dashboard";
import { useConfiguration } from "../configuration/state";
import { useProviderUsages } from "../usage/use-usage";
import { SignalDot } from "../usage/SignalDot";
import type { TelemetryDrilldownTarget, TelemetryOverviewReply } from "../../../shared/telemetry";
import {
  chartColor,
  folderCssColor,
  formatDelta,
  formatDuration,
  formatInteger,
  formatPercent,
  formatShortBucket,
  formatTokens,
  formatUsd,
} from "./format";
import { ChartTooltipBox, FolderDotInline, KpiCard, SectionCard } from "./charts";

type TrendMetric = "costUsd" | "totalTokens" | "requests";
type StackMode = "total" | "model" | "folder" | "tokenType";

export function OverviewTab({
  data,
  monthlyBudget,
  onDrilldown,
  onOpenSession,
}: {
  data: TelemetryOverviewReply;
  monthlyBudget: number | null;
  onDrilldown: (target: TelemetryDrilldownTarget) => void;
  onOpenSession: (sessionId: string) => void;
}) {
  const i18n = useI18n();
  const [metric, setMetric] = useState<TrendMetric>("costUsd");
  const [stack, setStack] = useState<StackMode>("total");
  const { snapshot: config } = useConfiguration(true);
  const usageProviders = useMemo(
    () => (config?.modelProviders ?? []).filter(p => p.enabled && p.usage),
    [config?.modelProviders],
  );
  const liveUsage = useProviderUsages(useMemo(() => usageProviders.map(p => p.id), [usageProviders]), true);

  const { summary, previousSummary } = data;
  const totalCost = summary.costUsd + summary.externalCostUsd;
  const prevTotalCost = previousSummary ? previousSummary.costUsd + previousSummary.externalCostUsd : null;

  // Monthly budget pace calculation.
  const budgetPace = useMemo(() => {
    if (!monthlyBudget || monthlyBudget <= 0) return null;
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const dayOfMonth = Math.max(1, now.getDate());
    const usedRatio = data.monthToDateCostUsd / monthlyBudget;
    const projected = (data.monthToDateCostUsd / dayOfMonth) * daysInMonth;
    return { usedRatio, projected, pct: Math.min(100, Math.round(usedRatio * 100)) };
  }, [monthlyBudget, data.monthToDateCostUsd]);

  // Build Recharts trend dataset for current metric & stack mode.
  const effectiveStack: StackMode = metric !== "totalTokens" && stack === "tokenType" ? "total" : stack;
  const trendSeries = useMemo(() => {
    if (effectiveStack === "model") {
      return data.trendModels.map((m, idx) => ({
        key: `m_${idx}`,
        rawKey: m.key,
        label: m.key === "__other__" ? i18n.text(msg.other) : m.label,
        color: chartColor(idx),
      }));
    }
    if (effectiveStack === "folder") {
      return data.trendFolders.map((f, idx) => ({
        key: `f_${idx}`,
        rawKey: f.key,
        label: f.key === "__other__" ? i18n.text(msg.other) : f.label ?? i18n.text(msg.ungrouped),
        color: f.color ? folderCssColor(f.color) : chartColor(idx),
      }));
    }
    if (effectiveStack === "tokenType") {
      return [
        { key: "uncachedInputTokens", rawKey: "uncachedInputTokens", label: i18n.text(msg.tokUncachedInput), color: "var(--chart-1)" },
        { key: "cacheReadTokens", rawKey: "cacheReadTokens", label: i18n.text(msg.tokCacheRead), color: "var(--chart-2)" },
        { key: "cacheWriteTokens", rawKey: "cacheWriteTokens", label: i18n.text(msg.tokCacheWrite), color: "var(--chart-7)" },
        { key: "textOutputTokens", rawKey: "textOutputTokens", label: i18n.text(msg.tokTextOutput), color: "var(--chart-4)" },
        { key: "reasoningTokens", rawKey: "reasoningTokens", label: i18n.text(msg.tokReasoning), color: "var(--chart-6)" },
      ];
    }
    return [{
      key: "total",
      rawKey: "total",
      label: metric === "costUsd" ? i18n.text(msg.metricCost) : metric === "totalTokens" ? i18n.text(msg.metricTokens) : i18n.text(msg.metricRequests),
      color: "var(--chart-1)",
    }];
  }, [effectiveStack, data.trendModels, data.trendFolders, metric, i18n]);

  const chartData = useMemo(() => data.trend.map(b => {
    const row: Record<string, string | number> = {
      bucket: b.bucket,
      short: formatShortBucket(b.bucket, data.granularity),
      date: b.bucket.slice(0, 10),
    };
    if (effectiveStack === "total") {
      row.total = b[metric];
    } else if (effectiveStack === "model") {
      data.trendModels.forEach((m, idx) => {
        row[`m_${idx}`] = b.byModel[m.key]?.[metric] ?? 0;
      });
    } else if (effectiveStack === "folder") {
      data.trendFolders.forEach((f, idx) => {
        row[`f_${idx}`] = b.byFolder[f.key]?.[metric] ?? 0;
      });
    } else {
      row.uncachedInputTokens = b.uncachedInputTokens;
      row.cacheReadTokens = b.cacheReadTokens;
      row.cacheWriteTokens = b.cacheWriteTokens;
      row.textOutputTokens = b.textOutputTokens;
      row.reasoningTokens = b.reasoningTokens;
    }
    return row;
  }), [data.trend, data.granularity, data.trendModels, data.trendFolders, effectiveStack, metric]);

  const formatMetric = (v: number) =>
    metric === "costUsd" ? formatUsd(v) : metric === "totalTokens" ? formatTokens(v) : formatInteger(v);

  // Token breakdown rows
  const tokenRows = useMemo(() => {
    const tb = data.tokenBreakdown;
    const total = Math.max(1, tb.uncachedInput.tokens + tb.cacheRead.tokens + tb.cacheWrite.tokens + tb.textOutput.tokens + tb.reasoning.tokens);
    return [
      { key: "uncached", label: i18n.text(msg.tokUncachedInput), color: "var(--chart-1)", ...tb.uncachedInput, pct: tb.uncachedInput.tokens / total },
      { key: "cacheRead", label: i18n.text(msg.tokCacheRead), color: "var(--chart-2)", ...tb.cacheRead, pct: tb.cacheRead.tokens / total },
      { key: "cacheWrite", label: i18n.text(msg.tokCacheWrite), color: "var(--chart-7)", ...tb.cacheWrite, pct: tb.cacheWrite.tokens / total },
      { key: "textOut", label: i18n.text(msg.tokTextOutput), color: "var(--chart-4)", ...tb.textOutput, pct: tb.textOutput.tokens / total },
      { key: "reasoning", label: i18n.text(msg.tokReasoning), color: "var(--chart-6)", ...tb.reasoning, pct: tb.reasoning.tokens / total },
    ];
  }, [data.tokenBreakdown, i18n]);

  const purposePie = useMemo(() => data.purposes.slice(0, 7).map((p, i) => ({
    ...p,
    displayLabel: p.label ? i18n.text(p.label) : p.fallbackLabel,
    color: chartColor(i),
    value: p.totalTokens > 0 ? p.totalTokens : p.requests,
  })), [data.purposes, i18n]);

  const topFolderMax = Math.max(1, ...data.topFolders.map(f => f.costUsd > 0 ? f.costUsd : f.totalTokens));
  const topModelMax = Math.max(1, ...data.topModels.map(m => m.costUsd > 0 ? m.costUsd : m.totalTokens));

  const tokRatioTotal = Math.max(1, summary.uncachedInputTokens + summary.cacheReadTokens + summary.outputTokens);
  const successRate = summary.requests > 0 ? summary.completed / summary.requests : null;

  return (
    <div className="flex flex-col gap-4">
      {/* KPI Band */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiCard
          label={i18n.text(msg.kpiCost)}
          value={formatUsd(totalCost)}
          delta={formatDelta(totalCost, prevTotalCost)}
          badge={summary.costIncomplete > 0 ? (
            <Badge variant="warning" className="text-[10px]">{i18n.text(msg.partialPricing)}</Badge>
          ) : undefined}
          subtext={
            budgetPace
              ? i18n.formatMessage(msg.budgetPace, {
                  percent: formatPercent(budgetPace.usedRatio, 0),
                  budget: formatUsd(monthlyBudget),
                  projected: formatUsd(budgetPace.projected),
                })
              : summary.externalCostUsd > 0
                ? i18n.formatMessage(msg.plusExternal, { amount: formatUsd(summary.externalCostUsd) })
                : i18n.formatMessage(msg.burnRate, { amount: formatUsd(data.burnRate7dUsdPerDay) })
          }
          footer={budgetPace ? (
            <Progress
              value={budgetPace.pct}
              className={cn("h-1", budgetPace.usedRatio >= 1 && "[&>[data-slot=progress-indicator]]:bg-destructive", budgetPace.usedRatio >= 0.8 && budgetPace.usedRatio < 1 && "[&>[data-slot=progress-indicator]]:bg-warning")}
            />
          ) : undefined}
        />

        <KpiCard
          label={i18n.text(msg.kpiTokens)}
          value={formatTokens(summary.totalTokens)}
          delta={formatDelta(summary.totalTokens, previousSummary?.totalTokens)}
          subtext={`${formatTokens(summary.inputTokens)} in · ${formatTokens(summary.outputTokens)} out`}
          footer={
            <div className="flex h-1 w-full overflow-hidden rounded-full bg-muted">
              <div style={{ width: `${(summary.uncachedInputTokens / tokRatioTotal) * 100}%`, backgroundColor: "var(--chart-1)" }} />
              <div style={{ width: `${(summary.cacheReadTokens / tokRatioTotal) * 100}%`, backgroundColor: "var(--chart-2)" }} />
              <div style={{ width: `${(summary.outputTokens / tokRatioTotal) * 100}%`, backgroundColor: "var(--chart-4)" }} />
            </div>
          }
        />

        <KpiCard
          label={i18n.text(msg.kpiCache)}
          value={formatPercent(summary.cacheHitRate)}
          subtext={summary.cacheSavedUsd > 0
            ? i18n.formatMessage(msg.kpiCacheSaved, { amount: formatUsd(summary.cacheSavedUsd) })
            : `${formatTokens(summary.cacheReadTokens)} read`}
          badge={summary.cacheSavedUsd > 0 ? (
            <Badge variant="success" className="text-[10px] tabular-nums">-{formatUsd(summary.cacheSavedUsd)}</Badge>
          ) : undefined}
        />

        <KpiCard
          label={i18n.text(msg.kpiRequests)}
          value={formatInteger(summary.requests)}
          delta={formatDelta(summary.requests, previousSummary?.requests)}
          subtext={successRate !== null ? i18n.formatMessage(msg.kpiSuccessRate, { rate: formatPercent(successRate) }) : "—"}
          badge={summary.failed > 0 ? (
            <Badge variant="destructive" className="text-[10px] tabular-nums">{summary.failed} err</Badge>
          ) : undefined}
        />

        <KpiCard
          label={i18n.text(msg.kpiLatency)}
          value={formatDuration(summary.p50TtftMs)}
          subtext={summary.avgTokensPerSec !== null
            ? i18n.formatMessage(msg.kpiSpeed, { speed: Math.round(summary.avgTokensPerSec) })
            : `P95 ${formatDuration(summary.p95TtftMs)}`}
        />
      </div>

      {/* Main Trend (2/3) + Live Balances & Runway (1/3) */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <SectionCard
          className="xl:col-span-2"
          title={i18n.text(msg.trendTitle)}
          actions={
            <div className="flex flex-wrap items-center gap-1.5">
              <ToggleGroup type="single" size="sm" variant="outline" value={metric} onValueChange={v => { if (v) setMetric(v as TrendMetric); }}>
                <ToggleGroupItem value="costUsd" className="h-7 px-2 text-xs">{i18n.text(msg.metricCost)}</ToggleGroupItem>
                <ToggleGroupItem value="totalTokens" className="h-7 px-2 text-xs">{i18n.text(msg.metricTokens)}</ToggleGroupItem>
                <ToggleGroupItem value="requests" className="h-7 px-2 text-xs">{i18n.text(msg.metricRequests)}</ToggleGroupItem>
              </ToggleGroup>
              <ToggleGroup type="single" size="sm" variant="outline" value={effectiveStack} onValueChange={v => { if (v) setStack(v as StackMode); }}>
                <ToggleGroupItem value="total" className="h-7 px-2 text-xs">{i18n.text(msg.stackTotal)}</ToggleGroupItem>
                <ToggleGroupItem value="model" className="h-7 px-2 text-xs">{i18n.text(msg.stackModel)}</ToggleGroupItem>
                <ToggleGroupItem value="folder" className="h-7 px-2 text-xs">{i18n.text(msg.stackFolder)}</ToggleGroupItem>
                {metric === "totalTokens" && (
                  <ToggleGroupItem value="tokenType" className="h-7 px-2 text-xs">{i18n.text(msg.stackTokenType)}</ToggleGroupItem>
                )}
              </ToggleGroup>
            </div>
          }
        >
          <div className="h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                onClick={state => {
                  const payload = (state as { activePayload?: { payload?: { date?: string } }[] } | null)?.activePayload?.[0]?.payload;
                  if (payload?.date && data.granularity === "day") {
                    onDrilldown({ kind: "day", date: payload.date });
                  }
                }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" strokeOpacity={0.6} />
                <XAxis dataKey="short" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} minTickGap={20} />
                <YAxis
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  tickLine={false}
                  axisLine={false}
                  width={54}
                  tickFormatter={v => metric === "costUsd" ? formatUsd(Number(v), true) : metric === "totalTokens" ? formatTokens(Number(v)) : formatInteger(Number(v))}
                />
                <Tooltip
                  cursor={{ fill: "var(--accent)", fillOpacity: 0.35 }}
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const nonZero = payload.filter(p => Number(p.value) > 0);
                    return (
                      <ChartTooltipBox
                        title={label}
                        rows={(nonZero.length ? nonZero : payload).map(p => ({
                          label: String(p.name ?? ""),
                          value: formatMetric(Number(p.value ?? 0)),
                          color: String(p.color ?? ""),
                        }))}
                      />
                    );
                  }}
                />
                {trendSeries.map((s, idx) => (
                  <Bar
                    key={s.key}
                    dataKey={s.key}
                    name={s.label}
                    stackId={effectiveStack === "total" ? undefined : "stack"}
                    fill={s.color}
                    radius={idx === trendSeries.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
                    maxBarSize={36}
                    className={data.granularity === "day" ? "cursor-pointer" : undefined}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
          {effectiveStack !== "total" && trendSeries.length > 1 && (
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {trendSeries.map(s => (
                <span key={s.key} className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full" style={{ backgroundColor: s.color }} />
                  <span className="max-w-[140px] truncate">{s.label}</span>
                </span>
              ))}
            </div>
          )}
        </SectionCard>

        {/* Live Balances & Runway */}
        <SectionCard
          title={i18n.text(msg.quotasTitle)}
          subtitle={i18n.formatMessage(msg.burnRate, { amount: formatUsd(data.burnRate7dUsdPerDay) })}
          actions={usageProviders.length > 0 ? (
            <IconButton size="icon-xs" label={i18n.text(msg.refresh)} disabled={liveUsage.refreshing} onClick={liveUsage.refresh}>
              <RotateCw className={cn("size-3.5", liveUsage.refreshing && "motion-safe:animate-spin")} />
            </IconButton>
          ) : undefined}
        >
          {usageProviders.length === 0 ? (
            <div className="flex h-full min-h-[180px] items-center justify-center text-center text-xs text-muted-foreground">
              {i18n.text(msg.quotasEmpty)}
            </div>
          ) : (
            <ul className="flex max-h-[260px] flex-col gap-3 overflow-y-auto pr-1">
              {usageProviders.map(provider => {
                const state: ProviderUsageState | undefined = liveUsage.states.get(provider.id);
                const providerBurn = data.burnRate7dByProvider[provider.id] ?? 0;
                return (
                  <li key={provider.id} className="rounded-lg border border-border/70 bg-background/40 px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2">
                        <SignalDot level={state ? usageLevel(state.items) : null} />
                        <span className="truncate text-xs font-medium text-foreground">{provider.name}</span>
                      </span>
                      {state?.error && <AlertCircle className="size-3.5 shrink-0 text-warning" />}
                    </div>
                    <div className="mt-2 flex flex-col gap-1.5">
                      {state?.items.map(item => {
                        const lvl = usageItemLevel(item);
                        const tone = usageLevelTones[lvl];
                        const isUsd = item.type === "balance" && ((item.unit.type === "currency" && item.unit.code.toUpperCase() === "USD") || (item.unit.type === "symbol" && item.unit.symbol === "$"));
                        const runway = isUsd && providerBurn > 0.001 && item.remaining > 0
                          ? Math.floor(item.remaining / providerBurn) : null;
                        return (
                          <div key={item.id} className="flex flex-col gap-1">
                            <div className="flex items-baseline justify-between gap-2 text-xs">
                              <span className="truncate text-muted-foreground">{usageItemLabel(i18n, item)}</span>
                              <span className="shrink-0 tabular-nums font-medium text-foreground">
                                {item.type === "balance"
                                  ? formatUsageAmount(i18n, item.remaining, item.unit, { compact: false })
                                  : formatPercent(quotaRemaining(item), 0)}
                                {runway !== null && (
                                  <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
                                    {i18n.formatMessage(msg.runwayDays, { days: Math.min(999, runway) })}
                                  </span>
                                )}
                              </span>
                            </div>
                            {item.type === "quota" && (
                              <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                                <div className={cn("h-full rounded-full", tone.bar)} style={{ width: `${Math.round(quotaRemaining(item) * 100)}%` }} />
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {providerBurn > 0 && (
                        <div className="text-[11px] tabular-nums text-muted-foreground">
                          {i18n.formatMessage(msg.burnRate, { amount: formatUsd(providerBurn) })}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>
      </div>

      {/* 3-Column Structural Breakdown */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Token Composition */}
        <SectionCard title={i18n.text(msg.tokenBreakdownTitle)}>
          <div className="mb-3 flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
            {tokenRows.map(r => r.pct > 0 ? (
              <div key={r.key} style={{ width: `${r.pct * 100}%`, backgroundColor: r.color }} title={`${r.label}: ${formatTokens(r.tokens)}`} />
            ) : null)}
          </div>
          <div className="flex flex-col divide-y divide-border/50">
            {tokenRows.map(r => (
              <div key={r.key} className="flex items-center justify-between gap-2 py-2 text-xs">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: r.color }} />
                  <span className="truncate text-foreground">{r.label}</span>
                </span>
                <span className="flex shrink-0 items-center gap-3 tabular-nums">
                  <span className="text-muted-foreground">{formatTokens(r.tokens)}</span>
                  <span className="w-14 text-right font-medium text-foreground">{formatUsd(r.costUsd)}</span>
                </span>
              </div>
            ))}
          </div>
        </SectionCard>

        {/* Purpose Distribution */}
        <SectionCard title={i18n.text(msg.purposeTitle)}>
          {purposePie.length === 0 ? (
            <div className="flex h-[200px] items-center justify-center text-xs text-muted-foreground">—</div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="h-[140px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={purposePie}
                      dataKey="value"
                      nameKey="displayLabel"
                      innerRadius={42}
                      outerRadius={62}
                      paddingAngle={2}
                      stroke="none"
                      onClick={(_, index) => {
                        const item = purposePie[index];
                        if (item) onDrilldown({ kind: "purpose", pluginId: item.pluginId, purposeId: item.purposeId });
                      }}
                    >
                      {purposePie.map(item => (
                        <Cell key={`${item.pluginId}::${item.purposeId}`} fill={item.color} className="cursor-pointer" />
                      ))}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) => {
                        const item = payload?.[0]?.payload as typeof purposePie[number] | undefined;
                        if (!active || !item) return null;
                        return (
                          <ChartTooltipBox
                            title={item.displayLabel}
                            rows={[
                              { label: i18n.text(msg.metricTokens), value: formatTokens(item.totalTokens), color: item.color },
                              { label: i18n.text(msg.metricCost), value: formatUsd(item.costUsd) },
                              { label: i18n.text(msg.metricRequests), value: formatInteger(item.requests) },
                            ]}
                          />
                        );
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-col gap-1">
                {purposePie.slice(0, 5).map(item => (
                  <button
                    key={`${item.pluginId}::${item.purposeId}`}
                    type="button"
                    onClick={() => onDrilldown({ kind: "purpose", pluginId: item.pluginId, purposeId: item.purposeId })}
                    className="flex items-center justify-between gap-2 rounded-md px-2 py-1 text-left text-xs transition-colors hover:bg-accent"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="truncate text-foreground">{item.displayLabel}</span>
                    </span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {formatTokens(item.totalTokens)} · <span className="font-medium text-foreground">{formatUsd(item.costUsd)}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </SectionCard>

        {/* Top Projects (Sidebar Folders) */}
        <SectionCard title={i18n.text(msg.topFoldersTitle)}>
          <div className="flex flex-col gap-2">
            {data.topFolders.map(folder => {
              const weight = folder.costUsd > 0 ? folder.costUsd : folder.totalTokens;
              const pct = Math.max(4, Math.round((weight / topFolderMax) * 100));
              const label = folder.name ?? i18n.text(msg.ungrouped);
              return (
                <button
                  key={folder.folderId ?? "__ungrouped__"}
                  type="button"
                  onClick={() => onDrilldown({ kind: "folder", folderId: folder.folderId })}
                  className="group flex flex-col gap-1 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-accent"
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="flex min-w-0 items-center gap-2">
                      <FolderDotInline color={folder.color} />
                      <span className="truncate font-medium text-foreground">{label}</span>
                      {folder.deleted && <span className="text-[10px] text-muted-foreground">({i18n.text(msg.deletedMark)})</span>}
                    </span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {formatTokens(folder.totalTokens)} · <span className="font-medium text-foreground">{formatUsd(folder.costUsd)}</span>
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: folderCssColor(folder.color) }} />
                  </div>
                </button>
              );
            })}
            {data.topFolders.length === 0 && (
              <div className="flex h-[160px] items-center justify-center text-xs text-muted-foreground">—</div>
            )}
          </div>
        </SectionCard>
      </div>

      {/* Bottom Dual Leaderboards */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title={i18n.text(msg.topModelsTitle)}>
          <div className="flex flex-col divide-y divide-border/50">
            {data.topModels.map((m, idx) => {
              const weight = m.costUsd > 0 ? m.costUsd : m.totalTokens;
              const pct = Math.max(3, Math.round((weight / topModelMax) * 100));
              return (
                <button
                  key={`${m.providerId}::${m.modelId}`}
                  type="button"
                  onClick={() => onDrilldown({ kind: "model", providerId: m.providerId, modelId: m.modelId })}
                  className="group flex items-center justify-between gap-3 py-2.5 text-left transition-colors hover:bg-accent/50 -mx-2 rounded-lg px-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: chartColor(idx) }} />
                      <span className="truncate text-xs font-medium text-foreground">{m.modelId}</span>
                      <span className="truncate text-[11px] text-muted-foreground">{m.providerName}</span>
                    </div>
                    <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: chartColor(idx) }} />
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-xs tabular-nums">
                    <div className="text-right">
                      <div className="font-medium text-foreground">{formatUsd(m.costUsd)}</div>
                      <div className="text-[11px] text-muted-foreground">{formatTokens(m.totalTokens)} · {formatInteger(m.requests)}</div>
                    </div>
                    <ChevronRight className="size-3.5 text-muted-foreground opacity-50 transition-opacity group-hover:opacity-100" />
                  </div>
                </button>
              );
            })}
            {data.topModels.length === 0 && <div className="py-8 text-center text-xs text-muted-foreground">—</div>}
          </div>
        </SectionCard>

        <SectionCard title={i18n.text(msg.topSessionsTitle)}>
          <div className="flex flex-col divide-y divide-border/50">
            {data.topSessions.map(s => (
              <div
                key={s.sessionId}
                className="group -mx-2 flex items-center gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-accent/50"
              >
                <button
                  type="button"
                  onClick={() => onDrilldown({ kind: "session", sessionId: s.sessionId })}
                  className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {s.folderId && <FolderDotInline color={s.folderColor} />}
                      <span className={cn("truncate text-xs font-medium", s.deleted ? "text-muted-foreground" : "text-foreground")}>{s.title}</span>
                      {s.deleted && <Badge variant="secondary" className="text-[10px]">{i18n.text(msg.deletedMark)}</Badge>}
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {s.folderName ?? i18n.text(msg.ungrouped)} · {formatInteger(s.requests)} req · {formatTokens(s.totalTokens)}
                    </div>
                  </div>
                  <div className="shrink-0 text-right text-xs font-medium tabular-nums text-foreground">
                    {formatUsd(s.costUsd)}
                  </div>
                </button>
                {(s.status === "active" || s.status === "sleeping") && (
                  <IconButton size="icon-xs" label={i18n.text(msg.openSession)} onClick={() => onOpenSession(s.sessionId)}>
                    <ArrowUpRight className="size-3.5" />
                  </IconButton>
                )}
              </div>
            ))}
            {data.topSessions.length === 0 && <div className="py-8 text-center text-xs text-muted-foreground">—</div>}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
