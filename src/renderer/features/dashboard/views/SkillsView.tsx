import { useMemo, useState } from "react";
import { BookOpen, Search } from "lucide-react";
import { usageRelations, usageSubjectKinds } from "@asterism-app/sdk/contracts";
import { Badge } from "@asterism-app/ui/ui/badge";
import { SearchInput } from "@asterism-app/ui/ui/search-input";
import { TooltipHint } from "@asterism-app/ui/tooltip-hint";
import type { SubjectRow } from "../../../../shared/telemetry";
import { useI18n } from "../../../shared/i18n";
import { dashboardMessages as msg } from "../../../messages/dashboard";
import { useSkillCatalog } from "../../skills/use-skill-catalog";
import { DataTable, type Column } from "../DataTable";
import { formatInteger, formatPercent, formatRelative } from "../format";
import { Panel, PanelState } from "../Panel";
import { Stat } from "../parts";
import { catalogLoad, catalogSkills, skillDetailKey, unusedSkills } from "../skills";
import { useTelemetry } from "../use-telemetry";
import type { ViewProps } from "./context";
const relation = (row: SubjectRow, name: string) => row.relations[name]?.count ?? 0;

/**
 * Whether skills earn their place: which were used and how, which sat unused, and what the catalog costs every request.
 * Rows come from subjects that requests declared; the catalog supplies the skills that declared nothing.
 */
export function SkillsView({ state, page, openSkill, openKey }: ViewProps) {
  const i18n = useI18n();
  const [query, setQuery] = useState("");
  const { catalog } = useSkillCatalog();
  const skills = useTelemetry(page.filter, { kind: "subjects", subjectKind: usageSubjectKinds.skill }, state.revision);
  const ever = useTelemetry({ ...page.filter, from: null, to: null }, { kind: "subjects", subjectKind: usageSubjectKinds.skill }, state.revision);
  const context = useTelemetry(page.filter, { kind: "subjects", subjectKind: usageSubjectKinds.skillCatalog }, state.revision);
  const carrying = useTelemetry({ ...page.filter, subject: { kind: usageSubjectKinds.skillCatalog } }, { kind: "summary", compare: null }, state.revision);
  const all = useTelemetry(page.filter, { kind: "summary", compare: null }, state.revision);

  const names = useMemo(() => catalog ? catalogSkills(catalog) : null, [catalog]);
  const rows = useMemo(() => skills.data?.rows ?? [], [skills.data]);
  const unused = useMemo(() => names ? unusedSkills(names, rows, ever.data?.rows ?? null) : [], [names, rows, ever.data]);
  const known = useMemo(() => new Set(names?.map(skill => skill.name)), [names]);
  const usedNames = new Set(rows.map(row => row.id));
  const reads = rows.reduce((sum, row) => sum + relation(row, usageRelations.read), 0);
  const chosen = rows.reduce((sum, row) => sum + row.unprompted, 0);
  const contextRelation = context.data?.rows.reduce<{ quantity: number; requests: number } | undefined>((total, row) => {
    const value = row.relations[usageRelations.context];
    return value ? { quantity: (total?.quantity ?? 0) + (value.quantity ?? 0), requests: (total?.requests ?? 0) + value.requests } : total;
  }, undefined);
  const load = catalogLoad(contextRelation, carrying.data?.metrics.inputTokens ?? null);
  const sessions = all.data?.sessions ?? 0;

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
    { id: "sessions", label: i18n.text(msg.sessions), width: "5.5rem", align: "end", value: row => row.sessions, render: row => formatInteger(i18n, row.sessions) },
    { id: "reads", label: i18n.text(msg.skillReads), width: "5rem", align: "end", value: row => relation(row, usageRelations.read), render: row => formatInteger(i18n, relation(row, usageRelations.read)) },
    { id: "references", label: i18n.text(msg.skillReferences), width: "6rem", align: "end", value: row => relation(row, usageRelations.referenced),
      render: row => formatInteger(i18n, relation(row, usageRelations.referenced)) },
    { id: "chosen", label: i18n.text(msg.skillChosen), width: "7rem", align: "end", value: row => relation(row, usageRelations.read) ? row.unprompted / relation(row, usageRelations.read) : null,
      render: row => formatPercent(i18n, relation(row, usageRelations.read) ? row.unprompted / relation(row, usageRelations.read) : null, 0) },
    { id: "files", label: i18n.text(msg.skillFiles), width: "4rem", align: "end", value: row => row.parts.length, render: row => formatInteger(i18n, row.parts.length) },
    { id: "last", label: i18n.text(msg.lastActive), width: "7rem", align: "end", value: row => row.lastAt, render: row => <span className="type-caption">{formatRelative(i18n, row.lastAt, state.now)}</span> },
  ], [i18n, names, known, state.now]);

  return <div className="flex flex-col gap-3">
    <Panel title={i18n.text(msg.viewSkills)} icon={<BookOpen />} state={[skills, all]} skeleton={<div className="h-28" />}>
      <div className="grid grid-cols-2 divide-x lg:grid-cols-4">
        <Stat label={i18n.text(msg.skillsInCatalog)} value={names ? formatInteger(i18n, names.length) : "—"}
          detail={names ? i18n.formatMessage(msg.skillsUsedOf, { used: formatInteger(i18n, names.filter(skill => usedNames.has(skill.name)).length) }) : undefined} />
        <Stat label={i18n.text(msg.skillSessions)} value={formatInteger(i18n, skills.data?.sessions ?? 0)}
          detail={sessions ? i18n.formatMessage(msg.skillSessionsShare, { share: formatPercent(i18n, (skills.data?.sessions ?? 0) / sessions, 0) }) : undefined} />
        <Stat label={i18n.text(msg.skillUnprompted)} value={formatPercent(i18n, reads ? chosen / reads : null, 0)} detail={i18n.text(msg.skillUnpromptedDetail)} />
        <Stat label={i18n.text(msg.skillCatalogSize)} value={load ? i18n.formatMessage(msg.skillCatalogDetail, { characters: formatInteger(i18n, load.characters) }) : "—"}
          detail={load?.share != null ? <TooltipHint content={i18n.text(msg.skillCatalogEstimate)}>
            <span>{i18n.formatMessage(msg.skillCatalogShare, { share: formatPercent(i18n, load.share, 0) })}</span></TooltipHint> : undefined} />
      </div>
    </Panel>
    <div className="grid gap-3 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
      <Panel title={i18n.text(msg.skillUsage)} state={skills}
        actions={rows.length > 0 && <div className="w-48"><SearchInput value={query} onChange={setQuery} label={i18n.text(msg.search)} /></div>}
        empty={rows.length === 0 ? <PanelState label={i18n.text(msg.skillsEmpty)} /> : filtered.length === 0 && <PanelState icon={<Search />} label={i18n.text(msg.noMatches)} />}>
        <DataTable label={i18n.text(msg.skillUsage)} columns={columns} rows={filtered} rowKey={skillDetailKey} sort={{ id: "sessions", desc: true }}
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
