import { useMemo, useState } from "react";
import { CircleAlert, Gauge, RotateCw, TrendingUp, Wallet } from "lucide-react";
import { formatUsageAmount, usageItemLabel, useRendererSettings } from "@asterism-app/sdk/renderer";
import { quotaRemaining, usageItemLevel, usageLevel } from "@asterism-app/sdk/contracts";
import { usageLevelTones } from "@asterism-app/ui/usage-level";
import { Badge } from "@asterism-app/ui/ui/badge";
import { Button } from "@asterism-app/ui/ui/button";
import { IconButton } from "@asterism-app/ui/ui/icon-button";
import { ToggleGroup, ToggleGroupItem } from "@asterism-app/ui/ui/toggle-group";
import { cn } from "@asterism-app/ui/utils";
import type { TelemetryDimension, UsageMetrics } from "../../../../shared/telemetry";
import { localMonthStart } from "../../../../shared/telemetry-time";
import { useI18n } from "../../../shared/i18n";
import { dashboardMessages as msg } from "../../../messages/dashboard";
import { useConfiguration } from "../../configuration/state";
import { useProviderUsages } from "../../usage/use-usage";
import { SignalDot } from "../../usage/SignalDot";
import { SeriesLegend, TrendChart } from "../charts";
import { formatDuration, formatInteger, formatPercent, formatTokens, formatUsd, measureLabels } from "../format";
import { cacheHitRate, change, outputSpeed, successRate, textOutput, uncachedInput, type Measure } from "../metrics";
import { ChartSkeleton, Panel, PanelState } from "../Panel";
import { RankedList, Stat } from "../parts";
import { budgetPace } from "../range";
import { useTelemetry } from "../use-telemetry";
import type { ViewProps } from "./context";

type Split = "none" | "model" | "folder" | "purpose";
const splitLabels = { none: msg.splitNone, model: msg.splitModel, folder: msg.splitFolder, purpose: msg.splitPurpose } as const;
const measures: readonly Measure[] = ["costUsd", "totalTokens", "requests"];

export function OverviewView({ state, page, openGroup, openDay, openKey }: ViewProps) {
  const i18n = useI18n();
  const { filter, window } = page;
  const [measure, setMeasure] = useState<Measure>("costUsd");
  const [split, setSplit] = useState<Split>("none");
  const summary = useTelemetry(filter, { kind: "summary", compare: window.compare }, state.revision);
  const series = useTelemetry(filter, { kind: "series", granularity: window.granularity, groupBy: split === "none" ? null : split, limit: 6 }, state.revision);
  const models = useTelemetry(filter, { kind: "breakdown", dimension: "model", limit: 6, latency: false }, state.revision);
  const folders = useTelemetry(filter, { kind: "breakdown", dimension: "folder", limit: 6, latency: false }, state.revision);
  const sessions = useTelemetry(filter, { kind: "breakdown", dimension: "session", limit: 6, latency: false }, state.revision);
  const purposes = useTelemetry(filter, { kind: "breakdown", dimension: "purpose", limit: 6, latency: false }, state.revision);
  const data = summary.data;
  const empty = data?.metrics.requests === 0 && <PanelState label={i18n.text(msg.noData)} />;
  const ranked = (title: string, dimension: TelemetryDimension, result: typeof models) =>
    <Panel key={dimension} title={title} state={result} empty={result.data?.rows.length === 0 && <PanelState label={i18n.text(msg.noData)} />}>
      {result.data && <RankedList rows={result.data.rows} measure={measure} selected={openKey} onOpen={(row, origin) => openGroup(row.group, origin)} />}
    </Panel>;
  return <div className="flex flex-col gap-3">
    <Panel title={i18n.text(msg.viewOverview)} icon={<TrendingUp />} state={summary} skeleton={<div className="h-28" />}>
      {data && <Headline metrics={data.metrics} previous={data.previous?.metrics} externalUsd={data.external.usd} previousExternalUsd={data.previous?.external.usd}
        ttft={data.ttft} />}
    </Panel>
    <div className="grid gap-3 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
      <Panel title={i18n.text(msg.trend)} state={series} skeleton={<ChartSkeleton className="h-64" />} empty={empty}
        actions={<>
          <ToggleGroup type="single" size="sm" variant="outline" value={split} aria-label={i18n.text(msg.splitBy)} onValueChange={value => { if (value) setSplit(value as Split); }}>
            {(Object.keys(splitLabels) as Split[]).map(key => <ToggleGroupItem key={key} value={key} className="h-7 px-2 text-xs">{i18n.text(splitLabels[key])}</ToggleGroupItem>)}
          </ToggleGroup>
          <MeasureToggle value={measure} onChange={setMeasure} />
        </>}>
        {series.data && <><TrendChart series={series.data} measure={measure} onSelectDay={openDay} className="h-64 pt-2" /><SeriesLegend series={series.data} /></>}
      </Panel>
      <div className="grid content-start gap-3">
        <BudgetPanel page={page} now={state.now} revision={state.revision} />
        <BalancesPanel offset={page.offset} now={state.now} revision={state.revision} />
      </div>
    </div>
    <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-4">
      <CompositionPanel metrics={data?.metrics ?? null} state={summary} />
      {ranked(i18n.text(msg.topModels), "model", models)}
      {ranked(i18n.text(msg.topFolders), "folder", folders)}
      {ranked(i18n.text(msg.topPurposes), "purpose", purposes)}
    </div>
    {ranked(i18n.text(msg.topSessions), "session", sessions)}
  </div>;
}

