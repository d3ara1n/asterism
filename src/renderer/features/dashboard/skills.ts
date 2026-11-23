import type { SubjectRow } from "../../../shared/telemetry";
import type { SkillSource } from "../../../shared/skills";

/** Skills by name across catalog sources; a name counts as used when any recorded row has it, whatever source it resolved from. */
export interface CatalogSkill { name: string; sources: string[] }
export function catalogSkills(catalog: readonly SkillSource[]): CatalogSkill[] {
  const names = new Map<string, string[]>();
  for (const source of catalog) for (const skill of source.skills) names.set(skill.name, [...names.get(skill.name) ?? [], source.id]);
  return [...names].map(([name, sources]) => ({ name, sources })).sort((a, b) => a.name.localeCompare(b.name));
}

/** Catalog skills absent from the range's rows, with the latest use recorded before it (null when never recorded). */
export function unusedSkills(catalog: readonly CatalogSkill[], range: readonly SubjectRow[], allTime: readonly SubjectRow[] | null): (CatalogSkill & { lastAt: number | null })[] {
  const used = new Set(range.map(row => row.id));
  const last = new Map<string, number>();
  for (const row of allTime ?? []) if (row.lastAt !== null) last.set(row.id, Math.max(last.get(row.id) ?? 0, row.lastAt));
  return catalog.filter(skill => !used.has(skill.name)).map(skill => ({ ...skill, lastAt: last.get(skill.name) ?? null }))
    // Longest unused first; never-recorded skills lead.
    .sort((a, b) => (a.lastAt ?? -1) - (b.lastAt ?? -1) || a.name.localeCompare(b.name));
}

/**
 * Average catalog size per request that carried it, and its estimated share of those requests' reported input,
 * at roughly 4 characters per token. Null when no request carried the catalog or no input was reported.
 */
export function catalogLoad(context: { quantity: number | null; requests: number } | undefined, inputTokens: number | null): { characters: number; share: number | null } | null {
  if (!context?.requests || context.quantity === null) return null;
  const characters = context.quantity / context.requests;
  const perRequest = inputTokens === null ? 0 : inputTokens / context.requests;
  return { characters, share: perRequest > 0 ? Math.min(1, characters / 4 / perRequest) : null };
}

/** Row and detail-island identity of one skill as recorded from one source. */
export const skillDetailKey = (row: Pick<SubjectRow, "id" | "source">) => `skill:${JSON.stringify([row.id, row.source])}`;
