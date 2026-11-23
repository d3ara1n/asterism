import { parseSkillUrl, referenceLinks, usageRelations, usageSubjectKinds, type UsageSubject } from "@asterism-app/sdk/contracts";
import type { AgentSkill } from "@asterism-app/sdk/runtime";

/** Skill names addressed by `skill:` references in message text, in first-appearance order without duplicates. */
export function referencedSkillNames(texts: readonly string[]): string[] {
  const names = new Set<string>();
  for (const text of texts) for (const link of referenceLinks(text)) {
    const skill = parseSkillUrl(link.url);
    if (skill) names.add(skill.name);
  }
  return [...names];
}

/** Referenced subjects resolve names through the request's effective skills; a name absent from them keeps a null source. */
export function referencedSkills(names: readonly string[], skills: readonly AgentSkill[]): UsageSubject[] {
  return names.map(name => ({ kind: usageSubjectKinds.skill, id: name, relation: usageRelations.referenced,
    source: skills.find(skill => skill.name === name)?.source.id ?? null }));
}

/** The skill catalog block as request context, measured in Unicode code points like request diagnostics. */
export function skillCatalogUsage(block: { id: string; text: string } | null): UsageSubject[] {
  return block ? [{ kind: usageSubjectKinds.skillCatalog, id: block.id, relation: usageRelations.context, quantity: [...block.text].length }] : [];
}
