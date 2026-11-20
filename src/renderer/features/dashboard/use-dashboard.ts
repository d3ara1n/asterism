import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { runtime } from "../../runtime";
import { contentChunkSize } from "../../../shared/content";
import type {
  TelemetryActivityReply,
  TelemetryFilter,
  TelemetryModelsReply,
  TelemetryOverviewReply,
  TelemetryProjectsReply,
  TelemetryToolsReply,
} from "../../../shared/telemetry";
import { computeRangeBounds, localUtcOffsetMinutes, readDashboardRange, writeDashboardRange, type DashboardTab, type RangePreset } from "./format";

export interface DashboardFilterState {
  folderId?: string | null;
  providerId?: string;
  modelId?: string;
  pluginId?: string;
  purposeId?: string | null;
}

export async function saveTextFile(filename: string, content: string): Promise<boolean> {
  const bytes = new TextEncoder().encode(content);
  const begin = await window.host.saveFile({ type: "begin", filename });
  if (begin.kind !== "opened" || !begin.id) return false;
  const id = begin.id;
  try {
    for (let offset = 0; offset < bytes.length; offset += contentChunkSize) {
      const chunk = bytes.subarray(offset, Math.min(bytes.length, offset + contentChunkSize));
      await window.host.saveFile({ type: "write", id, data: chunk });
    }
    await window.host.saveFile({ type: "finish", id });
    return true;
  } catch (error) {
    try { await window.host.saveFile({ type: "abort", id }); } catch { /* ignore */ }
    throw error;
  }
}

export function useDashboardData(active: boolean) {
  const [tab, setTab] = useState<DashboardTab>("overview");
  const [range, setRangeState] = useState<RangePreset>(readDashboardRange);
  const [filters, setFilters] = useState<DashboardFilterState>({});
  const [tick, setTick] = useState(0);

  const [overview, setOverview] = useState<TelemetryOverviewReply | null>(null);
  const [projects, setProjects] = useState<TelemetryProjectsReply | null>(null);
  const [models, setModels] = useState<TelemetryModelsReply | null>(null);
  const [activity, setActivity] = useState<TelemetryActivityReply | null>(null);
  const [tools, setTools] = useState<TelemetryToolsReply | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const setRange = useCallback((next: RangePreset) => {
    setRangeState(next);
    writeDashboardRange(next);
  }, []);

  const refresh = useCallback(() => {
    setTick(value => value + 1);
  }, []);

  const filter = useMemo<TelemetryFilter>(() => {
    const bounds = computeRangeBounds(range);
    return {
      from: bounds.from,
      to: bounds.to,
      utcOffsetMinutes: localUtcOffsetMinutes(),
      ...(filters.folderId !== undefined ? { folderId: filters.folderId } : {}),
      ...(filters.providerId !== undefined ? { providerId: filters.providerId } : {}),
      ...(filters.modelId !== undefined ? { modelId: filters.modelId } : {}),
      ...(filters.pluginId !== undefined ? { pluginId: filters.pluginId } : {}),
      ...(filters.purposeId !== undefined ? { purposeId: filters.purposeId } : {}),
    };
  }, [range, filters, tick]);

  const requestSeq = useRef(0);

  // Subscribe to live telemetry updates while dashboard is active.
  useEffect(() => {
    if (!active) return;
    return runtime.telemetry.onChanged(() => { setTick(v => v + 1); });
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const seq = ++requestSeq.current;
    setLoading(true);
    setError(null);

    const fetchActive = async () => {
      // Always keep overview filter options & top summary fresh; fetch active perspective alongside it when not on overview.
      const calls = tab === "overview"
        ? [runtime.telemetry.execute({ type: "overview", filter })]
        : [
            runtime.telemetry.execute({ type: tab, filter }),
            ...(!overview ? [runtime.telemetry.execute({ type: "overview", filter })] : []),
          ];
      const results = await Promise.all(calls);
      if (seq !== requestSeq.current) return;
      for (const result of results) {
        if (!result.ok) {
          setError(result.error.message);
          setLoading(false);
          return;
        }
        const reply = result.reply;
        if (reply.kind === "overview") setOverview(reply);
        else if (reply.kind === "projects") setProjects(reply);
        else if (reply.kind === "models") setModels(reply);
        else if (reply.kind === "activity") setActivity(reply);
        else if (reply.kind === "tools") setTools(reply);
      }
      setLoading(false);
    };

    void fetchActive();
  }, [active, tab, filter]);

  return {
    tab, setTab,
    range, setRange,
    filters, setFilters,
    filter,
    overview, projects, models, activity, tools,
    loading, error, refresh,
  };
}
