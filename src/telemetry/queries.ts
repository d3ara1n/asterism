import type { DatabaseSync } from "node:sqlite";
import type { UiText } from "@asterism-app/sdk/contracts";
import type {
  CurrencyAmount,
  DrilldownBreakdownItem,
  FolderStat,
  ModelStat,
  PurposeStat,
  SessionStat,
  TelemetryActivityReply,
  TelemetryClearReply,
  TelemetryDrilldownReply,
  TelemetryDrilldownTarget,
  TelemetryEventRow,
  TelemetryExportReply,
  TelemetryFilter,
  TelemetryFilterOptions,
  TelemetryModelsReply,
  TelemetryOverviewReply,
  TelemetryProjectsReply,
  TelemetrySummaryMetrics,
  TelemetryToolsReply,
  TelemetryTrendBucket,
  TokenBreakdown,
} from "../shared/telemetry.ts";
import type { LiveFolderInfo, LiveSessionInfo, WorkspaceLookup } from "./types.ts";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const UNGROUPED_KEY = "__ungrouped__";
const OTHER_KEY = "__other__";

interface RawModelRow {
  id: string;
  started_at: number;
  ended_at: number;
  duration_ms: number | null;
  first_output_ms: number | null;
  first_text_ms: number | null;
  first_reasoning_ms: number | null;
  output_chunks: number | null;
  plugin_id: string;
  entry_kind: string;
  resource_id: string | null;
  resource_kind: string | null;
  session_id: string | null;
  session_title_snapshot: string | null;
  folder_id_snapshot: string | null;
  folder_name_snapshot: string | null;
  folder_color_snapshot: string | null;
  purpose_id: string | null;
  purpose_label_snapshot: string | null;
  provider_id: string;
  provider_name_snapshot: string;
  model_id: string;
  protocol: string | null;
  thinking: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  reasoning_tokens: number | null;
  cache_read_tokens: number | null;
  cache_write_tokens: number | null;
  has_files: number;
  tool_call_count: number;
  cost_usd: number | null;
  cost_status: string;
  uncached_input_cost_usd: number | null;
  cache_read_cost_usd: number | null;
  cache_write_cost_usd: number | null;
  text_output_cost_usd: number | null;
  reasoning_cost_usd: number | null;
  tier_from_input_tokens: number | null;
  cache_saved_usd: number | null;
  outcome: string;
  finish_reason: string | null;
  error_origin: string | null;
  error_code: string | null;
}

interface ResolvedRow extends RawModelRow {
  folderId: string | null;
  folderName: string | null;
  folderColor: string | null;
  folderDeleted: boolean;
  sessionTitle: string | null;
  sessionStatus: "active" | "sleeping" | "archived" | "deleted";
  sessionCompleted: boolean;
  providerName: string;
}

interface RawToolRow {
  tool_name: string;
  implementation_id: string | null;
  target_resource_kind: string | null;
  outcome_kind: string;
  duration_ms: number | null;
  session_id: string | null;
  plugin_id: string;
}

interface RawExternalRow {
  recorded_at: number;
  plugin_id: string;
  session_id: string | null;
  folder_id_snapshot: string | null;
  category: string;
  provider_label: string | null;
  quantity: number | null;
  unit: string | null;
  currency: string | null;
  amount: number | null;
  outcome: string;
}

export interface PurposeRegistry {
  label(pluginId: string, purposeId: string | null): UiText | null;
  fallback(pluginId: string, purposeId: string | null, snapshot: string | null, entryKind?: string): string;
}

// ── Timezone helpers (pure, host-TZ-independent) ──────────────────────────

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function localDateKey(utcMs: number, utcOffsetMinutes: number): string {
  const d = new Date(utcMs + utcOffsetMinutes * 60_000);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

export function localHour(utcMs: number, utcOffsetMinutes: number): number {
  return new Date(utcMs + utcOffsetMinutes * 60_000).getUTCHours();
}

/** Monday = 0, ..., Sunday = 6 in the user's local timezone. */
export function localWeekday(utcMs: number, utcOffsetMinutes: number): number {
  const jsDay = new Date(utcMs + utcOffsetMinutes * 60_000).getUTCDay();
  return (jsDay + 6) % 7;
}

/** UTC ms corresponding to 00:00:00.000 of a local YYYY-MM-DD calendar date. */
export function localDateStartUtcMs(dateKey: string, utcOffsetMinutes: number): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  return Date.UTC(y!, m! - 1, d!) - utcOffsetMinutes * 60_000;
}

export function localMonthStartUtcMs(nowMs: number, utcOffsetMinutes: number): number {
  const d = new Date(nowMs + utcOffsetMinutes * 60_000);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - utcOffsetMinutes * 60_000;
}

export function chooseGranularity(from: number | null, to: number | null, minEventAt: number | null, maxEventAt: number | null, nowMs: number): "hour" | "day" | "week" | "month" {
  const start = from ?? minEventAt ?? nowMs;
  const end = to ?? maxEventAt ?? nowMs;
  const span = Math.max(0, end - start);
  if (span <= 2 * DAY_MS) return "hour";
  if (span <= 62 * DAY_MS) return "day";
  if (span <= 270 * DAY_MS) return "week";
  return "month";
}

export function bucketForTimestamp(
  utcMs: number,
  granularity: "hour" | "day" | "week" | "month",
  utcOffsetMinutes: number,
): { bucket: string; startAt: number } {
  const local = new Date(utcMs + utcOffsetMinutes * 60_000);
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth();
  const d = local.getUTCDate();
  if (granularity === "hour") {
    const h = local.getUTCHours();
    const startAt = Date.UTC(y, m, d, h) - utcOffsetMinutes * 60_000;
    return { bucket: `${y}-${pad2(m + 1)}-${pad2(d)} ${pad2(h)}:00`, startAt };
  }
  if (granularity === "day") {
    const startAt = Date.UTC(y, m, d) - utcOffsetMinutes * 60_000;
    return { bucket: `${y}-${pad2(m + 1)}-${pad2(d)}`, startAt };
  }
  if (granularity === "week") {
    const weekday = (local.getUTCDay() + 6) % 7;
    const monday = new Date(Date.UTC(y, m, d - weekday));
    const startAt = monday.getTime() - utcOffsetMinutes * 60_000;
    const key = `${monday.getUTCFullYear()}-${pad2(monday.getUTCMonth() + 1)}-${pad2(monday.getUTCDate())}`;
    return { bucket: key, startAt };
  }
  const startAt = Date.UTC(y, m, 1) - utcOffsetMinutes * 60_000;
  return { bucket: `${y}-${pad2(m + 1)}`, startAt };
}

export function percentile(values: readonly number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx]!;
}

// ── Row loading and live workspace enrichment ─────────────────────────────

function resolveRow(
  row: RawModelRow,
  sessions: ReadonlyMap<string, LiveSessionInfo>,
  folders: ReadonlyMap<string, LiveFolderInfo>,
  providers: ReadonlyMap<string, string>,
): ResolvedRow {
  const liveSession = row.session_id ? sessions.get(row.session_id) ?? null : null;
  const effectiveFolderId = liveSession ? liveSession.folderId : row.folder_id_snapshot;
  const liveFolder = effectiveFolderId ? folders.get(effectiveFolderId) ?? null : null;
  const folderDeleted = effectiveFolderId !== null && liveFolder === null;
  return {
    ...row,
    folderId: effectiveFolderId,
    folderName: liveFolder ? liveFolder.name : effectiveFolderId ? row.folder_name_snapshot : null,
    folderColor: liveFolder ? liveFolder.color : effectiveFolderId ? row.folder_color_snapshot : null,
    folderDeleted,
    sessionTitle: liveSession ? liveSession.title : row.session_title_snapshot,
    sessionStatus: liveSession ? liveSession.status : "deleted",
    sessionCompleted: liveSession ? liveSession.completed : false,
    providerName: providers.get(row.provider_id) ?? row.provider_name_snapshot,
  };
}

function loadModelRows(db: DatabaseSync, filter: TelemetryFilter, lookup: WorkspaceLookup): ResolvedRow[] {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (filter.from !== null) { where.push("started_at >= ?"); params.push(filter.from); }
  if (filter.to !== null) { where.push("started_at < ?"); params.push(filter.to); }
  if (filter.providerId !== undefined) { where.push("provider_id = ?"); params.push(filter.providerId); }
  if (filter.modelId !== undefined) { where.push("model_id = ?"); params.push(filter.modelId); }
  if (filter.pluginId !== undefined) { where.push("plugin_id = ?"); params.push(filter.pluginId); }
  if (filter.purposeId !== undefined) {
    if (filter.purposeId === null) where.push("purpose_id IS NULL");
    else { where.push("purpose_id = ?"); params.push(filter.purposeId); }
  }
  if (filter.sessionId !== undefined) { where.push("session_id = ?"); params.push(filter.sessionId); }
  const sql = `SELECT * FROM model_usage_events${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY started_at ASC`;
  const raw = db.prepare(sql).all(...params) as unknown as RawModelRow[];
  const sessions = lookup.sessions();
  const folders = lookup.folders();
  const providers = lookup.providerNames();
  const resolved = raw.map(row => resolveRow(row, sessions, folders, providers));
  if (filter.folderId !== undefined) {
    return resolved.filter(row => row.folderId === filter.folderId);
  }
  return resolved;
}

