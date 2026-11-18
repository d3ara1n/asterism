import type { ResourceSnapshot } from "@asterism-app/sdk/contracts";
import type { ListedReferenceTarget, ReferenceTarget } from "@asterism-app/sdk/renderer";

/** Pure navigation and ranking for the composer's `@` reference menu. */

export interface MenuSkill { readonly name: string; readonly description: string }

/** Top-level groups of the reference menu. Each category drills down into its own items. */
export type MenuCategory = "skills" | "resources";
export const menuCategories: readonly MenuCategory[] = ["skills", "resources"];

/** Root shows categories (or cross-category results while searching); a category shows only its items. */
export type MenuView = { level: "root" } | { level: "category"; category: MenuCategory }
  | { level: "resource"; id: string; back: "root" | "resources" };

export type MenuRow =
  | { kind: "category"; category: MenuCategory; count: number }
  | { kind: "skill"; skill: MenuSkill }
  | { kind: "resource"; resource: ResourceSnapshot }
  | { kind: "target"; target: ReferenceTarget };

/**
 * Match tier for a query, lower is better; null means no match.
 * Name tiers come before description so a few hundred skills stay navigable by name.
 */
export function skillMatchTier(skill: MenuSkill, query: string): number | null {
  const q = query.trim().toLowerCase();
  if (!q) return 5;
  const name = skill.name.toLowerCase();
  if (name === q) return 0;
  if (name.startsWith(q)) return 1;
  const index = name.indexOf(q);
  if (index > 0 && /[^a-z0-9]/u.test(name[index - 1]!)) return 2;
  if (index > 0) return 3;
  if (skill.description.toLowerCase().includes(q)) return 4;
  return null;
}

/** Skills matching the query ranked by tier; equal tiers keep catalog order. */
export function rankSkills(skills: readonly MenuSkill[], query: string): MenuSkill[] {
  return skills.flatMap((skill, index) => {
    const tier = skillMatchTier(skill, query);
    return tier === null ? [] : [{ skill, tier, index }];
  }).sort((a, b) => a.tier - b.tier || a.index - b.index).map(entry => entry.skill);
}

/** Preserve source order. Presentation detail and the opaque location are not filter keys. */
export function filterTargets(items: readonly ListedReferenceTarget[], query: string): readonly ListedReferenceTarget[] {
  const needle = query.trim().toLowerCase();
  return needle ? items.filter(item => item.label.toLowerCase().includes(needle)
    || item.keywords?.some(keyword => keyword.toLowerCase().includes(needle))) : items;
}

export function menuRows(view: Exclude<MenuView, { level: "resource" }>, query: string, skills: readonly MenuSkill[],
  resources: readonly ResourceSnapshot[]): MenuRow[] {
  if (view.level === "root" && !query.trim())
    return menuCategories.map(category => ({ kind: "category", category, count: category === "skills" ? skills.length : resources.length }));
  const rows: MenuRow[] = [];
  if (view.level === "root" || view.category === "skills")
    rows.push(...rankSkills(skills, query).map((skill): MenuRow => ({ kind: "skill", skill })));
  if (view.level === "root" || view.category === "resources") {
    const needle = query.trim().toLowerCase();
    for (const resource of resources) if (resource.title.toLowerCase().includes(needle)) rows.push({ kind: "resource", resource });
  }
  return rows;
}
