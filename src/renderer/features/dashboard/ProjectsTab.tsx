import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpRight } from "lucide-react";
import { Badge } from "@asterism-app/ui/ui/badge";
import { IconButton } from "@asterism-app/ui/ui/icon-button";
import { SearchInput } from "@asterism-app/ui/ui/search-input";
import { cn } from "@asterism-app/ui/utils";
import { useI18n } from "../../shared/i18n";
import { dashboardMessages as msg } from "../../messages/dashboard";
import type { TelemetryDrilldownTarget, TelemetryProjectsReply } from "../../../shared/telemetry";
import {
  folderCssColor,
  formatInteger,
  formatPercent,
  formatRelativeTime,
  formatTokens,
  formatUsd,
} from "./format";
import { ChartTooltipBox, FolderDotInline, SectionCard } from "./charts";

type SortKey = "costUsd" | "totalTokens" | "requests" | "maxInputTokens" | "lastActiveAt";

export function ProjectsTab({
  data,
  onDrilldown,
  onOpenSession,
}: {
  data: TelemetryProjectsReply;
  onDrilldown: (target: TelemetryDrilldownTarget) => void;
  onOpenSession: (sessionId: string) => void;
}) {
  const i18n = useI18n();
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("costUsd");
  const [sortAsc, setSortAsc] = useState(false);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(v => !v);
    else { setSortKey(key); setSortAsc(false); }
  };

  const totalFolderWeight = useMemo(
    () => Math.max(1, data.folders.reduce((s, f) => s + (f.costUsd > 0 ? f.costUsd : f.totalTokens), 0)),
    [data.folders],
  );

  const filteredSessions = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? data.sessions.filter(s => s.title.toLowerCase().includes(q) || (s.folderName ?? "").toLowerCase().includes(q) || (s.primaryModel ?? "").toLowerCase().includes(q))
      : data.sessions;
    return [...list].sort((a, b) => {
      const diff = a[sortKey] - b[sortKey];
      return sortAsc ? diff : -diff;
    });
  }, [data.sessions, search, sortKey, sortAsc]);

  const SortIndicator = ({ k }: { k: SortKey }) =>
    sortKey === k ? (sortAsc ? <ArrowUp className="inline size-3" /> : <ArrowDown className="inline size-3" />) : null;

  return (
    <div className="flex flex-col gap-4">
      {data.tieredSummary.requests > 0 && (
        <div className="flex items-center gap-2.5 rounded-xl border border-warning/30 bg-warning/10 px-4 py-2.5 text-xs text-foreground">
          <AlertTriangle className="size-4 shrink-0 text-warning" />
          <span>
            {i18n.formatMessage(msg.tieredNotice, {
              requests: formatInteger(data.tieredSummary.requests),
              sessions: formatInteger(data.tieredSummary.affectedSessions),
              cost: formatUsd(data.tieredSummary.costUsd),
            })}
          </span>
        </div>
      )}

      {/* Project Budget Distribution Bar + Table */}
      <SectionCard title={i18n.text(msg.projectsOverviewTitle)}>
        {data.folders.length > 0 && (
          <div className="mb-4">
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
              {data.folders.map(f => {
                const w = ((f.costUsd > 0 ? f.costUsd : f.totalTokens) / totalFolderWeight) * 100;
                if (w <= 0) return null;
                return (
                  <button
                    key={f.folderId ?? "__ungrouped__"}
                    type="button"
                    onClick={() => onDrilldown({ kind: "folder", folderId: f.folderId })}
                    className="h-full transition-opacity hover:opacity-80"
                    style={{ width: `${w}%`, backgroundColor: folderCssColor(f.color) }}
                    title={`${f.name ?? i18n.text(msg.ungrouped)}: ${formatUsd(f.costUsd)}`}
                  />
                );
              })}
            </div>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-2 pr-3 font-medium">{i18n.text(msg.colProject)}</th>
                <th className="px-2 py-2 text-right font-medium">{i18n.text(msg.colSessions)}</th>
                <th className="px-2 py-2 text-right font-medium">{i18n.text(msg.colRequests)}</th>
                <th className="px-2 py-2 text-right font-medium">{i18n.text(msg.colTokens)}</th>
                <th className="px-2 py-2 text-right font-medium">{i18n.text(msg.colCacheHit)}</th>
                <th className="px-2 py-2 text-right font-medium">{i18n.text(msg.colCost)}</th>
                <th className="px-2 py-2 font-medium">{i18n.text(msg.colTopModel)}</th>
                <th className="py-2 pl-2 text-right font-medium">{i18n.text(msg.colLastActive)}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {data.folders.map(f => (
                <tr
                  key={f.folderId ?? "__ungrouped__"}
                  onClick={() => onDrilldown({ kind: "folder", folderId: f.folderId })}
                  className="cursor-pointer transition-colors hover:bg-accent/50"
                >
                  <td className="py-2.5 pr-3">
                    <span className="flex items-center gap-2 font-medium text-foreground">
                      <FolderDotInline color={f.color} />
                      <span className="max-w-[200px] truncate">{f.name ?? i18n.text(msg.ungrouped)}</span>
                      {f.deleted && <Badge variant="secondary" className="text-[10px]">{i18n.text(msg.deletedMark)}</Badge>}
                    </span>
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-muted-foreground">{formatInteger(f.sessions)}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-muted-foreground">{formatInteger(f.requests)}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-foreground">{formatTokens(f.totalTokens)}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-muted-foreground">{formatPercent(f.cacheHitRate)}</td>
                  <td className="px-2 py-2.5 text-right font-medium tabular-nums text-foreground">{formatUsd(f.costUsd)}</td>
                  <td className="max-w-[160px] truncate px-2 py-2.5 text-muted-foreground">{f.topModel ?? "—"}</td>
                  <td className="py-2.5 pl-2 text-right tabular-nums text-muted-foreground">{formatRelativeTime(f.lastActiveAt, i18n.locale)}</td>
                </tr>
              ))}
              {data.folders.length === 0 && (
                <tr><td colSpan={8} className="py-8 text-center text-muted-foreground">—</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* Session Shape Scatter Plot */}
      {data.scatter.length > 0 && (
        <SectionCard title={i18n.text(msg.scatterTitle)} subtitle={i18n.text(msg.scatterSubtitle)}>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 12, right: 16, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.6} />
                <XAxis
                  type="number"
                  dataKey="requests"
                  name={i18n.text(msg.colRequests)}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  type="number"
                  dataKey="costUsd"
                  name={i18n.text(msg.colCost)}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  tickLine={false}
                  axisLine={false}
                  width={54}
                  tickFormatter={v => formatUsd(Number(v), true)}
                />
                <ZAxis type="number" dataKey="totalTokens" range={[40, 360]} />
                <Tooltip
                  cursor={{ strokeDasharray: "3 3", stroke: "var(--muted-foreground)" }}
                  content={({ active, payload }) => {
                    const item = payload?.[0]?.payload as TelemetryProjectsReply["scatter"][number] | undefined;
                    if (!active || !item) return null;
                    return (
                      <ChartTooltipBox
                        title={item.title}
                        rows={[
                          { label: i18n.text(msg.colProject), value: item.folderName ?? i18n.text(msg.ungrouped), color: folderCssColor(item.folderColor) },
                          { label: i18n.text(msg.colCost), value: formatUsd(item.costUsd) },
                          { label: i18n.text(msg.colTokens), value: formatTokens(item.totalTokens) },
                          { label: i18n.text(msg.colRequests), value: formatInteger(item.requests) },
                          { label: i18n.text(msg.colPeakInput), value: formatTokens(item.maxInputTokens) },
                        ]}
                      />
                    );
                  }}
                />
                <Scatter
                  data={data.scatter}
                  onClick={point => {
                    const s = (point as { sessionId?: string } | null)?.sessionId;
                    if (s) onDrilldown({ kind: "session", sessionId: s });
                  }}
                >
                  {data.scatter.map(entry => (
                    <Cell
                      key={entry.sessionId}
                      fill={folderCssColor(entry.folderColor)}
                      fillOpacity={0.75}
                      className="cursor-pointer"
                    />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      )}

      {/* Full Sessions Leaderboard */}
      <SectionCard
        title={i18n.text(msg.sessionsTableTitle)}
        actions={
          <div className="w-56"><SearchInput value={search} onChange={setSearch} label={i18n.text(msg.searchSessions)} /></div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-2 pr-3 font-medium">{i18n.text(msg.colSession)}</th>
                <th className="px-2 py-2 font-medium">{i18n.text(msg.colProject)}</th>
                <th className="px-2 py-2 text-right font-medium">
                  <button type="button" onClick={() => toggleSort("requests")} className="inline-flex items-center gap-1 hover:text-foreground">
                    {i18n.text(msg.colRequests)} <SortIndicator k="requests" />
                  </button>
                </th>
                <th className="px-2 py-2 text-right font-medium">
                  <button type="button" onClick={() => toggleSort("totalTokens")} className="inline-flex items-center gap-1 hover:text-foreground">
                    {i18n.text(msg.colTokens)} <SortIndicator k="totalTokens" />
                  </button>
                </th>
                <th className="px-2 py-2 text-right font-medium">
                  <button type="button" onClick={() => toggleSort("maxInputTokens")} className="inline-flex items-center gap-1 hover:text-foreground">
                    {i18n.text(msg.colPeakInput)} <SortIndicator k="maxInputTokens" />
                  </button>
                </th>
                <th className="px-2 py-2 text-right font-medium">{i18n.text(msg.colCacheHit)}</th>
                <th className="px-2 py-2 text-right font-medium">
                  <button type="button" onClick={() => toggleSort("costUsd")} className="inline-flex items-center gap-1 hover:text-foreground">
                    {i18n.text(msg.colCost)} <SortIndicator k="costUsd" />
                  </button>
                </th>
                <th className="px-2 py-2 text-right font-medium">
                  <button type="button" onClick={() => toggleSort("lastActiveAt")} className="inline-flex items-center gap-1 hover:text-foreground">
                    {i18n.text(msg.colLastActive)} <SortIndicator k="lastActiveAt" />
                  </button>
                </th>
                <th className="w-8 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {filteredSessions.slice(0, 100).map(s => (
                <tr
                  key={s.sessionId}
                  onClick={() => onDrilldown({ kind: "session", sessionId: s.sessionId })}
                  className="cursor-pointer transition-colors hover:bg-accent/50"
                >
                  <td className="max-w-[240px] py-2 pr-3">
                    <div className="flex items-center gap-1.5">
                      <span className={cn("truncate font-medium", s.deleted ? "text-muted-foreground" : "text-foreground")}>{s.title}</span>
                      {s.deleted && <Badge variant="secondary" className="text-[10px]">{i18n.text(msg.deletedMark)}</Badge>}
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      {s.folderId && <FolderDotInline color={s.folderColor} />}
                      <span className="max-w-[130px] truncate">{s.folderName ?? i18n.text(msg.ungrouped)}</span>
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{formatInteger(s.requests)}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-foreground">{formatTokens(s.totalTokens)}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{formatTokens(s.maxInputTokens)}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{formatPercent(s.cacheHitRate)}</td>
                  <td className="px-2 py-2 text-right font-medium tabular-nums text-foreground">{formatUsd(s.costUsd)}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{formatRelativeTime(s.lastActiveAt, i18n.locale)}</td>
                  <td className="py-1 pl-1 text-right" onClick={e => e.stopPropagation()}>
                    {(s.status === "active" || s.status === "sleeping") && (
                      <IconButton size="icon-xs" label={i18n.text(msg.openSession)} onClick={() => onOpenSession(s.sessionId)}>
                        <ArrowUpRight className="size-3.5" />
                      </IconButton>
                    )}
                  </td>
                </tr>
              ))}
              {filteredSessions.length === 0 && (
                <tr><td colSpan={9} className="py-8 text-center text-muted-foreground">—</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