function loadExternalRows(db: DatabaseSync, filter: TelemetryFilter, lookup: WorkspaceLookup): RawExternalRow[] {
  if (filter.providerId !== undefined || filter.modelId !== undefined || filter.purposeId !== undefined) return [];
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (filter.from !== null) { where.push("recorded_at >= ?"); params.push(filter.from); }
  if (filter.to !== null) { where.push("recorded_at < ?"); params.push(filter.to); }
  if (filter.pluginId !== undefined) { where.push("plugin_id = ?"); params.push(filter.pluginId); }
  if (filter.sessionId !== undefined) { where.push("session_id = ?"); params.push(filter.sessionId); }
  const sql = `SELECT recorded_at, plugin_id, session_id, folder_id_snapshot, category, provider_label, quantity, unit, currency, amount, outcome FROM external_usage_events${where.length ? ` WHERE ${where.join(" AND ")}` : ""}`;
  const raw = db.prepare(sql).all(...params) as unknown as RawExternalRow[];
  if (filter.folderId === undefined) return raw;
  const sessions = lookup.sessions();
  return raw.filter(row => {
    const live = row.session_id ? sessions.get(row.session_id) : null;
    const effectiveFolderId = live ? live.folderId : row.folder_id_snapshot;
    return effectiveFolderId === filter.folderId;
  });
}

function uncachedInputOf(row: Pick<RawModelRow, "input_tokens" | "cache_read_tokens" | "cache_write_tokens">): number {
  const input = row.input_tokens ?? 0;
  const cached = (row.cache_read_tokens ?? 0) + (row.cache_write_tokens ?? 0);
  return Math.max(0, input - cached);
}

function textOutputOf(row: Pick<RawModelRow, "output_tokens" | "reasoning_tokens">): number {
  const output = row.output_tokens ?? 0;
  const reasoning = row.reasoning_tokens ?? 0;
  return Math.max(0, output - reasoning);
}

function computeSummary(rows: readonly ResolvedRow[], external: readonly RawExternalRow[], utcOffsetMinutes: number): TelemetrySummaryMetrics {
  let completed = 0, failed = 0, cancelled = 0;
  let inputTokens = 0, outputTokens = 0, totalTokens = 0, reasoningTokens = 0, cacheReadTokens = 0, cacheWriteTokens = 0, uncachedInputTokens = 0;
  let costUsd = 0, costIncomplete = 0, cacheSavedUsd = 0, totalDurationMs = 0, tieredRequests = 0;
  let speedTokens = 0, speedMs = 0;
  const ttfts: number[] = [];
  const days = new Set<string>();

  for (const row of rows) {
    if (row.outcome === "completed") completed++;
    else if (row.outcome === "failed") failed++;
    else cancelled++;

    const inp = row.input_tokens ?? 0;
    const out = row.output_tokens ?? 0;
    const tot = row.total_tokens ?? (inp + out);
    inputTokens += inp;
    outputTokens += out;
    totalTokens += tot;
    reasoningTokens += row.reasoning_tokens ?? 0;
    cacheReadTokens += row.cache_read_tokens ?? 0;
    cacheWriteTokens += row.cache_write_tokens ?? 0;
    uncachedInputTokens += uncachedInputOf(row);

    if (row.cost_usd !== null) costUsd += row.cost_usd;
    if (row.cost_status !== "complete") costIncomplete++;
    if (row.cache_saved_usd !== null) cacheSavedUsd += row.cache_saved_usd;
    if (row.duration_ms !== null) totalDurationMs += row.duration_ms;
    if (row.tier_from_input_tokens !== null) tieredRequests++;
    if (row.first_output_ms !== null && row.first_output_ms >= 0) ttfts.push(row.first_output_ms);
    if (out > 0 && row.duration_ms !== null && row.duration_ms > 0) {
      const genMs = row.first_output_ms !== null && row.duration_ms > row.first_output_ms
        ? row.duration_ms - row.first_output_ms : row.duration_ms;
      if (genMs > 0) { speedTokens += out; speedMs += genMs; }
    }
    days.add(localDateKey(row.started_at, utcOffsetMinutes));
  }

  let externalCostUsd = 0;
  const otherCurrencies = new Map<string, number>();
  for (const ext of external) {
    if (ext.amount !== null && ext.currency) {
      if (ext.currency.toUpperCase() === "USD") externalCostUsd += ext.amount;
      else otherCurrencies.set(ext.currency.toUpperCase(), (otherCurrencies.get(ext.currency.toUpperCase()) ?? 0) + ext.amount);
    }
  }
  const externalOtherCurrencies: CurrencyAmount[] = [...otherCurrencies.entries()].map(([currency, amount]) => ({ currency, amount }));

  return {
    requests: rows.length,
    completed,
    failed,
    cancelled,
    inputTokens,
    outputTokens,
    totalTokens,
    reasoningTokens,
    cacheReadTokens,
    cacheWriteTokens,
    uncachedInputTokens,
    cacheHitRate: inputTokens > 0 ? cacheReadTokens / inputTokens : null,
    costUsd,
    costIncomplete,
    externalCostUsd,
    externalOtherCurrencies,
    cacheSavedUsd,
    p50TtftMs: percentile(ttfts, 50),
    p95TtftMs: percentile(ttfts, 95),
    avgTokensPerSec: speedMs > 0 ? speedTokens / (speedMs / 1000) : null,
    totalDurationMs,
    tieredRequests,
    activeDays: days.size,
  };
}

function buildFolderStats(rows: readonly ResolvedRow[]): FolderStat[] {
  interface Acc {
    folderId: string | null;
    name: string | null;
    color: string | null;
    deleted: boolean;
    sessionStates: Map<string, { status: ResolvedRow["sessionStatus"]; completed: boolean }>;
    requests: number;
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    costUsd: number;
    costIncomplete: number;
    modelCounts: Map<string, number>;
    lastActiveAt: number | null;
  }
  const map = new Map<string, Acc>();
  for (const row of rows) {
    const key = row.folderId ?? UNGROUPED_KEY;
    let acc = map.get(key);
    if (!acc) {
      acc = {
        folderId: row.folderId,
        name: row.folderName,
        color: row.folderColor,
        deleted: row.folderDeleted,
        sessionStates: new Map(),
        requests: 0, totalTokens: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0,
        costUsd: 0, costIncomplete: 0, modelCounts: new Map(), lastActiveAt: null,
      };
      map.set(key, acc);
    }
    if (row.session_id) acc.sessionStates.set(row.session_id, { status: row.sessionStatus, completed: row.sessionCompleted });
    acc.requests++;
    const inp = row.input_tokens ?? 0, out = row.output_tokens ?? 0;
    acc.inputTokens += inp;
    acc.outputTokens += out;
    acc.totalTokens += row.total_tokens ?? (inp + out);
    acc.cacheReadTokens += row.cache_read_tokens ?? 0;
    if (row.cost_usd !== null) acc.costUsd += row.cost_usd;
    if (row.cost_status !== "complete") acc.costIncomplete++;
    acc.modelCounts.set(row.model_id, (acc.modelCounts.get(row.model_id) ?? 0) + 1);
    if (acc.lastActiveAt === null || row.started_at > acc.lastActiveAt) acc.lastActiveAt = row.started_at;
  }

  return [...map.values()].map((acc): FolderStat => {
    let activeSessions = 0, completedSessions = 0, sleepingSessions = 0, archivedSessions = 0;
    for (const s of acc.sessionStates.values()) {
      if (s.status === "active") activeSessions++;
      else if (s.status === "sleeping") sleepingSessions++;
      else if (s.status === "archived") archivedSessions++;
      if (s.completed) completedSessions++;
    }
    let topModel: string | null = null, topCount = 0;
    for (const [model, count] of acc.modelCounts) {
      if (count > topCount) { topModel = model; topCount = count; }
    }
    return {
      folderId: acc.folderId,
      name: acc.name,
      color: acc.color,
      deleted: acc.deleted,
      sessions: acc.sessionStates.size,
      activeSessions,
      completedSessions,
      sleepingSessions,
      archivedSessions,
      requests: acc.requests,
      totalTokens: acc.totalTokens,
      inputTokens: acc.inputTokens,
      outputTokens: acc.outputTokens,
      cacheReadTokens: acc.cacheReadTokens,
      cacheHitRate: acc.inputTokens > 0 ? acc.cacheReadTokens / acc.inputTokens : null,
      costUsd: acc.costUsd,
      costIncomplete: acc.costIncomplete,
      topModel,
      lastActiveAt: acc.lastActiveAt,
    };
  }).sort((a, b) => b.costUsd - a.costUsd || b.totalTokens - a.totalTokens || b.requests - a.requests);
}

