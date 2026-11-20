import { z } from "zod";
import type { UiText } from "@asterism-app/sdk/contracts";
import type { AppError } from "./contracts.ts";

/**
 * Usage statistics protocol: composable reads over the host usage ledger. Each read applies one filter and returns identities,
 * recorded snapshots, and raw sums; presentation, ratios, and localized labels belong to the renderer.
 */
export const telemetryDimensions = ["model", "provider", "folder", "session", "purpose", "plugin", "thinking", "error"] as const;
export type TelemetryDimension = typeof telemetryDimensions[number];
export const telemetryGranularities = ["hour", "day", "week", "month"] as const;

const id = z.string().min(1).max(512);
const time = z.number().int().nonnegative();

/**
 * from/to bound event start times as [from, to); null leaves that side open. utcOffsetMinutes is positive east of UTC (+480 for UTC+8)
 * and places hour, day, weekday, and month boundaries. Optional dimensions narrow the ledger; null selects the absent value
 * (no folder, no purpose, the provider's default thinking level).
 */
export const telemetryFilterSchema = z.strictObject({
  from: time.nullable(),
  to: time.nullable(),
  utcOffsetMinutes: z.number().int().min(-840).max(840),
  folderId: id.nullable().optional(),
  providerId: id.optional(),
  modelId: id.optional(),
  pluginId: id.optional(),
  purposeId: id.nullable().optional(),
  sessionId: id.optional(),
  thinking: id.nullable().optional(),
}).refine(filter => filter.modelId === undefined || filter.providerId !== undefined, { message: "A model filter requires its provider." });
export type TelemetryFilter = z.infer<typeof telemetryFilterSchema>;

export const telemetryQuerySchema = z.discriminatedUnion("kind", [
  /** Filter choices and the recorded time span, independent of the filter. */
  z.strictObject({ kind: z.literal("facets") }),
  /** Totals for the filter; compare repeats them for another time range under the same dimensions. */
  z.strictObject({ kind: z.literal("summary"), compare: z.strictObject({ from: time, to: time }).nullable() }),
  /** Time buckets; groupBy splits each bucket into the top `limit` groups plus one remainder group. */
  z.strictObject({ kind: z.literal("series"), granularity: z.enum(telemetryGranularities), groupBy: z.enum(telemetryDimensions).nullable(), limit: z.number().int().min(1).max(12) }),
  /** Totals per dimension value, ordered by cost, tokens, then requests; latency adds time-to-first-output percentiles. */
  z.strictObject({ kind: z.literal("breakdown"), dimension: z.enum(telemetryDimensions), limit: z.number().int().min(1).max(1000), latency: z.boolean() }),
  /** Local weekday × hour totals. */
  z.strictObject({ kind: z.literal("matrix") }),
  /** Request counts between the shared edges of a timing field. */
  z.strictObject({ kind: z.literal("distribution"), field: z.enum(["duration", "ttft"]) }),
  /** Individual model requests, newest first. */
  z.strictObject({ kind: z.literal("events"), offset: z.number().int().min(0), limit: z.number().int().min(1).max(200), only: z.enum(["all", "failed", "tiered"]) }),
  /** Tool calls made by model requests in the filter, grouped by tool name or target resource kind. */
  z.strictObject({ kind: z.literal("tools"), groupBy: z.enum(["tool", "resource"]) }),
  /** Plugin-reported non-model usage; model, provider, purpose, and thinking filters exclude all of it. */
  z.strictObject({ kind: z.literal("external") }),
]);
export type TelemetryQuery = z.infer<typeof telemetryQuerySchema>;

export const telemetryCommandSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("query"), filter: telemetryFilterSchema, query: telemetryQuerySchema }),
  z.strictObject({ type: z.literal("export"), filter: telemetryFilterSchema, format: z.enum(["csv", "json"]) }),
  /** Permanently delete records that started before `before`; null deletes everything. */
  z.strictObject({ type: z.literal("clear"), before: time.nullable() }),
]);
export type TelemetryCommand = z.infer<typeof telemetryCommandSchema>;

/** Upper edges in milliseconds; counts have one more entry for values at or above the last edge. */
export const distributionEdges = { duration: [2_000, 5_000, 15_000, 30_000, 60_000], ttft: [500, 1_000, 2_000, 5_000, 10_000] } as const;

export interface CostParts { input: number | null; cacheRead: number | null; cacheWrite: number | null; output: number | null; reasoning: number | null }

/** Raw sums over model requests. Output tokens include reasoning tokens; input tokens include cache reads and writes. */
export interface UsageMetrics {
  requests: number;
  completed: number;
  failed: number;
  cancelled: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
  /** Estimated from the configured model prices at request time. */
  costUsd: number;
  /** Requests whose price was unknown or only partly known; costUsd excludes their unknown parts. */
  costIncomplete: number;
  cost: CostParts;
  /** Net prompt-cache saving: read discounts minus write surcharges. */
  cacheSavedUsd: number;
  /** Requests priced by a long-context tier. */
  tieredRequests: number;
  durationMs: number;
  /** Generation time and output tokens of requests with output, after the first output arrived. */
  generationMs: number;
  generatedTokens: number;
  lastAt: number | null;
}

export interface CurrencyAmount { currency: string; amount: number }
export interface Percentiles { p50: number | null; p95: number | null }
export type SessionStatus = "active" | "sleeping" | "archived" | "deleted";

