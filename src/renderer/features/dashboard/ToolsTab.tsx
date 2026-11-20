import { useMemo, useState } from "react";
import { Badge } from "@asterism-app/ui/ui/badge";
import { SearchInput } from "@asterism-app/ui/ui/search-input";
import { useI18n } from "../../shared/i18n";
import { dashboardMessages as msg } from "../../messages/dashboard";
import type { TelemetryDrilldownTarget, TelemetryToolsReply } from "../../../shared/telemetry";
import { chartColor, formatDuration, formatInteger, formatPercent, formatTokens, formatUsd } from "./format";
import { SectionCard } from "./charts";

export function ToolsTab({
  data,
  onDrilldown,
}: {
  data: TelemetryToolsReply;
  onDrilldown: (target: TelemetryDrilldownTarget) => void;
}) {
  const i18n = useI18n();
  const [search, setSearch] = useState("");

  const filteredTools = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data.tools;
    return data.tools.filter(t =>
      t.toolName.toLowerCase().includes(q)
      || (t.targetResourceKind ?? "").toLowerCase().includes(q)
      || (t.implementationId ?? "").toLowerCase().includes(q),
    );
  }, [data.tools, search]);

  const maxResCalls = Math.max(1, ...data.resourceKinds.map(r => r.calls));

  return (
    <div className="flex flex-col gap-4">
      {/* Plugins & Purposes */}
      <SectionCard title={i18n.text(msg.pluginsTitle)}>
        {data.plugins.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted-foreground">—</div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {data.plugins.map((plugin, pIdx) => (
              <div key={plugin.pluginId} className="rounded-lg border border-border/70 bg-background/40 p-3">
                <button
                  type="button"
                  onClick={() => onDrilldown({ kind: "plugin", pluginId: plugin.pluginId })}
                  className="flex w-full items-center justify-between gap-2 text-left hover:opacity-80"
                >
                  <div className="min-w-0">
                    <div className="truncate text-xs font-medium text-foreground">
                      {plugin.name ? i18n.text(plugin.name) : plugin.pluginId}
                    </div>
                    <div className="truncate text-[11px] text-muted-foreground">{plugin.pluginId}</div>
                  </div>
                  <div className="shrink-0 text-right text-xs tabular-nums">
                    <div className="font-medium text-foreground">{formatUsd(plugin.costUsd)}</div>
                    <div className="text-[11px] text-muted-foreground">{formatTokens(plugin.totalTokens)} · {formatInteger(plugin.requests)}</div>
                  </div>
                </button>
                <div className="mt-2.5 flex flex-col gap-1 border-t border-border/50 pt-2">
                  {plugin.purposes.map((purpose, idx) => (
                    <button
                      key={`${purpose.pluginId}::${purpose.purposeId}`}
                      type="button"
                      onClick={() => onDrilldown({ kind: "purpose", pluginId: purpose.pluginId, purposeId: purpose.purposeId })}
                      className="flex items-center justify-between gap-2 rounded-md px-1.5 py-1 text-left text-xs transition-colors hover:bg-accent"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: chartColor(pIdx * 3 + idx) }} />
                        <span className="truncate text-foreground">{purpose.label ? i18n.text(purpose.label) : purpose.fallbackLabel}</span>
                      </span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {formatInteger(purpose.requests)} req · {formatTokens(purpose.totalTokens)} · <span className="font-medium text-foreground">{formatUsd(purpose.costUsd)}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Tool Calls Reliability Table */}
      <SectionCard
        title={i18n.text(msg.toolsTitle)}
        actions={
          <div className="w-52"><SearchInput value={search} onChange={setSearch} label={i18n.text(msg.searchTools)} /></div>
        }
      >
        {data.tools.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">{i18n.text(msg.toolsEmpty)}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">{i18n.text(msg.colTool)}</th>
                  <th className="px-2 py-2 text-right font-medium">{i18n.text(msg.colCalls)}</th>
                  <th className="px-2 py-2 text-right font-medium">{i18n.text(msg.colSuccess)}</th>
                  <th className="px-2 py-2 text-right font-medium">{i18n.text(msg.colDuration)}</th>
                  <th className="py-2 pl-2 text-right font-medium">{i18n.text(msg.colTotalTime)}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {filteredTools.slice(0, 80).map((t, i) => (
                  <tr key={`${t.toolName}::${t.implementationId ?? ""}::${i}`} className="transition-colors hover:bg-accent/40">
                    <td className="py-2 pr-3">
                      <div className="font-mono text-xs font-medium text-foreground">{t.toolName}</div>
                      {t.targetResourceKind && (
                        <div className="truncate text-[11px] text-muted-foreground">{t.targetResourceKind}</div>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-foreground">{formatInteger(t.calls)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {t.successRate === null ? "—" : (
                        <Badge variant={t.successRate >= 0.95 ? "success" : t.successRate >= 0.8 ? "warning" : "destructive"} className="text-[10px]">
                          {formatPercent(t.successRate, 0)}
                        </Badge>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                      <span className="text-foreground">{formatDuration(t.p50DurationMs)}</span> / {formatDuration(t.p95DurationMs)}
                    </td>
                    <td className="py-2 pl-2 text-right tabular-nums text-muted-foreground">{formatDuration(t.totalDurationMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* Resource Kinds + External Metered Usage */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title={i18n.text(msg.resourcesTitle)}>
          {data.resourceKinds.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">—</div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {data.resourceKinds.map((r, idx) => (
                <div key={r.kind} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate font-mono text-foreground">{r.kind}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {formatInteger(r.calls)} · {formatDuration(r.totalDurationMs)}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.max(4, Math.round((r.calls / maxResCalls) * 100))}%`, backgroundColor: chartColor(idx) }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title={i18n.text(msg.externalTitle)}>
          {data.externalUsage.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">{i18n.text(msg.externalEmpty)}</div>
          ) : (
            <div className="flex flex-col divide-y divide-border/50">
              {data.externalUsage.map((ext, i) => (
                <div key={`${ext.pluginId}::${ext.category}::${ext.provider ?? ""}::${i}`} className="flex items-center justify-between gap-2 py-2 text-xs">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-foreground">{ext.category}{ext.provider ? ` · ${ext.provider}` : ""}</div>
                    <div className="truncate text-[11px] text-muted-foreground">{ext.pluginId}</div>
                  </div>
                  <div className="shrink-0 text-right tabular-nums">
                    <div className="font-medium text-foreground">
                      {ext.totalAmount !== null && ext.currency
                        ? (ext.currency.toUpperCase() === "USD" ? formatUsd(ext.totalAmount) : `${ext.totalAmount.toFixed(4)} ${ext.currency}`)
                        : `${formatInteger(ext.count)} req`}
                    </div>
                    <div className="text-[11px] text-muted-foreground">{formatInteger(ext.count)} calls</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
