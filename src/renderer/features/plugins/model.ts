import type { UiText } from "@asterism-app/sdk/contracts";
import type { NpmOperation, PluginEntry } from "../../../shared/contracts";
import { pluginName } from "../../../shared/plugin-name";
import type { RendererOutcome } from "../../modules/plugin-outcome";

/** This run's state: backend startup outcome refined by the current page's frontend outcome. */
export type PluginCondition = "running" | "interfacePartial" | "interfaceFailed" | "failed" | "invalid" | "disabled" | "notRunning";
/** What the next startup does differently for this entry. */
export type PluginChange = "add" | "enable" | "disable" | "remove" | "update";
export type PluginFilter = "all" | "enabled" | "disabled" | "issues";

export interface PluginView {
  entry: PluginEntry;
  condition: PluginCondition;
  change: PluginChange | null;
  /** Selected for the next startup, or removed but still part of this run. Other entries are bundled packages that can be added. */
  installed: boolean;
  issue: boolean;
}

const issues = new Set<PluginCondition>(["interfacePartial", "interfaceFailed", "failed", "invalid"]);

export function pluginView(entry: PluginEntry, renderers: ReadonlyMap<string, RendererOutcome>): PluginView {
  const status = entry.startup?.status;
  const renderer = status === "loaded" && entry.id ? renderers.get(entry.id) : undefined;
  const condition: PluginCondition = status === "loaded"
    ? renderer?.status === "failed" ? "interfaceFailed" : renderer?.status === "partial" ? "interfacePartial" : "running"
    : status === "failed" ? "failed" : status === "invalid" ? "invalid" : status === "disabled" ? "disabled" : "notRunning";
  return { entry, condition, change: pluginChange(entry), installed: entry.selection !== null || entry.pending,
    issue: issues.has(condition) || entry.metadataError !== null };
}

function pluginChange(entry: PluginEntry): PluginChange | null {
  if (!entry.pending) return null;
  if (!entry.selection) return "remove";
  const { startup, selection } = entry;
  if (!startup) return selection.enabled ? "add" : null;
  // Disabled packages report "disabled" at startup; every other outcome means the package was enabled.
  const wasEnabled = startup.status !== "disabled";
  if (selection.enabled !== wasEnabled) return selection.enabled ? "enable" : "disable";
  return selection.enabled ? "update" : null;
}

export function matchesFilter(view: PluginView, filter: PluginFilter): boolean {
  if (filter === "all") return true;
  if (!view.installed) return false;
  if (filter === "issues") return view.issue;
  return view.entry.selection?.enabled === (filter === "enabled");
}

export function filterCounts(views: readonly PluginView[]): Record<Exclude<PluginFilter, "all">, number> {
  return {
    enabled: views.filter(view => matchesFilter(view, "enabled")).length,
    disabled: views.filter(view => matchesFilter(view, "disabled")).length,
    issues: views.filter(view => matchesFilter(view, "issues")).length,
  };
}

/** Case-insensitive match over the displayed name, description, author, ID, and package name. */
export function matchesQuery(view: PluginView, query: string, text: (value: UiText) => string): boolean {
  const search = query.trim().toLocaleLowerCase();
  if (!search) return true;
  const { entry } = view;
  return [text(pluginName(entry)), entry.metadata.description ? text(entry.metadata.description) : "", entry.metadata.author ?? "", entry.id ?? "",
    entry.origin.kind === "npm" ? entry.origin.name : ""].some(value => value.toLocaleLowerCase().includes(search));
}

export type InstallStep = "version" | "review" | "install";
export type StepState = "upcoming" | "current" | "busy" | "done" | "failed";

/** Step states for one installer; pass null when the shared operation belongs to another target or was cancelled. */
export function installSteps(operation: NpmOperation | null): Record<InstallStep, StepState> {
  const reviewed = { version: "done", review: "done" } as const;
  switch (operation?.phase) {
    case "inspecting": return { version: "busy", review: "upcoming", install: "upcoming" };
    case "preview": return { version: "done", review: "current", install: "upcoming" };
    case "installing": case "cancelling": return { ...reviewed, install: "busy" };
    case "awaiting-approval": return { ...reviewed, install: "current" };
    case "succeeded": return { ...reviewed, install: "done" };
    case "failed": return operation.preview ? { ...reviewed, install: "failed" } : { version: "failed", review: "upcoming", install: "upcoming" };
    default: return { version: "current", review: "upcoming", install: "upcoming" };
  }
}
