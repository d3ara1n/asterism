import { useMemo, useState } from "react";
import { BookOpen, Search } from "lucide-react";
import { Badge } from "@asterism-app/ui/ui/badge";
import { SearchInput } from "@asterism-app/ui/ui/search-input";
import { TooltipHint } from "@asterism-app/ui/tooltip-hint";
import type { SubjectRow } from "../../../../shared/telemetry";
import { useI18n } from "../../../shared/i18n";
import { dashboardMessages as msg } from "../../../messages/dashboard";
import { useSkillCatalog } from "../../skills/use-skill-catalog";
import { DataTable, type Column } from "../DataTable";
import { formatInteger, formatRelative } from "../format";
import { Panel, PanelState } from "../Panel";
import { Stat } from "../parts";
import { catalogSkills, skillDetailKey, unusedSkills } from "../skills";
import { useTelemetry } from "../use-telemetry";
import type { ViewProps } from "./context";
import { skillCatalogContext, successfulSkillReads } from "../../skills/usage-query";

/**
 * Successful reads alongside current catalog names and the size of the projected catalog.
 */
export function SkillsView({ state, page, openSkill, openKey }: ViewProps) {
  const i18n = useI18n();
  const [query, setQuery] = useState("");
  const { catalog } = useSkillCatalog();
  const skills = useTelemetry(page.filter, { kind: "subjects", subject: successfulSkillReads }, state.revision);
  const ever = useTelemetry({ ...page.filter, from: null, to: null }, { kind: "subjects", subject: successfulSkillReads }, state.revision);
  const context = useTelemetry(page.filter, { kind: "subjects", subject: skillCatalogContext }, state.revision);

  const names = useMemo(() => catalog ? catalogSkills(catalog) : null, [catalog]);
  const rows = useMemo(() => skills.data?.rows ?? [], [skills.data]);
  const unused = useMemo(() => names ? unusedSkills(names, rows, ever.data?.rows ?? null) : [], [names, rows, ever.data]);
  const known = useMemo(() => new Set(names?.map(skill => skill.name)), [names]);
  const usedNames = new Set(rows.filter(row => row.successfulCalls > 0).map(row => row.id));
  const totalUses = rows.reduce((sum, row) => sum + row.successfulCalls, 0);
  const catalogRows = context.data?.rows ?? [];
  const catalogRequests = catalogRows.reduce((sum, row) => sum + row.requests, 0);
  const catalogCharacters = catalogRequests ? catalogRows.reduce((sum, row) => sum + (row.quantity ?? 0), 0) / catalogRequests : null;

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? rows.filter(row => row.id.toLowerCase().includes(needle)) : rows;
  }, [rows, query]);
  const columns = useMemo<Column<SubjectRow>[]>(() => [
    { id: "name", label: i18n.text(msg.skillName), width: "minmax(14rem, 1fr)", render: row => <span className="flex min-w-0 items-center gap-2">
      <span className="min-w-0 truncate font-mono text-xs" translate="no">{row.id}</span>
      {names && !known.has(row.id) && <Badge variant="secondary" className="shrink-0 font-normal">{i18n.text(msg.skillUnresolved)}</Badge>}
      {row.source && <TooltipHint content={row.source}><span className="type-caption min-w-0 shrink-[2] truncate" translate="no">{row.source}</span></TooltipHint>}
    </span> },
    { id: "sessions", label: i18n.text(msg.sessions), width: "5.5rem", align: "end", value: row => row.successfulSessions, render: row => formatInteger(i18n, row.successfulSessions) },
    { id: "reads", label: i18n.text(msg.skillReads), width: "6.5rem", align: "end", value: row => row.successfulCalls, render: row => formatInteger(i18n, row.successfulCalls) },
    { id: "last", label: i18n.text(msg.skillLastRead), width: "7rem", align: "end", value: row => row.lastSuccessfulAt, render: row => <span className="type-caption">{formatRelative(i18n, row.lastSuccessfulAt, state.now)}</span> },
  ], [i18n, names, known, state.now]);

  return <div className="flex flex-col gap-3">
    <Panel title={i18n.text(msg.viewSkills)} icon={<BookOpen />} state={[skills, context]} skeleton={<div className="h-28" />}>
      <div className="grid grid-cols-2 divide-x lg:grid-cols-4">
        <Stat label={i18n.text(msg.skillTotalUses)} value={formatInteger(i18n, totalUses)} detail={i18n.text(msg.skillReads)} />
        <Stat label={i18n.text(msg.skillsInCatalog)} value={names ? formatInteger(i18n, names.length) : "—"}
          detail={names ? i18n.formatMessage(msg.skillsUsedOf, { used: formatInteger(i18n, names.filter(skill => usedNames.has(skill.name)).length) }) : undefined} />
        <Stat label={i18n.text(msg.skillSessions)} value={formatInteger(i18n, skills.data?.successfulSessions ?? 0)} />
        <Stat label={i18n.text(msg.skillCatalogSize)} value={catalogCharacters === null ? "—"
          : i18n.formatMessage(msg.skillCatalogDetail, { characters: formatInteger(i18n, catalogCharacters) })} />
      </div>
    </Panel>
    <div className="grid gap-3 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
      <Panel title={i18n.text(msg.skillUsage)} state={skills}
        actions={rows.length > 0 && <div className="w-48"><SearchInput value={query} onChange={setQuery} label={i18n.text(msg.search)} /></div>}
        empty={rows.length === 0 ? <PanelState label={i18n.text(msg.skillsEmpty)} /> : filtered.length === 0 && <PanelState icon={<Search />} label={i18n.text(msg.noMatches)} />}>
        <DataTable label={i18n.text(msg.skillUsage)} columns={columns} rows={filtered} rowKey={skillDetailKey} sort={{ id: "reads", desc: true }}
          selected={openKey} onOpen={(row, origin) => openSkill(row, origin)} />
      </Panel>
      <Panel title={i18n.text(msg.skillUnused)} state={[skills, ever]}
        empty={names !== null && unused.length === 0 && <PanelState label={i18n.text(msg.skillUnusedEmpty)} />}>
        {ever.data?.firstAt != null && <p className="type-caption border-b px-4 py-2">
          {i18n.formatMessage(msg.skillUnusedHint, { date: i18n.formatDate(ever.data.firstAt, { dateStyle: "medium" }) })}</p>}
        <ul className="flex max-h-96 flex-col divide-y overflow-y-auto">{unused.map(skill => <li key={skill.name} className="flex items-center gap-3 px-4 py-2 text-sm">
          <span className="min-w-0 flex-1 truncate font-mono text-xs" translate="no">{skill.name}</span>
          <span className="type-caption shrink-0">{skill.lastAt === null ? i18n.text(msg.skillNeverUsed)
            : i18n.formatMessage(msg.skillLastUsed, { time: formatRelative(i18n, skill.lastAt, state.now) })}</span>
        </li>)}</ul>
      </Panel>
    </div>
  </div>;
}
