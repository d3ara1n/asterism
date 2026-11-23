import { useState } from "react";
import { ArrowUpRight, Filter } from "lucide-react";
import { Badge } from "@asterism-app/ui/ui/badge";
import { Button } from "@asterism-app/ui/ui/button";
import { IconButton } from "@asterism-app/ui/ui/icon-button";
import { ToggleGroup, ToggleGroupItem } from "@asterism-app/ui/ui/toggle-group";
import type { TelemetryDimension, TelemetryEvent, TelemetryFilter, TelemetryGroup } from "../../../shared/telemetry";
import { useI18n } from "../../shared/i18n";
import { IslandPanel } from "../../shared/weave/IslandPanel";
import { useIsland } from "../../shared/weave/Screen";
import { dashboardMessages as msg } from "../../messages/dashboard";
import { formatDuration, formatInteger, formatPercent, formatTokens, formatUsd, groupDetail, groupLabel } from "./format";
import { cacheHitRate, outputSpeed } from "./metrics";
import { groupFilter, groupId, useDashboard, usePageFilter, type DashboardModel, type FilterDimensions } from "./model";
import { Panel, PanelState } from "./Panel";
import { RankedList, Stat } from "./parts";
import { TrendChart } from "./charts";
import { useTelemetry } from "./use-telemetry";
import { dimensionLabels } from "./views/dimensions";
import { skillDetailKey } from "./skills";
import { SkillDetail } from "./SkillDetail";

export const detailWidth = { min: 420, grow: 0.6, max: 560 };

/** What a detail island describes: one dimension value, one local day, or one skill as recorded from one source. */
export type DetailSubject = { kind: "group"; group: TelemetryGroup } | { kind: "day"; start: number } | { kind: "skill"; id: string; source: string | null };

export const detailPrefix = "usage:";
export function detailKey(subject: DetailSubject): string {
  return `${detailPrefix}${subject.kind === "day" ? `day:${subject.start}` : subject.kind === "skill" ? skillDetailKey(subject) : groupId(subject.group)}`;
}

/** Breakdowns that add information for each subject: a model's folders, a folder's sessions, and so on. */
const related: Record<TelemetryDimension | "day", readonly TelemetryDimension[]> = {
  model: ["folder", "purpose"], provider: ["model", "folder"], folder: ["session", "model"], session: ["model", "purpose"],
  purpose: ["model", "folder"], plugin: ["purpose", "model"], thinking: ["model", "purpose"], error: ["model"], day: ["session", "model"],
};

/**
 * Details of one subject under the current page filter. The island follows later filter and range changes through the shared model,
 * so it never shows a stale scope. Groups inside open nested details owned by this island.
 */
export function DetailIsland({ model, subject, onOpenSession }: { model: DashboardModel; subject: DetailSubject; onOpenSession: (id: string) => void }) {
  return subject.kind === "skill" ? <SkillDetail model={model} skill={subject} onOpenSession={onOpenSession} />
    : <GroupDetail model={model} subject={subject} onOpenSession={onOpenSession} />;
}

