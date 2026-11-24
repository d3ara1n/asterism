import { useMemo, useSyncExternalStore } from "react";
import { type TelemetryDimension, type TelemetryFacets, type TelemetryFilter, type TelemetryGroup } from "../../../shared/telemetry";
import { localOffset, rangeWindow, type RangePreset, type RangeWindow } from "./range";

export const dashboardViews = ["overview", "attribution", "models", "activity", "tools", "skills"] as const;
export type DashboardView = typeof dashboardViews[number];
export type FilterDimensions = Omit<TelemetryFilter, "from" | "to" | "utcOffsetMinutes">;
export type FilterKey = keyof FilterDimensions;

export interface DashboardState {
  view: DashboardView;
  range: RangePreset;
  filters: FilterDimensions;
  attribution: TelemetryDimension;
  facets: TelemetryFacets | null;
  /** Display names of filters applied from details, such as a session title, which facets do not list. */
  labels: Partial<Record<FilterKey, string>>;
  /** Advances when the ledger changes; reads refetch and ranges re-anchor to the current time. */
  revision: number;
  /** The page is rereading after a change. */
  pending: boolean;
  now: number;
  /** A skill whose details the page opens when it next shows, then clears; set by navigation from outside the page. */
  focus: { id: string; source: string | null } | null;
}

/**
 * View state shared by the page, its titlebar actions, and the detail islands it opens. Those render outside the page's React tree,
 * so they read the current filters through this store instead of a captured copy. The application keeps one model in memory per run:
 * choices survive navigating away and back, and every launch starts from the overview with no filters.
 */
export class DashboardModel {
  private state: DashboardState = {
    view: "overview", range: "30d", attribution: "folder", filters: {}, labels: {}, facets: null, revision: 0, pending: false, now: Date.now(), focus: null,
  };
  private readonly listeners = new Set<() => void>();
  readonly subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  readonly getSnapshot = () => this.state;
  private set(patch: Partial<DashboardState>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
  setView(view: DashboardView) { this.set({ view }); }
  /** Show the skills view and open one skill's details when the page shows. */
  focusSkill(skill: { id: string; source: string | null }) { this.set({ view: "skills", focus: skill }); }
  clearFocus() { if (this.state.focus) this.set({ focus: null }); }
  setRange(range: RangePreset) { this.set({ range, now: Date.now() }); }
  setAttribution(attribution: TelemetryDimension) { this.set({ attribution }); }
  setFacets(facets: TelemetryFacets) { this.set({ facets }); }
  setPending(pending: boolean) { if (this.state.pending !== pending) this.set({ pending }); }
  /** Narrow the page by dimensions, each independent of the others. Changing a plugin clears the purpose that belonged to the previous one. */
  applyFilters(patch: FilterDimensions, labels: Partial<Record<FilterKey, string>> = {}) {
    const filters = { ...this.state.filters, ...patch };
    if (patch.pluginId !== undefined && !("purposeId" in patch) && this.state.filters.pluginId !== patch.pluginId) delete filters.purposeId;
    this.set({ filters, labels: { ...this.state.labels, ...labels } });
  }
  removeFilter(key: FilterKey) {
    const filters = { ...this.state.filters };
    delete filters[key];
    if (key === "pluginId") delete filters.purposeId;
    this.set({ filters });
  }
  clearFilters() { this.set({ filters: {} }); }
  refresh() { this.set({ revision: this.state.revision + 1, now: Date.now() }); }
}

export function useDashboard(model: DashboardModel): DashboardState {
  return useSyncExternalStore(model.subscribe, model.getSnapshot);
}

export interface PageFilter { filter: TelemetryFilter; window: RangeWindow; offset: number }
/** The page filter: the range anchored at the latest revision plus the chosen dimensions. */
export function usePageFilter(state: DashboardState): PageFilter {
  const { range, filters, now, facets } = state;
  const firstEventAt = facets?.firstEventAt ?? null;
  return useMemo(() => {
    const offset = localOffset(now);
    const window = rangeWindow(range, now, offset, firstEventAt);
    return { offset, window, filter: { ...filters, from: window.from, to: window.to, utcOffsetMinutes: offset } };
  }, [range, filters, now, firstEventAt]);
}

/** Identity of a dimension value across dimensions; group keys alone repeat between dimensions. */
export const groupId = (group: TelemetryGroup) => `${group.dimension}:${group.key}`;

/** Filter dimensions that select exactly one dimension value. */
export function groupFilter(group: TelemetryGroup): FilterDimensions | null {
  switch (group.dimension) {
    case "model": return { providerId: group.providerId, modelId: group.modelId };
    case "provider": return { providerId: group.providerId };
    case "folder": return { folderId: group.folderId };
    case "session": return { sessionId: group.sessionId };
    case "purpose": return { pluginId: group.pluginId, purposeId: group.purposeId };
    case "plugin": return { pluginId: group.pluginId };
    case "thinking": return { thinking: group.level };
    case "error": case "other": return null;
  }
}
