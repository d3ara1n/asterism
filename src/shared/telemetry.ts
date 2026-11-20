import { z } from "zod";
import type { UiText } from "@asterism-app/sdk/contracts";
import type { AppError } from "./contracts.ts";

/** Filter shared by every telemetry query; utcOffsetMinutes is positive east of UTC (e.g. +480 for UTC+8). */
export const telemetryFilterSchema = z.strictObject({
  from: z.number().int().nonnegative().nullable(),
  to: z.number().int().nonnegative().nullable(),
  utcOffsetMinutes: z.number().int().min(-840).max(840),
  /** undefined = no filter; null = ungrouped sessions without a folder; string = specific folder ID. */
  folderId: z.string().min(1).nullable().optional(),
  providerId: z.string().min(1).optional(),
  modelId: z.string().min(1).optional(),
  pluginId: z.string().min(1).optional(),
  /** undefined = no filter; null = calls without a declared purpose; string = specific purpose ID. */
  purposeId: z.string().min(1).nullable().optional(),
  sessionId: z.string().min(1).optional(),
});
export type TelemetryFilter = z.infer<typeof telemetryFilterSchema>;

export const telemetryDrilldownTargetSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("day"), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u) }),
  z.strictObject({ kind: z.literal("folder"), folderId: z.string().min(1).nullable() }),
  z.strictObject({ kind: z.literal("model"), providerId: z.string().min(1), modelId: z.string().min(1) }),
  z.strictObject({ kind: z.literal("session"), sessionId: z.string().min(1) }),
  z.strictObject({ kind: z.literal("purpose"), pluginId: z.string().min(1), purposeId: z.string().min(1).nullable() }),
  z.strictObject({ kind: z.literal("plugin"), pluginId: z.string().min(1) }),
]);
export type TelemetryDrilldownTarget = z.infer<typeof telemetryDrilldownTargetSchema>;

export const telemetryCommandSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("overview"), filter: telemetryFilterSchema }),
  z.strictObject({ type: z.literal("projects"), filter: telemetryFilterSchema }),
  z.strictObject({ type: z.literal("models"), filter: telemetryFilterSchema }),
  z.strictObject({ type: z.literal("activity"), filter: telemetryFilterSchema }),
  z.strictObject({ type: z.literal("tools"), filter: telemetryFilterSchema }),
  z.strictObject({
    type: z.literal("drilldown"),
    filter: telemetryFilterSchema,
    target: telemetryDrilldownTargetSchema,
    eventLimit: z.number().int().min(1).max(500).optional(),
    eventOffset: z.number().int().min(0).optional(),
    eventFilter: z.enum(["all", "failed", "tiered"]).optional(),
  }),
  z.strictObject({ type: z.literal("export"), filter: telemetryFilterSchema, format: z.enum(["csv", "json"]) }),
  z.strictObject({ type: z.literal("clear"), beforeTimestamp: z.number().int().nonnegative().nullable().optional() }),
]);
export type TelemetryCommand = z.infer<typeof telemetryCommandSchema>;

export interface CurrencyAmount {
  currency: string;
  amount: number;
}

export interface TelemetrySummaryMetrics {
  requests: number;
  completed: number;
  failed: number;
  cancelled: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  reasoningTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  uncachedInputTokens: number;
  cacheHitRate: number | null;
  costUsd: number;
  costIncomplete: number;
  externalCostUsd: number;
  externalOtherCurrencies: CurrencyAmount[];
  cacheSavedUsd: number;
  p50TtftMs: number | null;
  p95TtftMs: number | null;
  avgTokensPerSec: number | null;
  totalDurationMs: number;
  tieredRequests: number;
  activeDays: number;
}

export interface TelemetryTrendBucket {
  bucket: string;
  startAt: number;
  costUsd: number;
  totalTokens: number;
  inputTokens: number;
  uncachedInputTokens: number;
  outputTokens: number;
  textOutputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
  requests: number;
  byModel: Record<string, { costUsd: number; totalTokens: number; requests: number }>;
  byFolder: Record<string, { costUsd: number; totalTokens: number; requests: number }>;
}

