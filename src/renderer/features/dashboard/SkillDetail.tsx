import { Filter, Settings2 } from "lucide-react";
import { useRendererSettings } from "@asterism-app/sdk/renderer";
import { IconButton } from "@asterism-app/ui/ui/icon-button";
import type { CallRank, LabeledCallRank, TelemetryGroup } from "../../../shared/telemetry";
import { useI18n } from "../../shared/i18n";
import { IslandPanel } from "../../shared/weave/IslandPanel";
import { useIsland } from "../../shared/weave/Screen";
import { dashboardMessages as msg } from "../../messages/dashboard";
import { DetailIsland, detailKey, detailWidth, type DetailSubject } from "./DetailIsland";
import { formatInteger, formatRelative, groupColor, groupLabel } from "./format";
import { groupId, useDashboard, usePageFilter, type DashboardModel } from "./model";
import { Panel, PanelState } from "./Panel";
import { GroupName, RankedValues, Stat } from "./parts";
import { CountTrend } from "./charts";
import { useTelemetry } from "./use-telemetry";
import { successfulSkillReads } from "../skills/usage-query";

/** Successful reads for one source, counted independently of requests and turns. */
export function SkillDetail({ model, skill, onOpenSession }: {
  model: DashboardModel; skill: Extract<DetailSubject, { kind: "skill" }>; onOpenSession: (id: string) => void;
}) {
  const i18n = useI18n();
  const island = useIsland();
  const settings = useRendererSettings();
  const state = useDashboard(model);
  const page = usePageFilter(state);
  const subject = { ...successfulSkillReads, id: skill.id, source: skill.source };
  const filter = { ...page.filter, subject: undefined };
  const activity = useTelemetry(filter, { kind: "subject-activity", subject, granularity: page.window.granularity }, state.revision);
  const row = activity.data;
  const open = (group: TelemetryGroup, origin: HTMLElement) => {
    if (group.dimension === "session" && group.status !== "deleted") { onOpenSession(group.sessionId); return; }
    const next: DetailSubject = { kind: "group", group };
    void island.open({ key: detailKey(next), label: groupLabel(i18n, group), width: detailWidth, origin,
      render: () => <DetailIsland model={model} subject={next} onOpenSession={onOpenSession} /> });
  };
  const count = (value: number) => formatInteger(i18n, value);
  const groupRanks = (ranks: CallRank[]) => ranks.map(({ group, calls }) => ({ key: groupId(group), label: <GroupName group={group} />,
    value: calls, color: groupColor(group), open: (origin: HTMLElement) => open(group, origin) }));
  const labelRanks = (ranks: LabeledCallRank[]) => ranks.map(({ label, calls }) => ({ key: JSON.stringify(label), value: calls,
    label: label === null ? <span className="type-caption">{i18n.text(msg.skillUnknown)}</span>
      : <span className="block truncate font-mono text-xs" translate="no" title={label}>{label}</span> }));
  const noData = <PanelState label={i18n.text(msg.noData)} />;
  return <IslandPanel title={skill.id} description={skill.source ?? i18n.text(msg.skillUnresolved)} action={<>
    <IconButton size="icon-sm" label={i18n.text(msg.applyFilter)} onClick={() => model.applyFilters({ subject }, { subject: skill.id })}><Filter /></IconButton>
    <IconButton size="icon-sm" label={i18n.text(msg.skillOpenSettings)} onClick={() => settings.openHost("skills")}><Settings2 /></IconButton>
  </>}>
    <div className="flex flex-col gap-4">
      <Panel embedded title={i18n.text(msg.detail)} state={activity} empty={row && row.successfulCalls === 0 && noData}>
        {row && <div className="grid grid-cols-2 divide-x">
          <Stat label={i18n.text(msg.skillReads)} value={formatInteger(i18n, row.successfulCalls)} />
          <Stat label={i18n.text(msg.sessions)} value={formatInteger(i18n, row.successfulSessions)} />
          <Stat className="border-t" label={i18n.text(msg.skillLastRead)} value={formatRelative(i18n, row.lastSuccessfulAt, state.now)} />
          <Stat className="border-t" label={i18n.text(msg.skillTurns)} value={count(row.turns)}
            detail={row.unknownTurns > 0 ? i18n.formatMessage(msg.skillUnknownTurns, { count: row.unknownTurns }) : undefined} />
        </div>}
      </Panel>
      <Panel embedded title={i18n.text(msg.trend)} state={activity} empty={activity.data?.points.every(point => point.count === 0) && noData}>
        {activity.data && <CountTrend series={activity.data} label={i18n.text(msg.skillReads)} className="h-44" />}
      </Panel>
      <Panel embedded title={i18n.text(msg.skillRoles)} state={activity} empty={activity.data?.roles.length === 0 && noData}>
        {activity.data && <RankedValues rows={labelRanks(activity.data.roles)} format={count} />}
      </Panel>
      <Panel embedded title={i18n.text(msg.skillReadFiles)} state={activity} empty={activity.data?.files.length === 0 && noData}>
        {activity.data && <RankedValues rows={labelRanks(activity.data.files)} format={count} />}
      </Panel>
      <Panel embedded title={i18n.text(msg.skillSessionsList)} state={activity} empty={activity.data?.sessions.length === 0 && noData}>
        {activity.data && <RankedValues rows={groupRanks(activity.data.sessions)} format={count} />}
      </Panel>
      <Panel embedded title={i18n.text(msg.skillModels)} state={activity} empty={activity.data?.models.length === 0 && noData}>
        {activity.data && <RankedValues rows={groupRanks(activity.data.models)} format={count} />}
      </Panel>
    </div>
  </IslandPanel>;
}