function buildModelStats(rows: readonly ResolvedRow[]): ModelStat[] {
  interface Acc {
    providerId: string;
    providerName: string;
    modelId: string;
    requests: number; completed: number; failed: number; cancelled: number;
    inputTokens: number; outputTokens: number; reasoningTokens: number; cacheReadTokens: number; totalTokens: number;
    costUsd: number; costIncomplete: number;
    ttfts: number[];
    speedTokens: number; speedMs: number;
  }
  const map = new Map<string, Acc>();
  for (const row of rows) {
    const key = `${row.provider_id}::${row.model_id}`;
    let acc = map.get(key);
    if (!acc) {
      acc = {
        providerId: row.provider_id, providerName: row.providerName, modelId: row.model_id,
        requests: 0, completed: 0, failed: 0, cancelled: 0,
        inputTokens: 0, outputTokens: 0, reasoningTokens: 0, cacheReadTokens: 0, totalTokens: 0,
        costUsd: 0, costIncomplete: 0, ttfts: [], speedTokens: 0, speedMs: 0,
      };
      map.set(key, acc);
    }
    acc.requests++;
    if (row.outcome === "completed") acc.completed++;
    else if (row.outcome === "failed") acc.failed++;
    else acc.cancelled++;
    const inp = row.input_tokens ?? 0, out = row.output_tokens ?? 0;
    acc.inputTokens += inp;
    acc.outputTokens += out;
    acc.reasoningTokens += row.reasoning_tokens ?? 0;
    acc.cacheReadTokens += row.cache_read_tokens ?? 0;
    acc.totalTokens += row.total_tokens ?? (inp + out);
    if (row.cost_usd !== null) acc.costUsd += row.cost_usd;
    if (row.cost_status !== "complete") acc.costIncomplete++;
    if (row.first_output_ms !== null && row.first_output_ms >= 0) acc.ttfts.push(row.first_output_ms);
    if (out > 0 && row.duration_ms !== null && row.duration_ms > 0) {
      const genMs = row.first_output_ms !== null && row.duration_ms > row.first_output_ms
        ? row.duration_ms - row.first_output_ms : row.duration_ms;
      if (genMs > 0) { acc.speedTokens += out; acc.speedMs += genMs; }
    }
  }
  return [...map.values()].map((acc): ModelStat => ({
    providerId: acc.providerId,
    providerName: acc.providerName,
    modelId: acc.modelId,
    requests: acc.requests,
    completed: acc.completed,
    failed: acc.failed,
    cancelled: acc.cancelled,
    inputTokens: acc.inputTokens,
    outputTokens: acc.outputTokens,
    reasoningTokens: acc.reasoningTokens,
    cacheReadTokens: acc.cacheReadTokens,
    totalTokens: acc.totalTokens,
    cacheHitRate: acc.inputTokens > 0 ? acc.cacheReadTokens / acc.inputTokens : null,
    costUsd: acc.costUsd,
    costIncomplete: acc.costIncomplete,
    effectiveUsdPerMillion: acc.totalTokens > 0 && acc.costUsd > 0 ? (acc.costUsd / acc.totalTokens) * 1_000_000 : null,
    p50TtftMs: percentile(acc.ttfts, 50),
    p95TtftMs: percentile(acc.ttfts, 95),
    avgTokensPerSec: acc.speedMs > 0 ? acc.speedTokens / (acc.speedMs / 1000) : null,
    successRate: acc.requests > 0 ? acc.completed / acc.requests : null,
  })).sort((a, b) => b.costUsd - a.costUsd || b.totalTokens - a.totalTokens || b.requests - a.requests);
}

function buildSessionStats(rows: readonly ResolvedRow[]): SessionStat[] {
  interface Acc {
    sessionId: string;
    title: string;
    deleted: boolean;
    status: ResolvedRow["sessionStatus"];
    completed: boolean;
    folderId: string | null;
    folderName: string | null;
    folderColor: string | null;
    requests: number; inputTokens: number; outputTokens: number; cacheReadTokens: number; totalTokens: number;
    maxInputTokens: number; costUsd: number; costIncomplete: number; tieredRequests: number; lastActiveAt: number;
    modelCounts: Map<string, number>;
  }
  const map = new Map<string, Acc>();
  for (const row of rows) {
    if (!row.session_id) continue;
    let acc = map.get(row.session_id);
    if (!acc) {
      acc = {
        sessionId: row.session_id,
        title: row.sessionTitle ?? row.session_id.slice(0, 8),
        deleted: row.sessionStatus === "deleted",
        status: row.sessionStatus,
        completed: row.sessionCompleted,
        folderId: row.folderId,
        folderName: row.folderName,
        folderColor: row.folderColor,
        requests: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, totalTokens: 0,
        maxInputTokens: 0, costUsd: 0, costIncomplete: 0, tieredRequests: 0, lastActiveAt: row.started_at,
        modelCounts: new Map(),
      };
      map.set(row.session_id, acc);
    }
    acc.requests++;
    const inp = row.input_tokens ?? 0, out = row.output_tokens ?? 0;
    acc.inputTokens += inp;
    acc.outputTokens += out;
    acc.cacheReadTokens += row.cache_read_tokens ?? 0;
    acc.totalTokens += row.total_tokens ?? (inp + out);
    if (inp > acc.maxInputTokens) acc.maxInputTokens = inp;
    if (row.cost_usd !== null) acc.costUsd += row.cost_usd;
    if (row.cost_status !== "complete") acc.costIncomplete++;
    if (row.tier_from_input_tokens !== null) acc.tieredRequests++;
    if (row.started_at > acc.lastActiveAt) acc.lastActiveAt = row.started_at;
    acc.modelCounts.set(row.model_id, (acc.modelCounts.get(row.model_id) ?? 0) + 1);
  }
  return [...map.values()].map((acc): SessionStat => {
    let primaryModel: string | null = null, maxCount = 0;
    for (const [m, c] of acc.modelCounts) { if (c > maxCount) { primaryModel = m; maxCount = c; } }
    return {
      sessionId: acc.sessionId,
      title: acc.title,
      deleted: acc.deleted,
      status: acc.status,
      completed: acc.completed,
      folderId: acc.folderId,
      folderName: acc.folderName,
      folderColor: acc.folderColor,
      requests: acc.requests,
      inputTokens: acc.inputTokens,
      outputTokens: acc.outputTokens,
      cacheReadTokens: acc.cacheReadTokens,
      totalTokens: acc.totalTokens,
      maxInputTokens: acc.maxInputTokens,
      cacheHitRate: acc.inputTokens > 0 ? acc.cacheReadTokens / acc.inputTokens : null,
      costUsd: acc.costUsd,
      costIncomplete: acc.costIncomplete,
      tieredRequests: acc.tieredRequests,
      lastActiveAt: acc.lastActiveAt,
      primaryModel,
    };
  }).sort((a, b) => b.costUsd - a.costUsd || b.totalTokens - a.totalTokens || b.lastActiveAt - a.lastActiveAt);
}

function buildPurposeStats(rows: readonly ResolvedRow[], purposes: PurposeRegistry): PurposeStat[] {
  const map = new Map<string, { pluginId: string; purposeId: string | null; snapshot: string | null; entryKind: string; requests: number; totalTokens: number; costUsd: number }>();
  for (const row of rows) {
    const key = `${row.plugin_id}::${row.purpose_id ?? ""}`;
    let acc = map.get(key);
    if (!acc) {
      acc = { pluginId: row.plugin_id, purposeId: row.purpose_id, snapshot: row.purpose_label_snapshot, entryKind: row.entry_kind, requests: 0, totalTokens: 0, costUsd: 0 };
      map.set(key, acc);
    }
    acc.requests++;
    acc.totalTokens += row.total_tokens ?? ((row.input_tokens ?? 0) + (row.output_tokens ?? 0));
    if (row.cost_usd !== null) acc.costUsd += row.cost_usd;
  }
  return [...map.values()].map(acc => ({
    pluginId: acc.pluginId,
    purposeId: acc.purposeId,
    label: purposes.label(acc.pluginId, acc.purposeId),
    fallbackLabel: purposes.fallback(acc.pluginId, acc.purposeId, acc.snapshot, acc.entryKind),
    requests: acc.requests,
    totalTokens: acc.totalTokens,
    costUsd: acc.costUsd,
  })).sort((a, b) => b.costUsd - a.costUsd || b.totalTokens - a.totalTokens || b.requests - a.requests);
}