export interface TokenBreakdown {
  uncachedInput: { tokens: number; costUsd: number | null };
  cacheRead: { tokens: number; costUsd: number | null };
  cacheWrite: { tokens: number; costUsd: number | null };
  textOutput: { tokens: number; costUsd: number | null };
  reasoning: { tokens: number; costUsd: number | null };
}

export interface PurposeStat {
  pluginId: string;
  purposeId: string | null;
  label: UiText | null;
  fallbackLabel: string;
  requests: number;
  totalTokens: number;
  costUsd: number;
}

export interface FolderStat {
  folderId: string | null;
  name: string | null;
  color: string | null;
  deleted: boolean;
  sessions: number;
  activeSessions: number;
  completedSessions: number;
  sleepingSessions: number;
  archivedSessions: number;
  requests: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheHitRate: number | null;
  costUsd: number;
  costIncomplete: number;
  topModel: string | null;
  lastActiveAt: number | null;
}

export interface SessionStat {
  sessionId: string;
  title: string;
  deleted: boolean;
  status: "active" | "sleeping" | "archived" | "deleted";
  completed: boolean;
  folderId: string | null;
  folderName: string | null;
  folderColor: string | null;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  maxInputTokens: number;
  cacheHitRate: number | null;
  costUsd: number;
  costIncomplete: number;
  tieredRequests: number;
  lastActiveAt: number;
  primaryModel: string | null;
}

export interface ModelStat {
  providerId: string;
  providerName: string;
  modelId: string;
  requests: number;
  completed: number;
  failed: number;
  cancelled: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  cacheHitRate: number | null;
  costUsd: number;
  costIncomplete: number;
  effectiveUsdPerMillion: number | null;
  p50TtftMs: number | null;
  p95TtftMs: number | null;
  avgTokensPerSec: number | null;
  successRate: number | null;
}

export interface TelemetryFilterOptions {
  folders: { id: string; name: string; color: string | null; deleted: boolean }[];
  providers: { id: string; name: string }[];
  models: { providerId: string; modelId: string; providerName: string }[];
  plugins: { id: string; name: UiText | null }[];
}

export interface TelemetryOverviewReply {
  kind: "overview";
  hasAnyData: boolean;
  firstEventAt: number | null;
  summary: TelemetrySummaryMetrics;
  previousSummary: TelemetrySummaryMetrics | null;
  burnRate7dUsdPerDay: number;
  burnRate7dByProvider: Record<string, number>;
  monthToDateCostUsd: number;
  granularity: "hour" | "day" | "week" | "month";
  trend: TelemetryTrendBucket[];
  trendModels: { key: string; label: string; providerId: string | null; modelId: string | null }[];
  trendFolders: { key: string; label: string | null; color: string | null; folderId: string | null }[];
  tokenBreakdown: TokenBreakdown;
  purposes: PurposeStat[];
  topFolders: FolderStat[];
  topModels: ModelStat[];
  topSessions: SessionStat[];
  filterOptions: TelemetryFilterOptions;
}

export interface TelemetryProjectsReply {
  kind: "projects";
  folders: FolderStat[];
  sessions: SessionStat[];
  scatter: {
    sessionId: string;
    title: string;
    folderId: string | null;
    folderName: string | null;
    folderColor: string | null;
    requests: number;
    costUsd: number;
    totalTokens: number;
    maxInputTokens: number;
  }[];
  tieredSummary: { requests: number; totalTokens: number; costUsd: number; affectedSessions: number };
}

export interface TelemetryModelsReply {
  kind: "models";
  models: ModelStat[];
  shareTrend: { bucket: string; startAt: number; shares: Record<string, number>; totals: Record<string, number> }[];
  shareModels: { key: string; label: string }[];
  thinkingLevels: {
    level: string;
    requests: number;
    totalTokens: number;
    reasoningTokens: number;
    avgReasoningTokens: number | null;
    costUsd: number;
  }[];
}