function GroupDetail({ model, subject, onOpenSession }: { model: DashboardModel; subject: Exclude<DetailSubject, { kind: "skill" }>; onOpenSession: (id: string) => void }) {
  const i18n = useI18n();
  const island = useIsland();
  const state = useDashboard(model);
  const page = usePageFilter(state);
  const narrowing: FilterDimensions | null = subject.kind === "group" ? groupFilter(subject.group) : {};
  const filter: TelemetryFilter = subject.kind === "day"
    ? { ...page.filter, from: subject.start, to: subject.start + 86_400_000 }
    : { ...page.filter, ...narrowing };
  const summary = useTelemetry(filter, { kind: "summary", compare: null }, state.revision);
  const series = useTelemetry(filter, { kind: "series", granularity: subject.kind === "day" ? "hour" : page.window.granularity, groupBy: null, limit: 1 }, state.revision);
  const dimension = subject.kind === "day" ? "day" : subject.group.dimension;
  const [primary, secondary] = related[dimension === "other" ? "day" : dimension] ?? [];
  const first = useTelemetry(filter, { kind: "breakdown", dimension: primary ?? "model", limit: 6, latency: false }, state.revision, !!primary);
  const second = useTelemetry(filter, { kind: "breakdown", dimension: secondary ?? "model", limit: 6, latency: false }, state.revision, !!secondary);
  const errors = useTelemetry(filter, { kind: "breakdown", dimension: "error", limit: 6, latency: false }, state.revision);

  const title = subject.kind === "day"
    ? i18n.formatDate(subject.start, { year: "numeric", month: "long", day: "numeric", weekday: "long" })
    : groupLabel(i18n, subject.group);
  const description = subject.kind === "group" ? groupDetail(subject.group) ?? undefined : undefined;
  const open = (group: TelemetryGroup, origin: HTMLElement) => {
    const next: DetailSubject = { kind: "group", group };
    void island.open({ key: detailKey(next), label: groupLabel(i18n, group), width: detailWidth, origin,
      render: () => <DetailIsland model={model} subject={next} onOpenSession={onOpenSession} /> });
  };
  const session = subject.kind === "group" && subject.group.dimension === "session" ? subject.group : null;
  const metrics = summary.data?.metrics;
  return <IslandPanel title={title} description={description} action={<>
    {narrowing && Object.keys(narrowing).length > 0 && <IconButton size="icon-sm" label={i18n.text(msg.applyFilter)} onClick={() => model.applyFilters(narrowing, subject.kind === "group" && subject.group.dimension === "session" ? { sessionId: title } : {})}><Filter /></IconButton>}
    {session && session.status !== "deleted" && <IconButton size="icon-sm" label={i18n.text(msg.openSession)} onClick={() => onOpenSession(session.sessionId)}><ArrowUpRight /></IconButton>}
  </>}>
    <div className="flex flex-col gap-4">
      <Panel embedded title={i18n.text(msg.detail)} state={summary}>
        {metrics && <div className="grid grid-cols-3 divide-x">
          <Stat label={i18n.text(msg.cost)} value={formatUsd(i18n, metrics.costUsd)} />
          <Stat label={i18n.text(msg.tokens)} value={formatTokens(metrics.totalTokens)} />
          <Stat label={i18n.text(msg.requests)} value={formatInteger(i18n, metrics.requests)}
            detail={metrics.failed ? i18n.formatMessage(msg.failedCount, { count: metrics.failed }) : undefined} />
          <Stat className="border-t" label={i18n.text(msg.cacheHit)} value={formatPercent(i18n, cacheHitRate(metrics))} />
          <Stat className="border-t" label={i18n.text(msg.ttft)} value={formatDuration(i18n, summary.data?.ttft.p50)}
            detail={summary.data?.ttft.p95 != null ? i18n.formatMessage(msg.p95, { value: formatDuration(i18n, summary.data.ttft.p95) }) : undefined} />
          <Stat className="border-t" label={i18n.text(msg.speed)} value={outputSpeed(metrics) === null ? "—" : i18n.formatMessage(msg.perSecond, { value: Math.round(outputSpeed(metrics)!) })} />
        </div>}
      </Panel>
      <Panel embedded title={i18n.text(msg.trend)} state={series} empty={metrics?.requests === 0 && <PanelState label={i18n.text(msg.noData)} />}>
        {series.data && <TrendChart series={series.data} measure="costUsd" className="h-44" />}
      </Panel>
      {primary && <Panel embedded title={i18n.text(dimensionLabels[primary])} state={first} empty={first.data?.rows.length === 0 && <PanelState label={i18n.text(msg.noData)} />}>
        {first.data && <RankedList rows={first.data.rows} measure="costUsd" onOpen={(row, origin) => open(row.group, origin)} />}
      </Panel>}
      {secondary && <Panel embedded title={i18n.text(dimensionLabels[secondary])} state={second} empty={second.data?.rows.length === 0 && <PanelState label={i18n.text(msg.noData)} />}>
        {second.data && <RankedList rows={second.data.rows} measure="costUsd" onOpen={(row, origin) => open(row.group, origin)} />}
      </Panel>}
      {errors.data && errors.data.rows.length > 0 && <Panel embedded title={i18n.text(msg.errors)} state={errors}>
        <ul className="flex flex-col divide-y">{errors.data.rows.map(row => <li key={row.group.key} className="flex items-center gap-3 px-4 py-2 text-sm">
          <span className="min-w-0 flex-1 truncate font-mono text-xs">{groupLabel(i18n, row.group)}</span>
          {groupDetail(row.group) && <span className="type-caption">{groupDetail(row.group)}</span>}
          <span className="tabular-nums">{formatInteger(i18n, row.metrics.requests)}</span>
        </li>)}</ul>
      </Panel>}
      <EventLog filter={filter} revision={state.revision} />
    </div>
  </IslandPanel>;
}

