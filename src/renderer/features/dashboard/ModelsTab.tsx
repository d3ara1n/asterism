import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@asterism-app/ui/ui/badge";
import { useI18n } from "../../shared/i18n";
import { dashboardMessages as msg } from "../../messages/dashboard";
import type { TelemetryDrilldownTarget, TelemetryModelsReply } from "../../../shared/telemetry";
import {
  chartColor,
  formatDuration,
  formatInteger,
  formatPercent,
  formatTokens,
  formatUsd,
} from "./format";
import { ChartTooltipBox, SectionCard } from "./charts";

export function ModelsTab({
  data,
  onDrilldown,
}: {
  data: TelemetryModelsReply;
  onDrilldown: (target: TelemetryDrilldownTarget) => void;
}) {
  const i18n = useI18n();

  const shareSeries = useMemo(() => data.shareModels.map((m, idx) => ({
    key: `s_${idx}`,
    rawKey: m.key,
    label: m.key === "__other__" ? i18n.text(msg.other) : m.label,
    color: chartColor(idx),
  })), [data.shareModels, i18n]);

  const shareChartData = useMemo(() => data.shareTrend.map(point => {
    const row: Record<string, string | number> = { bucket: point.bucket.length > 10 ? point.bucket.slice(5) : point.bucket };
    data.shareModels.forEach((m, idx) => {
      row[`s_${idx}`] = Number((point.shares[m.key] ?? 0).toFixed(1));
    });
    return row;
  }), [data.shareTrend, data.shareModels]);

  const thinkingChartData = useMemo(() => data.thinkingLevels.map(t => ({
    ...t,
    label: t.level === "default" ? i18n.text(msg.thinkingDefault) : t.level,
  })), [data.thinkingLevels, i18n]);

  const maxSpeed = Math.max(1, ...data.models.map(m => m.avgTokensPerSec ?? 0));

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        {/* 100% Stacked Model Share Over Time */}
        <SectionCard className="xl:col-span-3" title={i18n.text(msg.modelShareTitle)}>
          {shareChartData.length === 0 ? (
            <div className="flex h-[220px] items-center justify-center text-xs text-muted-foreground">—</div>
          ) : (
            <>
              <div className="h-[220px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={shareChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" strokeOpacity={0.6} />
                    <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} minTickGap={24} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={40} tickFormatter={v => `${v}%`} />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        return (
                          <ChartTooltipBox
                            title={label}
                            rows={payload.filter(p => Number(p.value) > 0).map(p => ({
                              label: String(p.name ?? ""),
                              value: `${Number(p.value ?? 0).toFixed(1)}%`,
                              color: String(p.color ?? ""),
                            }))}
                          />
                        );
                      }}
                    />
                    {shareSeries.map(s => (
                      <Area
                        key={s.key}
                        type="monotone"
                        dataKey={s.key}
                        name={s.label}
                        stackId="share"
                        stroke={s.color}
                        fill={s.color}
                        fillOpacity={0.75}
                        strokeWidth={1}
                      />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {shareSeries.map(s => (
                  <span key={s.key} className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full" style={{ backgroundColor: s.color }} />
                    <span className="max-w-[140px] truncate">{s.label}</span>
                  </span>
                ))}
              </div>
            </>
          )}
        </SectionCard>

        {/* Thinking Levels Breakdown */}
        <SectionCard className="xl:col-span-2" title={i18n.text(msg.thinkingTitle)}>
          {thinkingChartData.length === 0 ? (
            <div className="flex h-[220px] items-center justify-center text-xs text-muted-foreground">—</div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="h-[160px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={thinkingChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" strokeOpacity={0.6} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={44} tickFormatter={v => formatUsd(Number(v), true)} />
                    <Tooltip
                      cursor={{ fill: "var(--accent)", fillOpacity: 0.35 }}
                      content={({ active, payload }) => {
                        const item = payload?.[0]?.payload as typeof thinkingChartData[number] | undefined;
                        if (!active || !item) return null;
                        return (
                          <ChartTooltipBox
                            title={item.label}
                            rows={[
                              { label: i18n.text(msg.metricCost), value: formatUsd(item.costUsd), color: "var(--chart-6)" },
                              { label: i18n.text(msg.metricRequests), value: formatInteger(item.requests) },
                              { label: i18n.text(msg.tokReasoning), value: formatTokens(item.reasoningTokens) },
                            ]}
                          />
                        );
                      }}
                    />
                    <Bar dataKey="costUsd" fill="var(--chart-6)" radius={[4, 4, 0, 0]} maxBarSize={32} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {thinkingChartData.map(t => (
                  <span key={t.level} className="rounded-md bg-muted px-2 py-1 text-[11px] tabular-nums text-muted-foreground">
                    <span className="font-medium text-foreground">{t.label}</span>
                    {" · "}
                    {formatInteger(t.requests)} req
                    {t.avgReasoningTokens !== null && t.avgReasoningTokens > 0 ? ` · ~${formatTokens(t.avgReasoningTokens)} rsn` : ""}
                  </span>
                ))}
              </div>
            </div>
          )}
        </SectionCard>
      </div>

      {/* Provider x Model Performance Matrix */}
      <SectionCard title={i18n.text(msg.modelMatrixTitle)}>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-2 pr-3 font-medium">{i18n.text(msg.colModel)}</th>
                <th className="px-2 py-2 text-right font-medium">{i18n.text(msg.colRequests)}</th>
                <th className="px-2 py-2 text-right font-medium">{i18n.text(msg.colTokens)}</th>
                <th className="px-2 py-2 text-right font-medium">{i18n.text(msg.colCost)}</th>
                <th className="px-2 py-2 text-right font-medium">{i18n.text(msg.colEffectivePrice)}</th>
                <th className="px-2 py-2 text-right font-medium">{i18n.text(msg.colTtft)}</th>
                <th className="px-2 py-2 font-medium">{i18n.text(msg.colSpeed)}</th>
                <th className="px-2 py-2 text-right font-medium">{i18n.text(msg.colCacheHit)}</th>
                <th className="py-2 pl-2 text-right font-medium">{i18n.text(msg.colSuccess)}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {data.models.map((m, idx) => {
                const speedPct = m.avgTokensPerSec ? Math.max(6, Math.round((m.avgTokensPerSec / maxSpeed) * 100)) : 0;
                const sr = m.successRate;
                return (
                  <tr
                    key={`${m.providerId}::${m.modelId}`}
                    onClick={() => onDrilldown({ kind: "model", providerId: m.providerId, modelId: m.modelId })}
                    className="cursor-pointer transition-colors hover:bg-accent/50"
                  >
                    <td className="py-2.5 pr-3">
                      <div className="flex items-center gap-2">
                        <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: chartColor(idx) }} />
                        <div className="min-w-0">
                          <div className="max-w-[200px] truncate font-medium text-foreground">{m.modelId}</div>
                          <div className="max-w-[200px] truncate text-[11px] text-muted-foreground">{m.providerName}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-muted-foreground">{formatInteger(m.requests)}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-foreground">{formatTokens(m.totalTokens)}</td>
                    <td className="px-2 py-2.5 text-right font-medium tabular-nums text-foreground">{formatUsd(m.costUsd)}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-muted-foreground">
                      {m.effectiveUsdPerMillion !== null ? formatUsd(m.effectiveUsdPerMillion) : "—"}
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-muted-foreground">
                      <span className="text-foreground">{formatDuration(m.p50TtftMs)}</span>
                      {" / "}
                      <span>{formatDuration(m.p95TtftMs)}</span>
                    </td>
                    <td className="min-w-[110px] px-2 py-2.5">
                      {m.avgTokensPerSec !== null ? (
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full" style={{ width: `${speedPct}%`, backgroundColor: "var(--chart-2)" }} />
                          </div>
                          <span className="w-12 text-right tabular-nums text-foreground">{Math.round(m.avgTokensPerSec)}/s</span>
                        </div>
                      ) : "—"}
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-muted-foreground">{formatPercent(m.cacheHitRate)}</td>
                    <td className="py-2.5 pl-2 text-right tabular-nums">
                      {sr === null ? "—" : (
                        <Badge variant={sr >= 0.97 ? "success" : sr >= 0.9 ? "warning" : "destructive"} className="text-[10px]">
                          {formatPercent(sr, 0)}
                        </Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
              {data.models.length === 0 && (
                <tr><td colSpan={9} className="py-8 text-center text-muted-foreground">—</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
