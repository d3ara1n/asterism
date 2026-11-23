import type { SubjectRow } from "../../../shared/telemetry";
import type { SkillSource } from "../../../shared/skills";

/** Skills by name across catalog sources; a name counts as used once any source has a successful read. */
export interface CatalogSkill { name: string; sources: string[] }
export function catalogSkills(catalog: readonly SkillSource[]): CatalogSkill[] {
  const names = new Map<string, string[]>();
  for (const source of catalog) for (const skill of source.skills) names.set(skill.name, [...names.get(skill.name) ?? [], source.id]);
  return [...names].map(([name, sources]) => ({ name, sources })).sort((a, b) => a.name.localeCompare(b.name));
}

/** Catalog skills without a successful read in the range, with their latest recorded read. */
export function unusedSkills(catalog: readonly CatalogSkill[], range: readonly SubjectRow[], allTime: readonly SubjectRow[] | null): (CatalogSkill & { lastAt: number | null })[] {
  const used = new Set(range.filter(row => row.successfulCalls > 0).map(row => row.id));
  const last = new Map<string, number>();
  for (const row of allTime ?? []) if (row.lastSuccessfulAt !== null) last.set(row.id, Math.max(last.get(row.id) ?? 0, row.lastSuccessfulAt));
  return catalog.filter(skill => !used.has(skill.name)).map(skill => ({ ...skill, lastAt: last.get(skill.name) ?? null }))
    // Longest unused first; never-recorded skills lead.
    .sort((a, b) => (a.lastAt ?? -1) - (b.lastAt ?? -1) || a.name.localeCompare(b.name));
}

/** Row and detail-island identity of one skill as recorded from one source. */
export const skillDetailKey = (row: Pick<SubjectRow, "id" | "source">) => `skill:${JSON.stringify([row.id, row.source])}`;