function buildTokenBreakdown(rows: readonly ResolvedRow[]): TokenBreakdown {
  let uncachedTokens = 0, cacheReadTokens = 0, cacheWriteTokens = 0, textOutputTokens = 0, reasoningTokens = 0;
  let uncachedCost = 0, hasUncachedCost = false;
  let cacheReadCost = 0, hasCacheReadCost = false;
  let cacheWriteCost = 0, hasCacheWriteCost = false;
  let textOutputCost = 0, hasTextOutputCost = false;
  let reasoningCost = 0, hasReasoningCost = false;

  for (const row of rows) {
    uncachedTokens += uncachedInputOf(row);
    cacheReadTokens += row.cache_read_tokens ?? 0;
    cacheWriteTokens += row.cache_write_tokens ?? 0;
    textOutputTokens += textOutputOf(row);
    reasoningTokens += row.reasoning_tokens ?? 0;
    if (row.uncached_input_cost_usd !== null) { uncachedCost += row.uncached_input_cost_usd; hasUncachedCost = true; }
    if (row.cache_read_cost_usd !== null) { cacheReadCost += row.cache_read_cost_usd; hasCacheReadCost = true; }
    if (row.cache_write_cost_usd !== null) { cacheWriteCost += row.cache_write_cost_usd; hasCacheWriteCost = true; }
    if (row.text_output_cost_usd !== null) { textOutputCost += row.text_output_cost_usd; hasTextOutputCost = true; }
    if (row.reasoning_cost_usd !== null) { reasoningCost += row.reasoning_cost_usd; hasReasoningCost = true; }
  }

  return {
    uncachedInput: { tokens: uncachedTokens, costUsd: hasUncachedCost ? uncachedCost : null },
    cacheRead: { tokens: cacheReadTokens, costUsd: hasCacheReadCost ? cacheReadCost : null },
    cacheWrite: { tokens: cacheWriteTokens, costUsd: hasCacheWriteCost ? cacheWriteCost : null },
    textOutput: { tokens: textOutputTokens, costUsd: hasTextOutputCost ? textOutputCost : null },
    reasoning: { tokens: reasoningTokens, costUsd: hasReasoningCost ? reasoningCost : null },
  };
}