export function MeasureToggle({ value, onChange }: { value: Measure; onChange: (value: Measure) => void }) {
  const i18n = useI18n();
  return <ToggleGroup type="single" size="sm" variant="outline" value={value} aria-label={i18n.text(msg.measure)} onValueChange={next => { if (next) onChange(next as Measure); }}>
    {measures.map(key => <ToggleGroupItem key={key} value={key} className="h-7 px-2 text-xs">{i18n.text(measureLabels[key])}</ToggleGroupItem>)}
  </ToggleGroup>;
}

function Headline({ metrics, previous, externalUsd, previousExternalUsd, ttft }: {
  metrics: UsageMetrics; previous: UsageMetrics | undefined; externalUsd: number; previousExternalUsd: number | undefined; ttft: { p50: number | null; p95: number | null };
}) {
  const i18n = useI18n();
  const cost = metrics.costUsd + externalUsd;
  const speed = outputSpeed(metrics);
  const rate = successRate(metrics);
  return <div className="grid grid-cols-2 divide-y md:grid-cols-3 md:divide-y-0 xl:grid-cols-5 xl:divide-x [&>*]:border-border">
    <Stat label={i18n.text(msg.cost)} value={formatUsd(i18n, cost)} change={previous ? change(cost, previous.costUsd + (previousExternalUsd ?? 0)) : undefined}
      badge={metrics.costIncomplete > 0 ? <Badge variant="secondary" className="font-normal" title={i18n.formatMessage(msg.costPartial, { count: metrics.costIncomplete })}>
        <CircleAlert />{i18n.formatNumber(metrics.costIncomplete)}</Badge> : undefined}
      detail={externalUsd > 0 ? i18n.formatMessage(msg.costExternal, { amount: formatUsd(i18n, externalUsd) }) : i18n.text(msg.costEstimated)} />
    <Stat label={i18n.text(msg.tokens)} value={formatTokens(metrics.totalTokens)} change={previous ? change(metrics.totalTokens, previous.totalTokens) : undefined}
      detail={i18n.formatMessage(msg.inOut, { input: formatTokens(metrics.inputTokens), output: formatTokens(metrics.outputTokens) })} />
    <Stat label={i18n.text(msg.requests)} value={formatInteger(i18n, metrics.requests)} change={previous ? change(metrics.requests, previous.requests) : undefined}
      detail={metrics.failed ? i18n.formatMessage(msg.failedCount, { count: metrics.failed }) : `${i18n.text(msg.success)} ${formatPercent(i18n, rate)}`} />
    <Stat label={i18n.text(msg.cacheHit)} value={formatPercent(i18n, cacheHitRate(metrics))}
      detail={metrics.cacheSavedUsd > 0 ? i18n.formatMessage(msg.cacheSaved, { amount: formatUsd(i18n, metrics.cacheSavedUsd) }) : undefined} />
    <Stat label={i18n.text(msg.ttft)} value={formatDuration(i18n, ttft.p50)}
      detail={[ttft.p95 !== null ? i18n.formatMessage(msg.p95, { value: formatDuration(i18n, ttft.p95) }) : null,
        speed !== null ? i18n.formatMessage(msg.perSecond, { value: formatTokens(Math.round(speed)) }) : null].filter(Boolean).join(" · ")} />
  </div>;
}