/**
 * A dimension value. Live workspace names win; recorded snapshots remain for deleted sessions, folders, providers, and plugins.
 * `other` collects groups beyond a series limit.
 */
export type TelemetryGroup =
  | { dimension: "model"; key: string; providerId: string; modelId: string; providerName: string }
  | { dimension: "provider"; key: string; providerId: string; providerName: string }
  | { dimension: "folder"; key: string; folderId: string | null; name: string | null; color: string | null; deleted: boolean }
  | { dimension: "session"; key: string; sessionId: string; title: string | null; status: SessionStatus; folderId: string | null; folderName: string | null; folderColor: string | null }
  | { dimension: "purpose"; key: string; pluginId: string; purposeId: string | null }
  | { dimension: "plugin"; key: string; pluginId: string; name: UiText | null }
  | { dimension: "thinking"; key: string; level: string | null }
  | { dimension: "error"; key: string; origin: string | null; code: string | null }
  | { dimension: "other"; key: string };

export interface TelemetryFacets {
  kind: "facets";
  firstEventAt: number | null;
  lastEventAt: number | null;
  folders: Extract<TelemetryGroup, { dimension: "folder" }>[];
  providers: Extract<TelemetryGroup, { dimension: "provider" }>[];
  models: Extract<TelemetryGroup, { dimension: "model" }>[];
  plugins: Extract<TelemetryGroup, { dimension: "plugin" }>[];
  purposes: Extract<TelemetryGroup, { dimension: "purpose" }>[];
  thinking: Extract<TelemetryGroup, { dimension: "thinking" }>[];
}
export interface ExternalTotals { usd: number; other: CurrencyAmount[]; count: number }
export interface TelemetrySummary {
  kind: "summary";
  metrics: UsageMetrics;
  sessions: number;
  activeDays: number;
  ttft: Percentiles;
  external: ExternalTotals;
  previous: { metrics: UsageMetrics; external: ExternalTotals } | null;
}
export interface SeriesPoint {
  key: string;
  start: number;
  metrics: UsageMetrics;
  /** Cost, tokens, and requests per group key. */
  groups: Record<string, { costUsd: number; totalTokens: number; requests: number }>;
}
export interface TelemetrySeries {
  kind: "series";
  granularity: typeof telemetryGranularities[number];
  groups: TelemetryGroup[];
  points: SeriesPoint[];
}
export interface BreakdownRow { group: TelemetryGroup; metrics: UsageMetrics; sessions: number; ttft: Percentiles | null }
export interface TelemetryBreakdown { kind: "breakdown"; dimension: TelemetryDimension; rows: BreakdownRow[]; total: number }
export interface TelemetryMatrix { kind: "matrix"; cells: { weekday: number; hour: number; requests: number; totalTokens: number; costUsd: number }[] }
export interface TelemetryDistribution { kind: "distribution"; field: "duration" | "ttft"; edges: readonly number[]; counts: number[] }
export interface TelemetryEvent {
  id: string;
  startedAt: number;
  durationMs: number | null;
  firstOutputMs: number | null;
  purpose: Extract<TelemetryGroup, { dimension: "purpose" }>;
  session: Extract<TelemetryGroup, { dimension: "session" }> | null;
  providerId: string;
  providerName: string;
  modelId: string;
  thinking: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  costUsd: number | null;
  costStatus: string;
  tierFromInputTokens: number | null;
  outcome: "completed" | "failed" | "cancelled";
  errorOrigin: string | null;
  errorCode: string | null;
  toolCalls: number;
}
export interface TelemetryEvents { kind: "events"; total: number; rows: TelemetryEvent[] }
export interface ToolRow {
  toolName: string | null;
  resourceKind: string | null;
  calls: number;
  succeeded: number;
  failed: number;
  rejected: number;
  cancelled: number;
  durationMs: number;
  duration: Percentiles;
}
export interface TelemetryTools { kind: "tools"; groupBy: "tool" | "resource"; rows: ToolRow[] }
export interface ExternalRow {
  pluginId: string;
  pluginName: UiText | null;
  category: string;
  provider: string | null;
  count: number;
  failed: number;
  quantity: number | null;
  unit: string | null;
  currency: string | null;
  amount: number | null;
}
export interface TelemetryExternal { kind: "external"; rows: ExternalRow[] }

export type TelemetryQueryResult = TelemetryFacets | TelemetrySummary | TelemetrySeries | TelemetryBreakdown | TelemetryMatrix
  | TelemetryDistribution | TelemetryEvents | TelemetryTools | TelemetryExternal;
export type QueryResultOf<Q extends TelemetryQuery> = Extract<TelemetryQueryResult, { kind: Q["kind"] }>;

export interface TelemetryExportReply { kind: "export"; format: "csv" | "json"; filename: string; content: string; rows: number }
export interface TelemetryClearReply { kind: "clear"; deleted: number }
export type TelemetryReply = { kind: "query"; result: TelemetryQueryResult } | TelemetryExportReply | TelemetryClearReply;

export type TelemetryResult =
  | { ok: true; reply: TelemetryReply }
  | { ok: false; error: AppError };

export interface TelemetryBridge {
  execute(command: TelemetryCommand): Promise<TelemetryResult>;
  /** Fires after new records or deletions, throttled by the runtime. */
  onChanged(listener: () => void): () => void;
}