function buildFilterOptions(db: DatabaseSync, lookup: WorkspaceLookup): TelemetryFilterOptions {
  const liveFolders = lookup.folders();
  const liveProviders = lookup.providerNames();
  const livePlugins = lookup.pluginNames();

  const foldersMap = new Map<string, { id: string; name: string; color: string | null; deleted: boolean }>();
  for (const folder of liveFolders.values()) {
    foldersMap.set(folder.id, { id: folder.id, name: folder.name, color: folder.color, deleted: false });
  }
  const snapFolders = db.prepare(`SELECT DISTINCT folder_id_snapshot AS id, folder_name_snapshot AS name, folder_color_snapshot AS color
    FROM model_usage_events WHERE folder_id_snapshot IS NOT NULL`).all() as { id: string; name: string | null; color: string | null }[];
  for (const row of snapFolders) {
    if (!foldersMap.has(row.id)) foldersMap.set(row.id, { id: row.id, name: row.name ?? row.id.slice(0, 8), color: row.color, deleted: true });
  }

  const providersMap = new Map<string, string>();
  const modelPairs = db.prepare(`SELECT DISTINCT provider_id, provider_name_snapshot, model_id FROM model_usage_events ORDER BY model_id ASC`).all() as {
    provider_id: string; provider_name_snapshot: string; model_id: string;
  }[];
  const models: { providerId: string; modelId: string; providerName: string }[] = [];
  for (const pair of modelPairs) {
    const providerName = liveProviders.get(pair.provider_id) ?? pair.provider_name_snapshot;
    providersMap.set(pair.provider_id, providerName);
    models.push({ providerId: pair.provider_id, modelId: pair.model_id, providerName });
  }

  const pluginIds = db.prepare(`SELECT DISTINCT plugin_id FROM model_usage_events ORDER BY plugin_id ASC`).all() as { plugin_id: string }[];
  const plugins = pluginIds.map(({ plugin_id }) => ({ id: plugin_id, name: livePlugins.get(plugin_id) ?? null }));

  return {
    folders: [...foldersMap.values()].sort((a, b) => Number(a.deleted) - Number(b.deleted) || a.name.localeCompare(b.name)),
    providers: [...providersMap.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
    models,
    plugins,
  };
}

// ── Public queries ────────────────────────────────────────────────────────

export function queryOverview(
  db: DatabaseSync,
  filter: TelemetryFilter,
  lookup: WorkspaceLookup,
  purposes: PurposeRegistry,
  nowMs = Date.now(),
): TelemetryOverviewReply {
  const meta = db.prepare("SELECT COUNT(*) AS count, MIN(started_at) AS firstAt, MAX(started_at) AS lastAt FROM model_usage_events").get() as {
    count: number; firstAt: number | null; lastAt: number | null;
  };
  const rows = loadModelRows(db, filter, lookup);
  const external = loadExternalRows(db, filter, lookup);
  const summary = computeSummary(rows, external, filter.utcOffsetMinutes);

  // Previous equal-length period for delta comparison.
  let previousSummary: TelemetrySummaryMetrics | null = null;
  if (filter.from !== null) {
    const end = filter.to ?? nowMs;
    const span = end - filter.from;
    if (span > 0) {
      const prevFilter: TelemetryFilter = { ...filter, from: Math.max(0, filter.from - span), to: filter.from };
      const prevRows = loadModelRows(db, prevFilter, lookup);
      const prevExternal = loadExternalRows(db, prevFilter, lookup);
      previousSummary = computeSummary(prevRows, prevExternal, filter.utcOffsetMinutes);
    }
  }

  // 7-day burn rate & month-to-date cost (unfiltered by view date range so Runway & Budget Pace stay accurate).
  const sevenDaysAgo = nowMs - 7 * DAY_MS;
  const recentRows = db.prepare("SELECT provider_id, cost_usd FROM model_usage_events WHERE started_at >= ? AND cost_usd IS NOT NULL").all(sevenDaysAgo) as {
    provider_id: string; cost_usd: number;
  }[];
  let recentTotalUsd = 0;
  const recentByProvider = new Map<string, number>();
  for (const r of recentRows) {
    recentTotalUsd += r.cost_usd;
    recentByProvider.set(r.provider_id, (recentByProvider.get(r.provider_id) ?? 0) + r.cost_usd);
  }
  const burnRate7dByProvider: Record<string, number> = {};
  for (const [pid, usd] of recentByProvider) burnRate7dByProvider[pid] = usd / 7;

  const monthStart = localMonthStartUtcMs(nowMs, filter.utcOffsetMinutes);
  const mtdRow = db.prepare("SELECT COALESCE(SUM(cost_usd), 0) AS total FROM model_usage_events WHERE started_at >= ?").get(monthStart) as { total: number };
  const mtdExtRow = db.prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM external_usage_events WHERE recorded_at >= ? AND UPPER(currency) = 'USD'").get(monthStart) as { total: number };

  const allModels = buildModelStats(rows);
  const allFolders = buildFolderStats(rows);
  const allSessions = buildSessionStats(rows);
  const purposeStats = buildPurposeStats(rows, purposes);

  // Pick top 6 models & folders for trend stacking.
  const topModelKeys = new Set(allModels.slice(0, 6).map(m => `${m.providerId}::${m.modelId}`));
  const trendModels: TelemetryOverviewReply["trendModels"] = allModels.slice(0, 6).map(m => ({
    key: `${m.providerId}::${m.modelId}`,
    label: m.modelId,
    providerId: m.providerId,
    modelId: m.modelId,
  }));
  if (allModels.length > 6) trendModels.push({ key: OTHER_KEY, label: "Other", providerId: null, modelId: null });

  const topFolderKeys = new Set(allFolders.slice(0, 6).map(f => f.folderId ?? UNGROUPED_KEY));
  const trendFolders: TelemetryOverviewReply["trendFolders"] = allFolders.slice(0, 6).map(f => ({
    key: f.folderId ?? UNGROUPED_KEY,
    label: f.name,
    color: f.color,
    folderId: f.folderId,
  }));
  if (allFolders.length > 6) trendFolders.push({ key: OTHER_KEY, label: "Other", color: null, folderId: null });

  const minRow = rows.length ? rows[0]!.started_at : null;
  const maxRow = rows.length ? rows[rows.length - 1]!.started_at : null;
  const granularity = chooseGranularity(filter.from, filter.to, minRow, maxRow, nowMs);

  const buckets = new Map<string, TelemetryTrendBucket>();
  // Pre-fill contiguous empty buckets when filter.from is bounded and span is reasonable (hour/day).
  if (filter.from !== null) {
    const end = filter.to ?? nowMs;
    const step = granularity === "hour" ? HOUR_MS : granularity === "day" ? DAY_MS : null;
    if (step !== null && (end - filter.from) / step <= 90) {
      for (let t = filter.from; t < end; t += step) {
        const { bucket, startAt } = bucketForTimestamp(t, granularity, filter.utcOffsetMinutes);
        if (!buckets.has(bucket)) {
          buckets.set(bucket, {
            bucket, startAt, costUsd: 0, totalTokens: 0, inputTokens: 0, uncachedInputTokens: 0,
            outputTokens: 0, textOutputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0,
            requests: 0, byModel: {}, byFolder: {},
          });
        }
      }
    }
  }

  for (const row of rows) {
    const { bucket, startAt } = bucketForTimestamp(row.started_at, granularity, filter.utcOffsetMinutes);
    let b = buckets.get(bucket);
    if (!b) {
      b = {
        bucket, startAt, costUsd: 0, totalTokens: 0, inputTokens: 0, uncachedInputTokens: 0,
        outputTokens: 0, textOutputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0,
        requests: 0, byModel: {}, byFolder: {},
      };
      buckets.set(bucket, b);
    }
    const inp = row.input_tokens ?? 0, out = row.output_tokens ?? 0, tot = row.total_tokens ?? (inp + out);
    const usd = row.cost_usd ?? 0;
    b.costUsd += usd;
    b.totalTokens += tot;
    b.inputTokens += inp;
    b.uncachedInputTokens += uncachedInputOf(row);
    b.outputTokens += out;
    b.textOutputTokens += textOutputOf(row);
    b.cacheReadTokens += row.cache_read_tokens ?? 0;
    b.cacheWriteTokens += row.cache_write_tokens ?? 0;
    b.reasoningTokens += row.reasoning_tokens ?? 0;
    b.requests++;

    const rawModelKey = `${row.provider_id}::${row.model_id}`;
    const mKey = topModelKeys.has(rawModelKey) ? rawModelKey : OTHER_KEY;
    const mEntry = b.byModel[mKey] ?? (b.byModel[mKey] = { costUsd: 0, totalTokens: 0, requests: 0 });
    mEntry.costUsd += usd; mEntry.totalTokens += tot; mEntry.requests++;

    const rawFolderKey = row.folderId ?? UNGROUPED_KEY;
    const fKey = topFolderKeys.has(rawFolderKey) ? rawFolderKey : OTHER_KEY;
    const fEntry = b.byFolder[fKey] ?? (b.byFolder[fKey] = { costUsd: 0, totalTokens: 0, requests: 0 });
    fEntry.costUsd += usd; fEntry.totalTokens += tot; fEntry.requests++;
  }

  return {
    kind: "overview",
    hasAnyData: meta.count > 0,
    firstEventAt: meta.firstAt,
    summary,
    previousSummary,
    burnRate7dUsdPerDay: recentTotalUsd / 7,
    burnRate7dByProvider,
    monthToDateCostUsd: (mtdRow?.total ?? 0) + (mtdExtRow?.total ?? 0),
    granularity,
    trend: [...buckets.values()].sort((a, b) => a.startAt - b.startAt),
    trendModels,
    trendFolders,
    tokenBreakdown: buildTokenBreakdown(rows),
    purposes: purposeStats,
    topFolders: allFolders.slice(0, 6),
    topModels: allModels.slice(0, 6),
    topSessions: allSessions.slice(0, 6),
    filterOptions: buildFilterOptions(db, lookup),
  };
}

export function queryProjects(db: DatabaseSync, filter: TelemetryFilter, lookup: WorkspaceLookup): TelemetryProjectsReply {
  const rows = loadModelRows(db, filter, lookup);
  const folders = buildFolderStats(rows);
  const sessions = buildSessionStats(rows);

  const scatter = sessions.slice(0, 150).map(s => ({
    sessionId: s.sessionId,
    title: s.title,
    folderId: s.folderId,
    folderName: s.folderName,
    folderColor: s.folderColor,
    requests: s.requests,
    costUsd: s.costUsd,
    totalTokens: s.totalTokens,
    maxInputTokens: s.maxInputTokens,
  }));

  let tieredRequests = 0, tieredTokens = 0, tieredCost = 0;
  const tieredSessions = new Set<string>();
  for (const row of rows) {
    if (row.tier_from_input_tokens !== null) {
      tieredRequests++;
      tieredTokens += row.total_tokens ?? ((row.input_tokens ?? 0) + (row.output_tokens ?? 0));
      if (row.cost_usd !== null) tieredCost += row.cost_usd;
      if (row.session_id) tieredSessions.add(row.session_id);
    }
  }

  return {
    kind: "projects",
    folders,
    sessions,
    scatter,
    tieredSummary: { requests: tieredRequests, totalTokens: tieredTokens, costUsd: tieredCost, affectedSessions: tieredSessions.size },
  };
}

export function queryModels(db: DatabaseSync, filter: TelemetryFilter, lookup: WorkspaceLookup, nowMs = Date.now()): TelemetryModelsReply {
  const rows = loadModelRows(db, filter, lookup);
  const models = buildModelStats(rows);

  const topKeys = new Set(models.slice(0, 6).map(m => `${m.providerId}::${m.modelId}`));
  const shareModels: TelemetryModelsReply["shareModels"] = models.slice(0, 6).map(m => ({
    key: `${m.providerId}::${m.modelId}`,
    label: m.modelId,
  }));
  if (models.length > 6) shareModels.push({ key: OTHER_KEY, label: "Other" });

  const minRow = rows.length ? rows[0]!.started_at : null;
  const maxRow = rows.length ? rows[rows.length - 1]!.started_at : null;
  const granularity = chooseGranularity(filter.from, filter.to, minRow, maxRow, nowMs);
  const bucketMap = new Map<string, { bucket: string; startAt: number; totals: Record<string, number>; sum: number }>();

  const thinkingMap = new Map<string, { level: string; requests: number; totalTokens: number; reasoningTokens: number; reasoningCount: number; costUsd: number }>();

  for (const row of rows) {
    const { bucket, startAt } = bucketForTimestamp(row.started_at, granularity, filter.utcOffsetMinutes);
    let b = bucketMap.get(bucket);
    if (!b) { b = { bucket, startAt, totals: {}, sum: 0 }; bucketMap.set(bucket, b); }
    const rawKey = `${row.provider_id}::${row.model_id}`;
    const key = topKeys.has(rawKey) ? rawKey : OTHER_KEY;
    const tokens = row.total_tokens ?? ((row.input_tokens ?? 0) + (row.output_tokens ?? 0));
    b.totals[key] = (b.totals[key] ?? 0) + tokens;
    b.sum += tokens;

    const level = row.thinking ?? "default";
    let t = thinkingMap.get(level);
    if (!t) { t = { level, requests: 0, totalTokens: 0, reasoningTokens: 0, reasoningCount: 0, costUsd: 0 }; thinkingMap.set(level, t); }
    t.requests++;
    t.totalTokens += tokens;
    if (row.reasoning_tokens !== null) { t.reasoningTokens += row.reasoning_tokens; t.reasoningCount++; }
    if (row.cost_usd !== null) t.costUsd += row.cost_usd;
  }

  const shareTrend = [...bucketMap.values()].sort((a, b) => a.startAt - b.startAt).map(b => {
    const shares: Record<string, number> = {};
    for (const m of shareModels) {
      shares[m.key] = b.sum > 0 ? ((b.totals[m.key] ?? 0) / b.sum) * 100 : 0;
    }
    return { bucket: b.bucket, startAt: b.startAt, shares, totals: b.totals };
  });

  const levelOrder = ["default", "off", "minimal", "low", "medium", "high", "xhigh", "max"];
  const thinkingLevels = [...thinkingMap.values()].map(t => ({
    level: t.level,
    requests: t.requests,
    totalTokens: t.totalTokens,
    reasoningTokens: t.reasoningTokens,
    avgReasoningTokens: t.reasoningCount > 0 ? Math.round(t.reasoningTokens / t.reasoningCount) : null,
    costUsd: t.costUsd,
  })).sort((a, b) => {
    const ai = levelOrder.indexOf(a.level), bi = levelOrder.indexOf(b.level);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
  });

  return { kind: "models", models, shareTrend, shareModels, thinkingLevels };
}

export function queryActivity(db: DatabaseSync, filter: TelemetryFilter, lookup: WorkspaceLookup, nowMs = Date.now()): TelemetryActivityReply {
  // Calendar heatmap always spans the past 365 local days (respecting non-time filters like folder/model/plugin).
  const todayKey = localDateKey(nowMs, filter.utcOffsetMinutes);
  const todayStart = localDateStartUtcMs(todayKey, filter.utcOffsetMinutes);
  const yearStart = todayStart - 364 * DAY_MS;
  const calendarFilter: TelemetryFilter = { ...filter, from: yearStart, to: todayStart + DAY_MS };
  const yearRows = loadModelRows(db, calendarFilter, lookup);

  const dayMap = new Map<string, { date: string; costUsd: number; totalTokens: number; requests: number }>();
  for (const row of yearRows) {
    const date = localDateKey(row.started_at, filter.utcOffsetMinutes);
    let d = dayMap.get(date);
    if (!d) { d = { date, costUsd: 0, totalTokens: 0, requests: 0 }; dayMap.set(date, d); }
    d.costUsd += row.cost_usd ?? 0;
    d.totalTokens += row.total_tokens ?? ((row.input_tokens ?? 0) + (row.output_tokens ?? 0));
    d.requests++;
  }
  const calendar = [...dayMap.values()].sort((a, b) => a.date.localeCompare(b.date));

  // Streaks & peak day across the 365-day calendar.
  let longestStreak = 0, running = 0, totalYearTokens = 0, totalYearCost = 0;
  let peakDay: TelemetryActivityReply["streaks"]["peakDay"] = null;
  for (let i = 0; i < 365; i++) {
    const key = localDateKey(yearStart + i * DAY_MS, filter.utcOffsetMinutes);
    const entry = dayMap.get(key);
    if (entry && entry.requests > 0) {
      running++;
      if (running > longestStreak) longestStreak = running;
      totalYearTokens += entry.totalTokens;
      totalYearCost += entry.costUsd;
      if (!peakDay || entry.totalTokens > peakDay.totalTokens) peakDay = entry;
    } else {
      running = 0;
    }
  }
  // Current streak: count backwards from today (or yesterday if nothing yet today).
  let currentStreak = 0;
  const hasToday = (dayMap.get(todayKey)?.requests ?? 0) > 0;
  for (let offset = hasToday ? 0 : 1; offset < 365; offset++) {
    const key = localDateKey(todayStart - offset * DAY_MS, filter.utcOffsetMinutes);
    if ((dayMap.get(key)?.requests ?? 0) > 0) currentStreak++;
    else break;
  }

  // Matrix & latency distribution respect the user's selected time filter!
  const rows = loadModelRows(db, filter, lookup);
  const matrixMap = new Map<string, { weekday: number; hour: number; requests: number; totalTokens: number; costUsd: number }>();
  const latencySpecs = [
    { bucket: "<2s", minMs: 0, maxMs: 2_000 },
    { bucket: "2–5s", minMs: 2_000, maxMs: 5_000 },
    { bucket: "5–15s", minMs: 5_000, maxMs: 15_000 },
    { bucket: "15–30s", minMs: 15_000, maxMs: 30_000 },
    { bucket: "30–60s", minMs: 30_000, maxMs: 60_000 },
    { bucket: ">60s", minMs: 60_000, maxMs: null },
  ];
  const latencyCounts = latencySpecs.map(() => 0);
  let totalGenerationMs = 0;

  for (const row of rows) {
    const weekday = localWeekday(row.started_at, filter.utcOffsetMinutes);
    const hour = localHour(row.started_at, filter.utcOffsetMinutes);
    const key = `${weekday}:${hour}`;
    let cell = matrixMap.get(key);
    if (!cell) { cell = { weekday, hour, requests: 0, totalTokens: 0, costUsd: 0 }; matrixMap.set(key, cell); }
    cell.requests++;
    cell.totalTokens += row.total_tokens ?? ((row.input_tokens ?? 0) + (row.output_tokens ?? 0));
    cell.costUsd += row.cost_usd ?? 0;

    if (row.duration_ms !== null) {
      totalGenerationMs += row.duration_ms;
      for (let i = 0; i < latencySpecs.length; i++) {
        const spec = latencySpecs[i]!;
        if (row.duration_ms >= spec.minMs && (spec.maxMs === null || row.duration_ms < spec.maxMs)) {
          latencyCounts[i] = latencyCounts[i]! + 1;
          break;
        }
      }
    }
  }

  return {
    kind: "activity",
    calendar,
    streaks: {
      activeDays: calendar.length,
      longestStreak,
      currentStreak,
      avgDailyTokens: calendar.length > 0 ? Math.round(totalYearTokens / calendar.length) : 0,
      avgDailyCostUsd: calendar.length > 0 ? totalYearCost / calendar.length : 0,
      peakDay,
    },
    matrix: [...matrixMap.values()],
    latencyBuckets: latencySpecs.map((spec, i) => ({ ...spec, count: latencyCounts[i]! })),
    totalGenerationMs,
  };
}

export function queryTools(db: DatabaseSync, filter: TelemetryFilter, lookup: WorkspaceLookup, purposes: PurposeRegistry): TelemetryToolsReply {
  const modelRows = loadModelRows(db, filter, lookup);
  const pluginNames = lookup.pluginNames();

  // Plugins + purposes breakdown.
  const pluginMap = new Map<string, { pluginId: string; name: UiText | null; requests: number; totalTokens: number; costUsd: number; rows: ResolvedRow[] }>();
  for (const row of modelRows) {
    let p = pluginMap.get(row.plugin_id);
    if (!p) { p = { pluginId: row.plugin_id, name: pluginNames.get(row.plugin_id) ?? null, requests: 0, totalTokens: 0, costUsd: 0, rows: [] }; pluginMap.set(row.plugin_id, p); }
    p.requests++;
    p.totalTokens += row.total_tokens ?? ((row.input_tokens ?? 0) + (row.output_tokens ?? 0));
    p.costUsd += row.cost_usd ?? 0;
    p.rows.push(row);
  }
  const plugins = [...pluginMap.values()].map(p => ({
    pluginId: p.pluginId,
    name: p.name,
    requests: p.requests,
    totalTokens: p.totalTokens,
    costUsd: p.costUsd,
    purposes: buildPurposeStats(p.rows, purposes),
  })).sort((a, b) => b.costUsd - a.costUsd || b.totalTokens - a.totalTokens || b.requests - a.requests);

  // Tool usage events (filtered by time, plugin, session, and folder via model_event_id or session_id).
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (filter.from !== null) { where.push("t.started_at >= ?"); params.push(filter.from); }
  if (filter.to !== null) { where.push("t.started_at < ?"); params.push(filter.to); }
  if (filter.pluginId !== undefined) { where.push("t.plugin_id = ?"); params.push(filter.pluginId); }
  if (filter.sessionId !== undefined) { where.push("t.session_id = ?"); params.push(filter.sessionId); }
  if (filter.providerId !== undefined) { where.push("m.provider_id = ?"); params.push(filter.providerId); }
  if (filter.modelId !== undefined) { where.push("m.model_id = ?"); params.push(filter.modelId); }
  const needsModelJoin = filter.providerId !== undefined || filter.modelId !== undefined || filter.folderId !== undefined;
  const toolSql = needsModelJoin
    ? `SELECT t.tool_name, t.implementation_id, t.target_resource_kind, t.outcome_kind, t.duration_ms, t.session_id, t.plugin_id, m.folder_id_snapshot
       FROM tool_usage_events t LEFT JOIN model_usage_events m ON t.model_event_id = m.id${where.length ? ` WHERE ${where.join(" AND ")}` : ""}`
    : `SELECT t.tool_name, t.implementation_id, t.target_resource_kind, t.outcome_kind, t.duration_ms, t.session_id, t.plugin_id
       FROM tool_usage_events t${where.length ? ` WHERE ${where.join(" AND ")}` : ""}`;
  let toolRows = db.prepare(toolSql).all(...params) as unknown as (RawToolRow & { folder_id_snapshot?: string | null })[];
  if (filter.folderId !== undefined) {
    const sessions = lookup.sessions();
    toolRows = toolRows.filter(row => {
      const live = row.session_id ? sessions.get(row.session_id) : null;
      const effectiveFolderId = live ? live.folderId : (row.folder_id_snapshot ?? null);
      return effectiveFolderId === filter.folderId;
    });
  }

  const toolMap = new Map<string, {
    toolName: string; implementationId: string | null; targetResourceKind: string | null;
    calls: number; succeeded: number; failed: number; rejected: number; cancelled: number;
    durations: number[]; totalDurationMs: number;
  }>();
  const resMap = new Map<string, { kind: string; calls: number; succeeded: number; failed: number; totalDurationMs: number }>();

  for (const row of toolRows) {
    const key = `${row.tool_name}::${row.implementation_id ?? ""}::${row.target_resource_kind ?? ""}`;
    let t = toolMap.get(key);
    if (!t) {
      t = {
        toolName: row.tool_name, implementationId: row.implementation_id, targetResourceKind: row.target_resource_kind,
        calls: 0, succeeded: 0, failed: 0, rejected: 0, cancelled: 0, durations: [], totalDurationMs: 0,
      };
      toolMap.set(key, t);
    }
    t.calls++;
    if (row.outcome_kind === "succeeded" || row.outcome_kind === "partial") t.succeeded++;
    else if (row.outcome_kind === "rejected") t.rejected++;
    else if (row.outcome_kind === "cancelled") t.cancelled++;
    else t.failed++;
    if (row.duration_ms !== null && row.duration_ms >= 0) {
      t.durations.push(row.duration_ms);
      t.totalDurationMs += row.duration_ms;
    }

    if (row.target_resource_kind) {
      let r = resMap.get(row.target_resource_kind);
      if (!r) { r = { kind: row.target_resource_kind, calls: 0, succeeded: 0, failed: 0, totalDurationMs: 0 }; resMap.set(row.target_resource_kind, r); }
      r.calls++;
      if (row.outcome_kind === "succeeded" || row.outcome_kind === "partial") r.succeeded++;
      else if (row.outcome_kind !== "cancelled") r.failed++;
      if (row.duration_ms !== null && row.duration_ms >= 0) r.totalDurationMs += row.duration_ms;
    }
  }

  const tools = [...toolMap.values()].map(t => ({
    toolName: t.toolName,
    implementationId: t.implementationId,
    targetResourceKind: t.targetResourceKind,
    calls: t.calls,
    succeeded: t.succeeded,
    failed: t.failed,
    rejected: t.rejected,
    cancelled: t.cancelled,
    successRate: t.calls > 0 ? t.succeeded / t.calls : null,
    p50DurationMs: percentile(t.durations, 50),
    p95DurationMs: percentile(t.durations, 95),
    totalDurationMs: t.totalDurationMs,
  })).sort((a, b) => b.calls - a.calls || b.totalDurationMs - a.totalDurationMs);

  const resourceKinds = [...resMap.values()].sort((a, b) => b.calls - a.calls);

  // External usage summary.
  const externalRows = loadExternalRows(db, filter, lookup);
  const extMap = new Map<string, {
    pluginId: string; category: string; provider: string | null; count: number;
    totalQuantity: number; hasQuantity: boolean; unit: string | null;
    currency: string | null; totalAmount: number; hasAmount: boolean;
  }>();
  for (const row of externalRows) {
    const key = `${row.plugin_id}::${row.category}::${row.provider_label ?? ""}::${row.currency ?? ""}`;
    let e = extMap.get(key);
    if (!e) {
      e = {
        pluginId: row.plugin_id, category: row.category, provider: row.provider_label, count: 0,
        totalQuantity: 0, hasQuantity: false, unit: row.unit, currency: row.currency, totalAmount: 0, hasAmount: false,
      };
      extMap.set(key, e);
    }
    e.count++;
    if (row.quantity !== null) { e.totalQuantity += row.quantity; e.hasQuantity = true; }
    if (row.amount !== null) { e.totalAmount += row.amount; e.hasAmount = true; }
  }
  const externalUsage = [...extMap.values()].map(e => ({
    pluginId: e.pluginId,
    category: e.category,
    provider: e.provider,
    count: e.count,
    totalQuantity: e.hasQuantity ? e.totalQuantity : null,
    unit: e.unit,
    currency: e.currency,
    totalAmount: e.hasAmount ? e.totalAmount : null,
  })).sort((a, b) => (b.totalAmount ?? 0) - (a.totalAmount ?? 0) || b.count - a.count);

  return { kind: "tools", plugins, tools, resourceKinds, externalUsage };
}

function toBreakdown(kind: "models" | "folders" | "sessions" | "purposes" | "days", rows: readonly ResolvedRow[], utcOffsetMinutes: number, purposes: PurposeRegistry): { kind: typeof kind; items: DrilldownBreakdownItem[] } {
  if (kind === "models") {
    return {
      kind,
      items: buildModelStats(rows).slice(0, 8).map(m => ({
        key: `${m.providerId}::${m.modelId}`,
        label: `${m.modelId} (${m.providerName})`,
        requests: m.requests, totalTokens: m.totalTokens, costUsd: m.costUsd,
      })),
    };
  }
  if (kind === "folders") {
    return {
      kind,
      items: buildFolderStats(rows).slice(0, 8).map(f => ({
        key: f.folderId ?? UNGROUPED_KEY,
        label: f.name ?? "",
        color: f.color,
        requests: f.requests, totalTokens: f.totalTokens, costUsd: f.costUsd,
      })),
    };
  }
  if (kind === "sessions") {
    return {
      kind,
      items: buildSessionStats(rows).slice(0, 8).map(s => ({
        key: s.sessionId,
        label: s.title,
        color: s.folderColor,
        requests: s.requests, totalTokens: s.totalTokens, costUsd: s.costUsd,
      })),
    };
  }
  if (kind === "purposes") {
    return {
      kind,
      items: buildPurposeStats(rows, purposes).slice(0, 8).map(p => ({
        key: `${p.pluginId}::${p.purposeId ?? ""}`,
        label: p.fallbackLabel,
        requests: p.requests, totalTokens: p.totalTokens, costUsd: p.costUsd,
      })),
    };
  }
  const map = new Map<string, { requests: number; totalTokens: number; costUsd: number }>();
  for (const row of rows) {
    const key = localDateKey(row.started_at, utcOffsetMinutes);
    const entry = map.get(key) ?? { requests: 0, totalTokens: 0, costUsd: 0 };
    entry.requests++;
    entry.totalTokens += row.total_tokens ?? ((row.input_tokens ?? 0) + (row.output_tokens ?? 0));
    entry.costUsd += row.cost_usd ?? 0;
    map.set(key, entry);
  }
  return {
    kind,
    items: [...map.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 10).map(([key, v]) => ({
      key, label: key, ...v,
    })),
  };
}

export function queryDrilldown(
  db: DatabaseSync,
  filter: TelemetryFilter,
  target: TelemetryDrilldownTarget,
  lookup: WorkspaceLookup,
  purposes: PurposeRegistry,
  options: { eventLimit?: number; eventOffset?: number; eventFilter?: "all" | "failed" | "tiered" } = {},
): TelemetryDrilldownReply {
  let scoped: TelemetryFilter = { ...filter };
  if (target.kind === "day") {
    const dayStart = localDateStartUtcMs(target.date, filter.utcOffsetMinutes);
    scoped = { ...filter, from: dayStart, to: dayStart + DAY_MS };
  } else if (target.kind === "folder") {
    scoped = { ...filter, folderId: target.folderId };
  } else if (target.kind === "model") {
    scoped = { ...filter, providerId: target.providerId, modelId: target.modelId };
  } else if (target.kind === "session") {
    scoped = { ...filter, sessionId: target.sessionId };
  } else if (target.kind === "purpose") {
    scoped = { ...filter, pluginId: target.pluginId, purposeId: target.purposeId };
  } else if (target.kind === "plugin") {
    scoped = { ...filter, pluginId: target.pluginId };
  }

  const rows = loadModelRows(db, scoped, lookup);
  const external = loadExternalRows(db, scoped, lookup);
  const summary = computeSummary(rows, external, filter.utcOffsetMinutes);

  // Title, subtitle, color, session status.
  let title = "";
  let subtitle: string | null = null;
  let color: string | null = null;
  let sessionStatus: TelemetryDrilldownReply["sessionStatus"] = null;

  if (target.kind === "day") {
    title = target.date;
  } else if (target.kind === "folder") {
    const live = target.folderId ? lookup.folder(target.folderId) : null;
    title = live?.name ?? rows[0]?.folderName ?? "";
    color = live?.color ?? rows[0]?.folderColor ?? null;
  } else if (target.kind === "model") {
    title = target.modelId;
    subtitle = lookup.providerNames().get(target.providerId) ?? rows[0]?.providerName ?? target.providerId;
  } else if (target.kind === "session") {
    const live = lookup.session(target.sessionId);
    title = live?.title ?? rows[0]?.sessionTitle ?? target.sessionId.slice(0, 8);
    sessionStatus = live ? live.status : "deleted";
    const folder = live?.folderId ? lookup.folder(live.folderId) : null;
    subtitle = folder?.name ?? rows[0]?.folderName ?? null;
    color = folder?.color ?? rows[0]?.folderColor ?? null;
  } else if (target.kind === "purpose") {
    title = purposes.fallback(target.pluginId, target.purposeId, rows[0]?.purpose_label_snapshot ?? null, rows[0]?.entry_kind);
    subtitle = target.pluginId;
  } else if (target.kind === "plugin") {
    title = target.pluginId;
  }

  // Hourly TTFT profile for model drilldown.
  let hourlyLatency: TelemetryDrilldownReply["hourlyLatency"] = null;
  if (target.kind === "model") {
    const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, ttfts: [] as number[], requests: 0 }));
    for (const row of rows) {
      const h = hours[localHour(row.started_at, filter.utcOffsetMinutes)]!;
      h.requests++;
      if (row.first_output_ms !== null && row.first_output_ms >= 0) h.ttfts.push(row.first_output_ms);
    }
    hourlyLatency = hours.map(h => ({ hour: h.hour, p50TtftMs: percentile(h.ttfts, 50), requests: h.requests }));
  }

  // Error breakdown.
  const errMap = new Map<string, { code: string; origin: string | null; count: number }>();
  for (const row of rows) {
    if (row.outcome === "failed") {
      const code = row.error_code ?? "unknown";
      const key = `${row.error_origin ?? ""}::${code}`;
      const entry = errMap.get(key) ?? { code, origin: row.error_origin, count: 0 };
      entry.count++;
      errMap.set(key, entry);
    }
  }
  const errorBreakdown = [...errMap.values()].sort((a, b) => b.count - a.count);

  const primaryKind = target.kind === "model" ? "folders" : target.kind === "plugin" ? "purposes" : "models";
  const secondaryKind = target.kind === "day" || target.kind === "folder" ? "sessions"
    : target.kind === "session" ? "purposes"
    : target.kind === "model" ? "purposes"
    : target.kind === "purpose" ? "folders"
    : "models";

  const eventFilter = options.eventFilter ?? "all";
  const filteredEvents = rows.filter(row => {
    if (eventFilter === "failed") return row.outcome === "failed";
    if (eventFilter === "tiered") return row.tier_from_input_tokens !== null;
    return true;
  }).reverse(); // newest first

  const offset = options.eventOffset ?? 0;
  const limit = options.eventLimit ?? 100;
  const page = filteredEvents.slice(offset, offset + limit).map((row): TelemetryEventRow => ({
    id: row.id,
    startedAt: row.started_at,
    durationMs: row.duration_ms,
    firstOutputMs: row.first_output_ms,
    pluginId: row.plugin_id,
    entryKind: row.entry_kind,
    purposeId: row.purpose_id,
    purposeLabel: purposes.label(row.plugin_id, row.purpose_id),
    purposeFallback: purposes.fallback(row.plugin_id, row.purpose_id, row.purpose_label_snapshot, row.entry_kind),
    sessionId: row.session_id,
    sessionTitle: row.sessionTitle,
    folderId: row.folderId,
    folderName: row.folderName,
    folderColor: row.folderColor,
    providerId: row.provider_id,
    providerName: row.providerName,
    modelId: row.model_id,
    thinking: row.thinking,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    totalTokens: row.total_tokens,
    reasoningTokens: row.reasoning_tokens,
    cacheReadTokens: row.cache_read_tokens,
    cacheWriteTokens: row.cache_write_tokens,
    costUsd: row.cost_usd,
    costStatus: row.cost_status,
    tierFromInputTokens: row.tier_from_input_tokens,
    outcome: row.outcome,
    finishReason: row.finish_reason,
    errorCode: row.error_code,
    toolCallCount: row.tool_call_count,
  }));

  return {
    kind: "drilldown",
    target,
    title,
    subtitle,
    color,
    sessionStatus,
    summary,
    hourlyLatency,
    errorBreakdown,
    primaryBreakdown: toBreakdown(primaryKind, rows, filter.utcOffsetMinutes, purposes),
    secondaryBreakdown: toBreakdown(secondaryKind, rows, filter.utcOffsetMinutes, purposes),
    events: page,
    totalEvents: filteredEvents.length,
  };
}