function CompositionPanel({ metrics, state }: { metrics: UsageMetrics | null; state: Parameters<typeof Panel>[0]["state"] }) {
  const i18n = useI18n();
  const rows = metrics ? [
    { label: msg.uncachedInput, tokens: uncachedInput(metrics), cost: metrics.cost.input, color: "var(--chart-1)" },
    { label: msg.cacheRead, tokens: metrics.cacheReadTokens, cost: metrics.cost.cacheRead, color: "var(--chart-2)" },
    { label: msg.cacheWrite, tokens: metrics.cacheWriteTokens, cost: metrics.cost.cacheWrite, color: "var(--chart-7)" },
    { label: msg.textOutput, tokens: textOutput(metrics), cost: metrics.cost.output, color: "var(--chart-4)" },
    { label: msg.reasoning, tokens: metrics.reasoningTokens, cost: metrics.cost.reasoning, color: "var(--chart-6)" },
  ] : [];
  const total = rows.reduce((sum, row) => sum + row.tokens, 0);
  return <Panel title={i18n.text(msg.composition)} state={state} empty={metrics?.requests === 0 && <PanelState label={i18n.text(msg.noData)} />}>
    <div className="flex flex-col gap-3 p-4">
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
        {rows.map(row => <span key={row.label.id} className="h-full transition-[width] duration-500 ease-out" style={{ width: `${total ? row.tokens / total * 100 : 0}%`, backgroundColor: row.color }} />)}
      </div>
      <ul className="flex flex-col gap-2">
        {rows.map(row => <li key={row.label.id} className="flex items-center gap-2 text-sm">
          <span aria-hidden="true" className="size-2 shrink-0 rounded-[2px]" style={{ backgroundColor: row.color }} />
          <span className="min-w-0 flex-1 truncate">{i18n.text(row.label)}</span>
          <span className="type-caption tabular-nums">{formatTokens(row.tokens)}</span>
          <span className="w-16 text-right tabular-nums">{row.cost === null ? "—" : formatUsd(i18n, row.cost)}</span>
        </li>)}
      </ul>
    </div>
  </Panel>;
}

/** Month-to-date spending against the configured target; the period is the calendar month regardless of the page range. */
function BudgetPanel({ page, now, revision }: { page: ViewProps["page"]; now: number; revision: number }) {
  const i18n = useI18n();
  const settings = useRendererSettings();
  const { snapshot } = useConfiguration(true);
  const budget = snapshot?.usageBudget ?? null;
  const month = useMemo(() => ({ ...page.filter, from: localMonthStart(now, page.offset), to: null }), [page.filter, page.offset, now]);
  const spent = useTelemetry(month, { kind: "summary", compare: null }, revision, budget !== null);
  const amount = spent.data ? spent.data.metrics.costUsd + spent.data.external.usd : null;
  const pace = budget !== null && amount !== null ? budgetPace(amount, budget, now, page.offset) : null;
  return <Panel title={i18n.text(msg.budget)} icon={<Gauge />} state={budget === null ? undefined : spent} skeleton={<div className="h-24" />}
    empty={budget === null && <PanelState label={i18n.text(msg.budgetUnset)}
      action={<Button variant="outline" size="sm" onClick={() => settings.openHost("general")}>{i18n.text(msg.budgetSet)}</Button>} />}>
    {pace && amount !== null && budget !== null && <div className="flex flex-col gap-2 p-4">
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-semibold tracking-tight tabular-nums">{formatUsd(i18n, amount)}</span>
        <span className="type-caption tabular-nums">{i18n.formatMessage(msg.budgetOf, { budget: formatUsd(i18n, budget) })}</span>
      </div>
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted" role="meter" aria-valuemin={0} aria-valuemax={budget} aria-valuenow={amount}
        aria-label={i18n.text(msg.budget)}>
        <span className={cn("absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 ease-out",
          pace.ratio >= 1 ? "bg-destructive" : pace.projected > budget ? "bg-warning" : "bg-primary")} style={{ width: `${Math.min(100, pace.ratio * 100)}%` }} />
        {/* Elapsed share of the month: spending left of this mark is on pace. */}
        <span aria-hidden="true" className="absolute inset-y-0 w-px bg-foreground/50" style={{ left: `${pace.elapsedRatio * 100}%` }} />
      </div>
      <span className={cn("type-caption tabular-nums", pace.projected > budget && "text-warning")}>{i18n.formatMessage(msg.budgetProjected, { amount: formatUsd(i18n, pace.projected) })}</span>
    </div>}
  </Panel>;
}

