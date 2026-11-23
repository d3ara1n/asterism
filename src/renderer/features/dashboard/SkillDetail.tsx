import { Filter, Settings2 } from "lucide-react";
import { usageRelations, usageSubjectKinds } from "@asterism-app/sdk/contracts";
import { useRendererSettings } from "@asterism-app/sdk/renderer";
import { IconButton } from "@asterism-app/ui/ui/icon-button";
import type { TelemetryFilter, TelemetryGroup } from "../../../shared/telemetry";
import { useI18n } from "../../shared/i18n";
import { IslandPanel } from "../../shared/weave/IslandPanel";
import { useIsland } from "../../shared/weave/Screen";
import { dashboardMessages as msg } from "../../messages/dashboard";
import { DetailIsland, detailKey, detailWidth, type DetailSubject } from "./DetailIsland";
import { formatInteger, formatPercent, formatRelative, groupLabel } from "./format";
import { useDashboard, usePageFilter, type DashboardModel } from "./model";
import { Panel, PanelState } from "./Panel";
import { RankedList, Stat } from "./parts";
import { TrendChart } from "./charts";
import { useTelemetry } from "./use-telemetry";

/**
 * One skill as recorded from one source: how often and how it was used, the files read, and the sessions and models
 * whose requests used it. Request breakdowns cover every request that declared the skill, including requests that only referenced it.
 */
export function SkillDetail({ model, skill, onOpenSession }: {
  model: DashboardModel; skill: Extract<DetailSubject, { kind: "skill" }>; onOpenSession: (id: string) => void;
}) {
  const i18n = useI18n();
  const island = useIsland();
  const settings = useRendererSettings();
  const state = useDashboard(model);
  const page = usePageFilter(state);
  const subject = { kind: usageSubjectKinds.skill, id: skill.id, source: skill.source };
  const filter: TelemetryFilter = { ...page.filter, subject };
  const rows = useTelemetry(page.filter, { kind: "subjects", subjectKind: usageSubjectKinds.skill }, state.revision);
  const series = useTelemetry(filter, { kind: "series", granularity: page.window.granularity, groupBy: null, limit: 1 }, state.revision);
  const sessions = useTelemetry(filter, { kind: "breakdown", dimension: "session", limit: 8, latency: false }, state.revision);
  const models = useTelemetry(filter, { kind: "breakdown", dimension: "model", limit: 6, latency: false }, state.revision);
  const row = rows.data?.rows.find(item => item.id === skill.id && item.source === skill.source);
  const reads = row?.relations[usageRelations.read]?.count ?? 0;
  const open = (group: TelemetryGroup, origin: HTMLElement) => {
    if (group.dimension === "session" && group.status !== "deleted") { onOpenSession(group.sessionId); return; }
    const next: DetailSubject = { kind: "group", group };
    void island.open({ key: detailKey(next), label: groupLabel(i18n, group), width: detailWidth, origin,
      render: () => <DetailIsland model={model} subject={next} onOpenSession={onOpenSession} /> });
  };
  return <IslandPanel title={skill.id} description={skill.source ?? i18n.text(msg.skillUnresolved)} action={<>
    <IconButton size="icon-sm" label={i18n.text(msg.applyFilter)} onClick={() => model.applyFilters({ subject }, { subject: skill.id })}><Filter /></IconButton>
    <IconButton size="icon-sm" label={i18n.text(msg.skillOpenSettings)} onClick={() => settings.openHost("skills")}><Settings2 /></IconButton>
  </>}>
    <div className="flex flex-col gap-4">
      <Panel embedded title={i18n.text(msg.detail)} state={rows} empty={rows.data && !row && <PanelState label={i18n.text(msg.noData)} />}>
        {row && <div className="grid grid-cols-3 divide-x">
          <Stat label={i18n.text(msg.sessions)} value={formatInteger(i18n, row.sessions)} />
          <Stat label={i18n.text(msg.skillReads)} value={formatInteger(i18n, reads)} />
          <Stat label={i18n.text(msg.skillReferences)} value={formatInteger(i18n, row.relations[usageRelations.referenced]?.count ?? 0)} />
          <Stat className="border-t" label={i18n.text(msg.skillChosen)} value={formatPercent(i18n, reads ? row.unprompted / reads : null, 0)} />
          <Stat className="border-t" label={i18n.text(msg.skillFailedReads)} value={formatInteger(i18n, row.failedCalls)} />
          <Stat className="border-t" label={i18n.text(msg.lastActive)} value={formatRelative(i18n, row.lastAt, state.now)} />
        </div>}
      </Panel>
      <Panel embedded title={i18n.text(msg.trend)} state={series} empty={series.data?.points.every(point => point.metrics.requests === 0) && <PanelState label={i18n.text(msg.noData)} />}>
        {series.data && <TrendChart series={series.data} measure="requests" className="h-44" />}
      </Panel>
      {row && row.parts.length > 0 && <Panel embedded title={i18n.text(msg.skillReadFiles)}>
        <ul className="flex flex-col divide-y">{row.parts.map(part => <li key={part} className="truncate px-4 py-2 font-mono text-xs" translate="no">{part}</li>)}</ul>
      </Panel>}
      <Panel embedded title={i18n.text(msg.skillSessionsList)} state={sessions} empty={sessions.data?.rows.length === 0 && <PanelState label={i18n.text(msg.noData)} />}>
        {sessions.data && <RankedList rows={sessions.data.rows} measure="requests" onOpen={(item, origin) => open(item.group, origin)} />}
      </Panel>
      <Panel embedded title={i18n.text(msg.skillModels)} state={models} empty={models.data?.rows.length === 0 && <PanelState label={i18n.text(msg.noData)} />}>
        {models.data && <RankedList rows={models.data.rows} measure="requests" onOpen={(item, origin) => open(item.group, origin)} />}
      </Panel>
    </div>
  </IslandPanel>;
}