function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (/[",\r\n]/u.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

export function exportTelemetry(
  db: DatabaseSync,
  filter: TelemetryFilter,
  format: "csv" | "json",
  lookup: WorkspaceLookup,
  purposes: PurposeRegistry,
  nowMs = Date.now(),
): TelemetryExportReply {
  const rows = loadModelRows(db, filter, lookup);
  const stamp = localDateKey(nowMs, filter.utcOffsetMinutes);
  const filename = `asterism-usage-${stamp}.${format}`;
  if (format === "json") {
    const data = rows.map(r => ({
      id: r.id,
      startedAt: new Date(r.started_at).toISOString(),
      endedAt: new Date(r.ended_at).toISOString(),
      durationMs: r.duration_ms,
      firstOutputMs: r.first_output_ms,
      pluginId: r.plugin_id,
      entryKind: r.entry_kind,
      purpose: purposes.fallback(r.plugin_id, r.purpose_id, r.purpose_label_snapshot, r.entry_kind),
      sessionId: r.session_id,
      sessionTitle: r.sessionTitle,
      folderId: r.folderId,
      folderName: r.folderName,
      providerId: r.provider_id,
      providerName: r.providerName,
      modelId: r.model_id,
      thinking: r.thinking,
      inputTokens: r.input_tokens,
      outputTokens: r.output_tokens,
      totalTokens: r.total_tokens,
      reasoningTokens: r.reasoning_tokens,
      cacheReadTokens: r.cache_read_tokens,
      cacheWriteTokens: r.cache_write_tokens,
      costUsd: r.cost_usd,
      costStatus: r.cost_status,
      cacheSavedUsd: r.cache_saved_usd,
      outcome: r.outcome,
      errorCode: r.error_code,
      toolCallCount: r.tool_call_count,
    }));
    return { kind: "export", format, filename, content: JSON.stringify(data, null, 2), rowCount: data.length };
  }
  const headers = [
    "id", "started_at", "duration_ms", "first_output_ms", "plugin_id", "purpose",
    "session_id", "session_title", "folder_name", "provider", "model", "thinking",
    "input_tokens", "output_tokens", "total_tokens", "reasoning_tokens", "cache_read_tokens", "cache_write_tokens",
    "cost_usd", "cost_status", "cache_saved_usd", "outcome", "error_code", "tool_call_count",
  ];
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push([
      r.id, new Date(r.started_at).toISOString(), r.duration_ms, r.first_output_ms, r.plugin_id,
      purposes.fallback(r.plugin_id, r.purpose_id, r.purpose_label_snapshot, r.entry_kind),
      r.session_id, r.sessionTitle, r.folderName, r.providerName, r.model_id, r.thinking,
      r.input_tokens, r.output_tokens, r.total_tokens, r.reasoning_tokens, r.cache_read_tokens, r.cache_write_tokens,
      r.cost_usd, r.cost_status, r.cache_saved_usd, r.outcome, r.error_code, r.tool_call_count,
    ].map(csvEscape).join(","));
  }
  return { kind: "export", format, filename, content: lines.join("\n"), rowCount: rows.length };
}

export function clearTelemetry(db: DatabaseSync, beforeTimestamp: number | null | undefined): TelemetryClearReply {
  db.exec("BEGIN IMMEDIATE;");
  try {
    let deletedModelEvents: number;
    let deletedToolEvents: number;
    let deletedExternalEvents: number;
    if (beforeTimestamp === null || beforeTimestamp === undefined) {
      deletedModelEvents = Number(db.prepare("DELETE FROM model_usage_events").run().changes);
      deletedToolEvents = Number(db.prepare("DELETE FROM tool_usage_events").run().changes);
      deletedExternalEvents = Number(db.prepare("DELETE FROM external_usage_events").run().changes);
    } else {
      deletedModelEvents = Number(db.prepare("DELETE FROM model_usage_events WHERE started_at < ?").run(beforeTimestamp).changes);
      deletedToolEvents = Number(db.prepare("DELETE FROM tool_usage_events WHERE started_at < ?").run(beforeTimestamp).changes);
      deletedExternalEvents = Number(db.prepare("DELETE FROM external_usage_events WHERE recorded_at < ?").run(beforeTimestamp).changes);
    }
    db.exec("COMMIT;");
    return { kind: "clear", deletedModelEvents, deletedToolEvents, deletedExternalEvents };
  } catch (error) {
    try { db.exec("ROLLBACK;"); } catch { /* ignore */ }
    throw error;
  }
}