/** Live provider balances with runway from the last seven days of estimated spending per provider.
 * Spending ignores page filters because a balance belongs to the whole provider account. */
function BalancesPanel({ offset, now, revision }: { offset: number; now: number; revision: number }) {
  const i18n = useI18n();
  const { snapshot } = useConfiguration(true);
  const providers = useMemo(() => (snapshot?.modelProviders ?? []).filter(provider => provider.enabled && provider.usage), [snapshot?.modelProviders]);
  const usage = useProviderUsages(useMemo(() => providers.map(provider => provider.id), [providers]), true);
  const week = useMemo(() => ({ from: now - 7 * 86_400_000, to: null, utcOffsetMinutes: offset }), [now, offset]);
  const spend = useTelemetry(week, { kind: "breakdown", dimension: "provider", limit: 100, latency: false }, revision, providers.length > 0);
  const daily = new Map(spend.data?.rows.map(row => [row.group.dimension === "provider" ? row.group.providerId : "", row.metrics.costUsd / 7]) ?? []);
  return <Panel title={i18n.text(msg.balances)} icon={<Wallet />}
    actions={providers.length > 0 && <IconButton size="icon-xs" label={i18n.text(msg.refresh)} disabled={usage.refreshing} onClick={usage.refresh}>
      <RotateCw className={cn(usage.refreshing && "motion-safe:animate-spin")} /></IconButton>}
    empty={providers.length === 0 && <PanelState label={i18n.text(msg.balancesEmpty)} />}>
    <ul className="flex flex-col divide-y">
      {providers.map(provider => {
        const current = usage.states.get(provider.id);
        const perDay = daily.get(provider.id) ?? 0;
        return <li key={provider.id} className="flex flex-col gap-2 px-4 py-3">
          <div className="flex items-center gap-2 text-sm">
            <SignalDot level={current ? usageLevel(current.items) : null} />
            <span className="min-w-0 flex-1 truncate font-medium">{provider.name}</span>
            {perDay > 0 && <span className="type-caption tabular-nums">{i18n.formatMessage(msg.dailySpend, { amount: formatUsd(i18n, perDay) })}</span>}
          </div>
          {current?.items.map(item => {
            const usd = item.type === "balance" && (item.unit.type === "currency" ? item.unit.code.toUpperCase() === "USD" : item.unit.type === "symbol" && item.unit.symbol === "$");
            const runway = usd && perDay > 0 && item.type === "balance" && item.remaining > 0 ? Math.floor(item.remaining / perDay) : null;
            return <div key={item.id} className="flex flex-col gap-1">
              <div className="flex items-baseline gap-2 text-sm">
                <span className="type-caption min-w-0 flex-1 truncate">{usageItemLabel(i18n, item)}</span>
                <span className="tabular-nums">{item.type === "balance" ? formatUsageAmount(i18n, item.remaining, item.unit, { compact: false }) : formatPercent(i18n, quotaRemaining(item), 0)}</span>
              </div>
              {item.type === "quota" && <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                <div className={cn("h-full rounded-full", usageLevelTones[usageItemLevel(item)].bar)} style={{ width: `${Math.round(quotaRemaining(item) * 100)}%` }} />
              </div>}
              {runway !== null && <span className="type-caption tabular-nums">{i18n.formatMessage(msg.runway, { days: Math.min(9_999, runway) })}</span>}
            </div>;
          })}
        </li>;
      })}
    </ul>
  </Panel>;
}

