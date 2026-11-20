import { useEffect, useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowUpRight, Filter } from "lucide-react";
import { Badge } from "@asterism-app/ui/ui/badge";
import { IconButton } from "@asterism-app/ui/ui/icon-button";
import { Spinner } from "@asterism-app/ui/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@asterism-app/ui/ui/toggle-group";
import { IslandPanel } from "../../shared/weave/IslandPanel";
import { runtime } from "../../runtime";
import { useI18n } from "../../shared/i18n";
import { dashboardMessages as msg } from "../../messages/dashboard";
import type {
  DrilldownBreakdownItem,
  TelemetryDrilldownReply,
  TelemetryDrilldownTarget,
  TelemetryFilter,
} from "../../../shared/telemetry";
import { formatDuration, formatInteger, formatPercent, formatTokens, formatUsd } from "./format";
import { ChartTooltipBox, FolderDotInline } from "./charts";

export function DrilldownIsland({
  target,
  filter,
  onApplyFilter,
  onOpenSession,
}: {
  target: TelemetryDrilldownTarget;
  filter: TelemetryFilter;
  onApplyFilter?: (target: TelemetryDrilldownTarget) => void;
  onOpenSession: (sessionId: string) => void;
}) {
  const i18n = useI18n();
  const [data, setData] = useState<TelemetryDrilldownReply | null>(null);
  const [loading, setLoading] = useState(true);
  const [eventFilter, setEventFilter] = useState<"all" | "failed" | "tiered">("all");

  useEffect(() => {
    let active = true;
    setLoading(true);
    void runtime.telemetry.execute({
      type: "drilldown",
      filter,
      target,
      eventLimit: 100,
      eventOffset: 0,
      eventFilter,
    }).then(res => {
      if (!active) return;
      if (res.ok && res.reply.kind === "drilldown") setData(res.reply);
      setLoading(false);
    });
    return () => { active = false; };
  }, [target, filter, eventFilter]);

  const kindLabel = target.kind === "day" ? i18n.text(msg.drilldownDay)
    : target.kind === "folder" ? i18n.text(msg.drilldownFolder)
    : target.kind === "model" ? i18n.text(msg.drilldownModel)
    : target.kind === "session" ? i18n.text(msg.drilldownSession)
    : target.kind === "purpose" ? i18n.text(msg.drilldownPurpose)
    : i18n.text(msg.drilldownPlugin);

  const displayTitle = data
    ? (data.title || (target.kind === "folder" ? i18n.text(msg.ungrouped) : kindLabel))
    : kindLabel;

  const canFilter = target.kind === "folder" || target.kind === "model" || target.kind === "plugin" || target.kind === "purpose";
  const canOpenSession = target.kind === "session" && (data?.sessionStatus === "active" || data?.sessionStatus === "sleeping");

  const breakdownTitle = (kind: "models" | "folders" | "sessions" | "purposes" | "days") =>
    kind === "models" ? i18n.text(msg.breakdownModels)
    : kind === "folders" ? i18n.text(msg.breakdownFolders)
    : kind === "sessions" ? i18n.text(msg.breakdownSessions)
    : kind === "purposes" ? i18n.text(msg.breakdownPurposes)
    : i18n.text(msg.breakdownDays);

  const actions = (
    <>
      {canFilter && onApplyFilter && (
        <IconButton size="icon-xs" label={i18n.text(msg.applyAsFilter)} onClick={() => onApplyFilter(target)}>
          <Filter className="size-3.5" />
        </IconButton>
      )}
      {canOpenSession && target.kind === "session" && (
        <IconButton size="icon-xs" label={i18n.text(msg.openSession)} onClick={() => onOpenSession(target.sessionId)}>
          <ArrowUpRight className="size-3.5" />
        </IconButton>
      )}
    </>
  );

  return (
    <IslandPanel title={displayTitle} action={actions}>
      {loading && !data ? (
        <div className="flex h-48 items-center justify-center"><Spinner /></div>
      ) : !data ? (
        <div className="py-12 text-center text-xs text-muted-foreground">{i18n.text(msg.loadFailed)}</div>
      ) : (
        <div className="flex flex-col gap-5">
          {/* Header subtitle */}
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {data.color && <FolderDotInline color={data.color} />}
            <span>{kindLabel}</span>
            {data.subtitle && <span>· {data.subtitle}</span>}
            {data.sessionStatus === "deleted" && <Badge variant="secondary" className="text-[10px]">{i18n.text(msg.deletedMark)}</Badge>}
          </div>

          {/* Micro KPI Grid */}
          <div className="grid grid-cols-3 gap-2">
            <MicroStat label={i18n.text(msg.colCost)} value={formatUsd(data.summary.costUsd)} />
            <MicroStat label={i18n.text(msg.colTokens)} value={formatTokens(data.summary.totalTokens)} />
            <MicroStat label={i18n.text(msg.colRequests)} value={formatInteger(data.summary.requests)} />
            <MicroStat label={i18n.text(msg.colCacheHit)} value={formatPercent(data.summary.cacheHitRate)} />
            <MicroStat label={i18n.text(msg.kpiLatency)} value={formatDuration(data.summary.p50TtftMs)} />
            <MicroStat
              label={i18n.text(msg.colSpeed)}
              value={data.summary.avgTokensPerSec !== null ? `${Math.round(data.summary.avgTokensPerSec)}/s` : "—"}
            />
          </div>

          {/* Model 24h TTFT Latency Profile */}
          {data.hourlyLatency && data.hourlyLatency.some(h => h.p50TtftMs !== null) && (
            <div className="flex flex-col gap-1.5">
              <h3 className="type-label text-muted-foreground">{i18n.text(msg.hourlyLatencyTitle)}</h3>
              <div className="h-[110px] w-full rounded-lg border border-border/60 bg-background/40 p-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.hourlyLatency} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
                    <XAxis dataKey="hour" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} interval={5} tickFormatter={v => `${String(v).padStart(2, "0")}`} />
                    <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} tickFormatter={v => formatDuration(Number(v))} />
                    <Tooltip
                      cursor={{ fill: "var(--accent)", fillOpacity: 0.35 }}
                      content={({ active, payload }) => {
                        const item = payload?.[0]?.payload as { hour: number; p50TtftMs: number | null; requests: number } | undefined;
                        if (!active || !item) return null;
                        return (
                          <ChartTooltipBox
                            title={`${String(item.hour).padStart(2, "0")}:00`}
                            rows={[
                              { label: i18n.text(msg.kpiLatency), value: formatDuration(item.p50TtftMs), color: "var(--chart-1)" },
                              { label: i18n.text(msg.colRequests), value: formatInteger(item.requests) },
                            ]}
                          />
                        );
                      }}
                    />
                    <Bar dataKey="p50TtftMs" fill="var(--chart-1)" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Error Breakdown */}
          {data.errorBreakdown.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <h3 className="type-label text-muted-foreground">{i18n.text(msg.errorsTitle)}</h3>
              <div className="flex flex-wrap gap-1.5">
                {data.errorBreakdown.map(err => (
                  <Badge key={`${err.origin ?? ""}::${err.code}`} variant="destructive" className="font-mono text-[10px]">
                    {err.code} × {err.count}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Complementary Breakdowns */}
          {data.primaryBreakdown.items.length > 0 && (
            <BreakdownList title={breakdownTitle(data.primaryBreakdown.kind)} items={data.primaryBreakdown.items} ungroupedLabel={i18n.text(msg.ungrouped)} />
          )}
          {data.secondaryBreakdown.items.length > 0 && (
            <BreakdownList title={breakdownTitle(data.secondaryBreakdown.kind)} items={data.secondaryBreakdown.items} ungroupedLabel={i18n.text(msg.ungrouped)} />
          )}

          {/* Raw Request Log */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="type-label text-muted-foreground">
                {i18n.text(msg.eventsTitle)} ({formatInteger(data.totalEvents)})
              </h3>
              <ToggleGroup type="single" size="sm" variant="outline" value={eventFilter} onValueChange={v => { if (v) setEventFilter(v as typeof eventFilter); }}>
                <ToggleGroupItem value="all" className="h-6 px-2 text-[11px]">{i18n.text(msg.eventsAll)}</ToggleGroupItem>
                <ToggleGroupItem value="failed" className="h-6 px-2 text-[11px]">{i18n.text(msg.eventsFailed)}</ToggleGroupItem>
                <ToggleGroupItem value="tiered" className="h-6 px-2 text-[11px]">{i18n.text(msg.eventsTiered)}</ToggleGroupItem>
              </ToggleGroup>
            </div>
            <div className="flex flex-col divide-y divide-border/50 rounded-lg border border-border/60">
              {data.events.map(ev => (
                <div key={ev.id} className="flex flex-col gap-1 px-3 py-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate font-medium text-foreground">{ev.modelId}</span>
                      <Badge variant="secondary" className="shrink-0 text-[10px]">
                        {ev.purposeLabel ? i18n.text(ev.purposeLabel) : ev.purposeFallback}
                      </Badge>
                      {ev.tierFromInputTokens !== null && (
                        <Badge variant="warning" className="shrink-0 text-[10px]">
                          {i18n.formatMessage(msg.tierBadge, { tokens: formatTokens(ev.tierFromInputTokens) })}
                        </Badge>
                      )}
                    </span>
                    <span className="shrink-0 font-medium tabular-nums text-foreground">{formatUsd(ev.costUsd)}</span>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] tabular-nums text-muted-foreground">
                    <span>
                      {new Date(ev.startedAt).toLocaleString(i18n.locale, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      {" · "}
                      {formatTokens(ev.inputTokens)} in / {formatTokens(ev.outputTokens)} out
                      {ev.cacheReadTokens ? ` · ${formatTokens(ev.cacheReadTokens)} cache` : ""}
                    </span>
                    <span className="flex items-center gap-1.5">
                      {ev.durationMs !== null && <span>{formatDuration(ev.durationMs)}</span>}
                      {ev.outcome === "failed" && <Badge variant="destructive" className="text-[10px]">{ev.errorCode ?? i18n.text(msg.statusFailed)}</Badge>}
                      {ev.outcome === "cancelled" && <Badge variant="secondary" className="text-[10px]">{i18n.text(msg.statusCancelled)}</Badge>}
                    </span>
                  </div>
                </div>
              ))}
              {data.events.length === 0 && (
                <div className="py-6 text-center text-xs text-muted-foreground">—</div>
              )}
            </div>
          </div>
        </div>
      )}
    </IslandPanel>
  );
}

function MicroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/40 px-2.5 py-2">
      <div className="truncate text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate text-sm font-semibold tabular-nums text-foreground">{value}</div>
    </div>
  );
}

function BreakdownList({
  title,
  items,
  ungroupedLabel,
}: {
  title: string;
  items: readonly DrilldownBreakdownItem[];
  ungroupedLabel: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="type-label text-muted-foreground">{title}</h3>
      <div className="flex flex-col divide-y divide-border/50 rounded-lg border border-border/60 px-2.5">
        {items.map(item => (
          <div key={item.key} className="flex items-center justify-between gap-2 py-1.5 text-xs">
            <span className="flex min-w-0 items-center gap-1.5">
              {item.color && <FolderDotInline color={item.color} />}
              <span className="truncate text-foreground">{item.label || ungroupedLabel}</span>
            </span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {formatTokens(item.totalTokens)} · <span className="font-medium text-foreground">{formatUsd(item.costUsd)}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
