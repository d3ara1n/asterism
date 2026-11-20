import { z } from "zod";
import { readPreference, writePreference } from "../creation/preferences";
import { templateSorts, type TemplateFolderFilter, type TemplateSort } from "./catalog";

const sortKey = "home/templates/sort";
const folderKey = "home/templates/folder";
const sortSchema = z.enum(templateSorts);
// Preferences cannot hold null, so the no-folder filter is stored as "none"; an absent key means all templates.
const folderSchema = z.union([z.literal("none"), z.string().uuid()]);

/** Invalid or missing values read as recently used. */
export function readTemplateSort(): TemplateSort {
  const parsed = sortSchema.safeParse(readPreference(sortKey));
  return parsed.success ? parsed.data : "recent";
}
export function writeTemplateSort(sort: TemplateSort): void { writePreference(sortKey, sort); }

/** Invalid or missing values read as all templates. */
export function readTemplateFolder(): TemplateFolderFilter {
  const parsed = folderSchema.safeParse(readPreference(folderKey));
  return !parsed.success ? "all" : parsed.data === "none" ? null : parsed.data;
}
export function writeTemplateFolder(folder: TemplateFolderFilter): void {
  writePreference(folderKey, folder === "all" ? null : folder ?? "none");
}
