import { z } from "zod";
import { readPreference, writePreference } from "../features/creation/preferences";

/** Conversation list arrangement: grouped under folders, or one list in creation order. */
export const sidebarViews = ["folders", "recent"] as const;
export type SidebarView = (typeof sidebarViews)[number];

const viewKey = "sidebar/view";
const collapsedKey = "sidebar/collapsed";
const viewSchema = z.enum(sidebarViews);
const collapsedSchema = z.array(z.string());

/** Invalid or missing values read as the folder view. */
export function readSidebarView(): SidebarView {
  const parsed = viewSchema.safeParse(readPreference(viewKey));
  return parsed.success ? parsed.data : "folders";
}
export function writeSidebarView(view: SidebarView): void { writePreference(viewKey, view); }

/** Collapsed folder-group keys; invalid values read as all groups open. */
export function readCollapsedGroups(): ReadonlySet<string> {
  const parsed = collapsedSchema.safeParse(readPreference(collapsedKey));
  return new Set(parsed.success ? parsed.data : []);
}
export function writeCollapsedGroups(keys: ReadonlySet<string>): void {
  writePreference(collapsedKey, keys.size ? [...keys] : null);
}
