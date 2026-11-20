import type { TemplateSummary } from "../../../shared/templates";

/** Home catalog orders; "created" lists newest first, matching the stored catalog order. */
export const templateSorts = ["created", "recent", "name-asc", "name-desc"] as const;
export type TemplateSort = (typeof templateSorts)[number];
/** "all" shows every template, null shows templates without a folder, and a string shows one folder. */
export type TemplateFolderFilter = "all" | string | null;

export interface TemplateView { query: string; folder: TemplateFolderFilter; sort: TemplateSort }

const newest = (a: TemplateSummary, b: TemplateSummary) => b.createdAt.localeCompare(a.createdAt);

/**
 * Templates visible in the Home catalog. The query matches titles case-insensitively.
 * A folder filter naming an absent folder matches nothing; callers resolve deleted folders to "all".
 * Ties fall back to newest first so equal names and never-used templates keep a stable order.
 */
export function viewTemplates(templates: readonly TemplateSummary[], view: TemplateView, locale: string): TemplateSummary[] {
  const query = view.query.trim().toLocaleLowerCase(locale);
  const visible = templates.filter(template => (view.folder === "all" || template.folderId === view.folder)
    && (!query || template.title.toLocaleLowerCase(locale).includes(query)));
  if (view.sort === "created") return visible.sort(newest);
  if (view.sort === "recent") return visible.sort((a, b) => a.lastUsedAt === b.lastUsedAt ? newest(a, b)
    : a.lastUsedAt === null ? 1 : b.lastUsedAt === null ? -1 : b.lastUsedAt.localeCompare(a.lastUsedAt));
  const collator = new Intl.Collator(locale, { sensitivity: "base", numeric: true });
  const direction = view.sort === "name-asc" ? 1 : -1;
  return visible.sort((a, b) => direction * collator.compare(a.title, b.title) || newest(a, b));
}