const pageSize = 50;
function EventLog({ filter, revision }: { filter: TelemetryFilter; revision: number }) {
  const i18n = useI18n();
  const [only, setOnly] = useState<"all" | "failed" | "tiered">("all");
  const [limit, setLimit] = useState(pageSize);
  const events = useTelemetry(filter, { kind: "events", offset: 0, limit, only }, revision);
  const data = events.data;
  return <Panel embedded title={data ? `${i18n.text(msg.detailRequests)} · ${i18n.formatNumber(data.total)}` : i18n.text(msg.detailRequests)} state={events}
    actions={<ToggleGroup type="single" variant="segmented" value={only} aria-label={i18n.text(msg.detailRequests)}
      onValueChange={value => { if (value) { setOnly(value as typeof only); setLimit(pageSize); } }}>
      <ToggleGroupItem value="all">{i18n.text(msg.eventsAll)}</ToggleGroupItem>
      <ToggleGroupItem value="failed">{i18n.text(msg.eventsFailed)}</ToggleGroupItem>
      <ToggleGroupItem value="tiered">{i18n.text(msg.eventsTiered)}</ToggleGroupItem>
    </ToggleGroup>}
    empty={data?.rows.length === 0 && <PanelState label={i18n.text(msg.eventsEmpty)} />}>
    {data && <>
      <ul className="flex flex-col divide-y">{data.rows.map(event => <EventRow key={event.id} event={event} />)}</ul>
      {data.rows.length < data.total && <div className="flex justify-center border-t p-2">
        <Button variant="ghost" size="sm" disabled={events.pending} onClick={() => setLimit(value => Math.min(200, value + pageSize))}>{i18n.text(msg.loadMore)}</Button>
      </div>}
    </>}
  </Panel>;
}

function EventRow({ event }: { event: TelemetryEvent }) {
  const i18n = useI18n();
  return <li className="flex flex-col gap-1 px-4 py-2.5 text-sm">
    <div className="flex min-w-0 items-center gap-2">
      <span className="min-w-0 truncate font-medium">{event.modelId}</span>
      <span className="type-caption min-w-0 shrink-[2] truncate">{groupLabel(i18n, event.purpose)}</span>
      {event.tierFromInputTokens !== null && <Badge variant="secondary" className="font-normal">{i18n.formatMessage(msg.tier, { tokens: formatTokens(event.tierFromInputTokens) })}</Badge>}
      {event.outcome === "failed" && <Badge variant="destructive" className="font-normal">{event.errorCode ?? i18n.text(msg.failed)}</Badge>}
      {event.outcome === "cancelled" && <Badge variant="secondary" className="font-normal">{i18n.text(msg.cancelled)}</Badge>}
      <span className="ml-auto shrink-0 tabular-nums">{formatUsd(i18n, event.costUsd)}</span>
    </div>
    <div className="type-caption flex min-w-0 flex-wrap gap-x-3 tabular-nums">
      <span>{i18n.formatDate(event.startedAt, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
      <span>{i18n.formatMessage(msg.inOut, { input: formatTokens(event.inputTokens), output: formatTokens(event.outputTokens) })}</span>
      {event.durationMs !== null && <span>{formatDuration(i18n, event.durationMs)}</span>}
      {event.toolCalls > 0 && <span>{i18n.formatMessage(msg.toolCallCount, { count: event.toolCalls })}</span>}
      {event.session && <span className="min-w-0 truncate">{groupLabel(i18n, event.session)}</span>}
    </div>
  </li>;
}