export interface TelemetryActivityReply {
  kind: "activity";
  calendar: { date: string; costUsd: number; totalTokens: number; requests: number }[];
  streaks: {
    activeDays: number;
    longestStreak: number;
    currentStreak: number;
    avgDailyTokens: number;
    avgDailyCostUsd: number;
    peakDay: { date: string; costUsd: number; totalTokens: number; requests: number } | null;
  };
  matrix: { weekday: number; hour: number; requests: number; totalTokens: number; costUsd: number }[];
  latencyBuckets: { bucket: string; minMs: number; maxMs: number | null; count: number }[];
  totalGenerationMs: number;
}

export interface TelemetryToolsReply {
  kind: "tools";
  plugins: {
    pluginId: string;
    name: UiText | null;
    requests: number;
    totalTokens: number;
    costUsd: number;
    purposes: PurposeStat[];
  }[];
  tools: {
    toolName: string;
    implementationId: string | null;
    targetResourceKind: string | null;
    calls: number;
    succeeded: number;
    failed: number;
    rejected: number;
    cancelled: number;
    successRate: number | null;
    p50DurationMs: number | null;
    p95DurationMs: number | null;
    totalDurationMs: number;
  }[];
  resourceKinds: {
    kind: string;
    calls: number;
    succeeded: number;
    failed: number;
    totalDurationMs: number;
  }[];
  externalUsage: {
    pluginId: string;
    category: string;
    provider: string | null;
    count: number;
    totalQuantity: number | null;
    unit: string | null;
    currency: string | null;
    totalAmount: number | null;
  }[];
}

export interface TelemetryEventRow {
  id: string;
  startedAt: number;
  durationMs: number | null;
  firstOutputMs: number | null;
  pluginId: string;
  entryKind: string;
  purposeId: string | null;
  purposeLabel: UiText | null;
  purposeFallback: string;
  sessionId: string | null;
  sessionTitle: string | null;
  folderId: string | null;
  folderName: string | null;
  folderColor: string | null;
  providerId: string;
  providerName: string;
  modelId: string;
  thinking: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  reasoningTokens: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  costUsd: number | null;
  costStatus: string;
  tierFromInputTokens: number | null;
  outcome: string;
  finishReason: string | null;
  errorCode: string | null;
  toolCallCount: number;
}

export interface DrilldownBreakdownItem {
  key: string;
  label: string;
  color?: string | null;
  requests: number;
  totalTokens: number;
  costUsd: number;
}

export interface TelemetryDrilldownReply {
  kind: "drilldown";
  target: TelemetryDrilldownTarget;
  title: string;
  subtitle: string | null;
  color: string | null;
  sessionStatus: "active" | "sleeping" | "archived" | "deleted" | null;
  summary: TelemetrySummaryMetrics;
  hourlyLatency: { hour: number; p50TtftMs: number | null; requests: number }[] | null;
  errorBreakdown: { code: string; origin: string | null; count: number }[];
  primaryBreakdown: { kind: "models" | "folders" | "sessions" | "purposes" | "days"; items: DrilldownBreakdownItem[] };
  secondaryBreakdown: { kind: "models" | "folders" | "sessions" | "purposes" | "days"; items: DrilldownBreakdownItem[] };
  events: TelemetryEventRow[];
  totalEvents: number;
}

export interface TelemetryExportReply {
  kind: "export";
  format: "csv" | "json";
  filename: string;
  content: string;
  rowCount: number;
}

export interface TelemetryClearReply {
  kind: "clear";
  deletedModelEvents: number;
  deletedToolEvents: number;
  deletedExternalEvents: number;
}

export type TelemetryReply =
  | TelemetryOverviewReply
  | TelemetryProjectsReply
  | TelemetryModelsReply
  | TelemetryActivityReply
  | TelemetryToolsReply
  | TelemetryDrilldownReply
  | TelemetryExportReply
  | TelemetryClearReply;

export type TelemetryResult =
  | { ok: true; reply: TelemetryReply }
  | { ok: false; error: AppError };

export interface TelemetryBridge {
  execute(command: TelemetryCommand): Promise<TelemetryResult>;
  onChanged(listener: () => void): () => void;
}
