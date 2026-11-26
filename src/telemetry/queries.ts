import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import { usageRelations, usageSubjectKinds } from "@asterism-app/sdk/contracts";
import {
  distributionEdges, excludesExternalUsage, generationModelKind, modelKindSchema, type ModelKind, type BreakdownRow, type CurrencyAmount, type ExternalRow, type ExternalTotals, type Percentiles, type SeriesPoint,
  type TelemetryClearReply, type TelemetryDimension, type TelemetryEvent, type TelemetryExportReply, type TelemetryFacets, type TelemetryFilter,
  type TelemetryGroup, type TelemetryQuery, type TelemetryQueryResult, type ToolRow, type UsageMetrics, type SubjectRow, type SubjectMatch,
} from "../shared/telemetry.ts";
import { bucketKeys, bucketStart, localDateKey, type Granularity } from "../shared/telemetry-time.ts";
import type { WorkspaceLookup } from "./types.ts";

export class TelemetryError extends Error {
  constructor(readonly code: "invalid_request" | "unavailable", message: string) { super(message); }
}

/** Maximum filled buckets per series; callers choose a coarser granularity for longer ranges. */
const maxBuckets = 1_000;

interface Scope { sql: string; params: SQLInputValue[] }

/** Requests whose category generates output; generation-only fields and metrics read only these. */
const generationSql = `model_kind = '${generationModelKind}'`;
/** First output time, counted for generation requests only. */
const firstOutputSql = `(CASE WHEN ${generationSql} THEN first_output_ms END)`;

/** Local time expression for SQLite date functions: event milliseconds shifted by the caller's offset, as Unix seconds. */
const localTime = (column: string, offset: number) => `(${column} + ${Math.trunc(offset) * 60_000}) / 1000, 'unixepoch'`;

/** SQL bucket keys; they match `bucketKey` in telemetry-time.ts. */
export function bucketSql(column: string, granularity: Granularity, offset: number): string {
  const time = localTime(column, offset);
  if (granularity === "hour") return `strftime('%Y-%m-%d %H:00', ${time})`;
  if (granularity === "day") return `date(${time})`;
  if (granularity === "week") return `date(${time}, '-6 days', 'weekday 1')`;
  return `strftime('%Y-%m', ${time})`;
}

/** Both request filtering and subject aggregation match the same declaration fields. */
function subjectWhere(subject: SubjectMatch) {
  const clauses = ["s.kind = ?"];
  const params: SQLInputValue[] = [subject.kind];
  for (const [column, value] of [["subject_id", subject.id], ["source_id", subject.source], ["relation", subject.relation], ["declared_by", subject.declaredBy]] as const) {
    if (value === null) clauses.push(`s.${column} IS NULL`);
    else if (value !== undefined) { clauses.push(`s.${column} = ?`); params.push(value); }
  }
  if (subject.successfulTool) clauses.push("t.outcome = 'succeeded'");
  return { sql: clauses.join(" AND "), params };
}

/** Model events in the filter, each with its effective folder: the live session's folder, or the recorded one after deletion. */
function modelEvents(filter: TelemetryFilter, range: { from: number | null; to: number | null } = filter): Scope {
  const where: string[] = [];
  const params: SQLInputValue[] = [];
  const add = (sql: string, value?: SQLInputValue) => { where.push(sql); if (value !== undefined) params.push(value); };
  if (range.from !== null) add("e.started_at >= ?", range.from);
  if (range.to !== null) add("e.started_at < ?", range.to);
  if (filter.modelKind !== undefined) add("e.model_kind = ?", filter.modelKind);
  if (filter.providerId !== undefined) add("e.provider_id = ?", filter.providerId);
  if (filter.modelId !== undefined) add("e.model_id = ?", filter.modelId);
  if (filter.pluginId !== undefined) add("e.plugin_id = ?", filter.pluginId);
  if (filter.purposeId !== undefined) filter.purposeId === null ? add("e.purpose_id IS NULL") : add("e.purpose_id = ?", filter.purposeId);
  if (filter.thinking !== undefined) {
    add(`e.${generationSql}`);
    filter.thinking === null ? add("e.thinking IS NULL") : add("e.thinking = ?", filter.thinking);
  }
  if (filter.sessionId !== undefined) add("e.session_id = ?", filter.sessionId);
  if (filter.subject !== undefined) {
    const subject = subjectWhere(filter.subject);
    const tools = filter.subject.successfulTool ? " JOIN tool_usage_events t ON t.id = s.tool_event_id" : "";
    where.push(`EXISTS (SELECT 1 FROM usage_subjects s${tools} WHERE s.model_event_id = e.id AND ${subject.sql})`);
    params.push(...subject.params);
  }
  let sql = `SELECT e.*, CASE WHEN ls.id IS NULL THEN e.folder_id_snapshot ELSE ls.folder_id END AS folder_id
    FROM model_usage_events e LEFT JOIN temp.live_sessions ls ON ls.id = e.session_id${where.length ? ` WHERE ${where.join(" AND ")}` : ""}`;
  if (filter.folderId !== undefined) { sql = `SELECT * FROM (${sql}) WHERE folder_id IS ?`; params.push(filter.folderId); }
  return { sql: `ev AS (${sql})`, params };
}

/** External events in the filter; model-only dimensions select none of them. */
function externalEvents(filter: TelemetryFilter, range: { from: number | null; to: number | null } = filter): Scope | null {
  if (excludesExternalUsage(filter)) return null;
  const where: string[] = [];
  const params: SQLInputValue[] = [];
  if (range.from !== null) { where.push("x.recorded_at >= ?"); params.push(range.from); }
  if (range.to !== null) { where.push("x.recorded_at < ?"); params.push(range.to); }
  if (filter.pluginId !== undefined) { where.push("x.plugin_id = ?"); params.push(filter.pluginId); }
  if (filter.sessionId !== undefined) { where.push("x.session_id = ?"); params.push(filter.sessionId); }
  let sql = `SELECT x.*, CASE WHEN ls.id IS NULL THEN x.folder_id_snapshot ELSE ls.folder_id END AS folder_id
    FROM external_usage_events x LEFT JOIN temp.live_sessions ls ON ls.id = x.session_id${where.length ? ` WHERE ${where.join(" AND ")}` : ""}`;
  if (filter.folderId !== undefined) { sql = `SELECT * FROM (${sql}) WHERE folder_id IS ?`; params.push(filter.folderId); }
  return { sql: `xv AS (${sql})`, params };
}

const tokensSql = "COALESCE(total_tokens, COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0))";
const generatedSql = `${generationSql} AND output_tokens > 0 AND duration_ms > COALESCE(first_output_ms, 0)`;
/** Aggregates behind UsageMetrics; TOTAL yields 0 for empty groups while SUM keeps null for unpriced cost parts. */
const metricsSql = `COUNT(*) AS m_requests,
  TOTAL(outcome = 'completed') AS m_completed, TOTAL(outcome = 'failed') AS m_failed, TOTAL(outcome = 'cancelled') AS m_cancelled,
  TOTAL(input_tokens) AS m_input, TOTAL(output_tokens) AS m_output, TOTAL(reasoning_tokens) AS m_reasoning,
  TOTAL(cache_read_tokens) AS m_cache_read, TOTAL(cache_write_tokens) AS m_cache_write, TOTAL(${tokensSql}) AS m_total,
  TOTAL(cost_usd) AS m_cost, TOTAL(cost_status <> 'complete') AS m_cost_incomplete,
  SUM(cost_input_usd) AS m_cost_input, SUM(cost_cache_read_usd) AS m_cost_cache_read, SUM(cost_cache_write_usd) AS m_cost_cache_write,
  SUM(cost_output_usd) AS m_cost_output, SUM(cost_reasoning_usd) AS m_cost_reasoning,
  TOTAL(cache_saved_usd) AS m_cache_saved, TOTAL(tier_from_input_tokens IS NOT NULL) AS m_tiered, TOTAL(duration_ms) AS m_duration,
  TOTAL(CASE WHEN ${generatedSql} THEN duration_ms - COALESCE(first_output_ms, 0) END) AS m_generation_ms,
  TOTAL(CASE WHEN ${generatedSql} THEN output_tokens END) AS m_generated, MAX(started_at) AS m_last`;

type Row = Record<string, SQLInputValue>;
const num = (value: SQLInputValue | undefined) => typeof value === "number" ? value : typeof value === "bigint" ? Number(value) : 0;
const nullableNum = (value: SQLInputValue | undefined) => value === null || value === undefined ? null : num(value);
const text = (value: SQLInputValue | undefined) => typeof value === "string" ? value : null;

function readMetrics(row: Row): UsageMetrics {
  return {
    requests: num(row.m_requests), completed: num(row.m_completed), failed: num(row.m_failed), cancelled: num(row.m_cancelled),
    inputTokens: num(row.m_input), outputTokens: num(row.m_output), reasoningTokens: num(row.m_reasoning),
    cacheReadTokens: num(row.m_cache_read), cacheWriteTokens: num(row.m_cache_write), totalTokens: num(row.m_total),
    costUsd: num(row.m_cost), costIncomplete: num(row.m_cost_incomplete),
    cost: { input: nullableNum(row.m_cost_input), cacheRead: nullableNum(row.m_cost_cache_read), cacheWrite: nullableNum(row.m_cost_cache_write),
      output: nullableNum(row.m_cost_output), reasoning: nullableNum(row.m_cost_reasoning) },
    cacheSavedUsd: num(row.m_cache_saved), tieredRequests: num(row.m_tiered), durationMs: num(row.m_duration),
    generationMs: num(row.m_generation_ms), generatedTokens: num(row.m_generated), lastAt: nullableNum(row.m_last),
  };
}

/** p50/p95 by nearest rank, matching `ceil(p * n / 100)` with integer arithmetic. */
function percentileSql(value: string, partition: string | null, source: string): string {
  const over = partition ? `PARTITION BY ${partition} ` : "";
  const key = partition ? `${partition} AS k, ` : "";
  return `ranked AS (SELECT ${key}${value} AS v, ROW_NUMBER() OVER (${over}ORDER BY ${value}) AS rn, COUNT(*) OVER (${partition ? `PARTITION BY ${partition}` : ""}) AS n
      FROM ${source} WHERE ${value} IS NOT NULL)
    SELECT ${partition ? "k, " : ""}MAX(CASE WHEN rn = MAX(1, (n * 50 + 99) / 100) THEN v END) AS p50, MAX(CASE WHEN rn = MAX(1, (n * 95 + 99) / 100) THEN v END) AS p95
    FROM ranked${partition ? " GROUP BY k" : ""}`;
}

interface DimensionSpec { columns: readonly string[]; where?: string }
const dimensionSpecs: Record<TelemetryDimension, DimensionSpec> = {
  modelKind: { columns: ["model_kind"] },
  model: { columns: ["provider_id", "model_id", "model_kind"] },
  provider: { columns: ["provider_id", "model_kind"] },
  folder: { columns: ["folder_id"] },
  session: { columns: ["session_id"], where: "session_id IS NOT NULL" },
  purpose: { columns: ["plugin_id", "purpose_id"] },
  plugin: { columns: ["plugin_id"] },
  thinking: { columns: ["thinking"], where: generationSql },
  error: { columns: ["error_origin", "error_code"], where: "outcome = 'failed'" },
};
const dimensionSelect = (spec: DimensionSpec) => spec.columns.map((column, index) => `${column} AS d${index}`).join(", ");
const dimensionValues = (spec: DimensionSpec, row: Row) => spec.columns.map((_, index) => text(row[`d${index}`]));
const groupKey = (values: readonly (string | null)[]) => JSON.stringify(values);
const purposeGroup = (pluginId: string, purposeId: string | null): Extract<TelemetryGroup, { dimension: "purpose" }> =>
  ({ dimension: "purpose", key: groupKey([pluginId, purposeId]), pluginId, purposeId });
const otherGroup: TelemetryGroup = { dimension: "other", key: "other" };
const metricOrder = "m_cost DESC, m_total DESC, m_requests DESC";

/** Resolves dimension values to live names, falling back to the latest recorded snapshot. Snapshot maps load once per command. */
class Groups {
  private readonly cache = new Map<string, Map<string, Row>>();
  constructor(private readonly db: DatabaseSync, private readonly lookup: WorkspaceLookup) {}
  private snapshots(name: string, sql: string, key: (row: Row) => string): Map<string, Row> {
    let map = this.cache.get(name);
    if (!map) {
      map = new Map((this.db.prepare(sql).all() as Row[]).map(row => [key(row), row]));
      this.cache.set(name, map);
    }
    return map;
  }
  providerName(modelKind: ModelKind, providerId: string, recordedName?: string): string {
    return this.lookup.providerNames(modelKind).get(providerId) ?? recordedName ?? text(this.snapshots("provider",
      "SELECT model_kind, provider_id, provider_name_snapshot AS name, MAX(started_at) FROM model_usage_events GROUP BY model_kind, provider_id",
      row => groupKey([String(row.model_kind), String(row.provider_id)])).get(groupKey([modelKind, providerId]))?.name) ?? providerId;
  }
  folder(folderId: string | null): Extract<TelemetryGroup, { dimension: "folder" }> {
    const key = groupKey([folderId]);
    if (folderId === null) return { dimension: "folder", key, folderId, name: null, color: null, deleted: false };
    const live = this.lookup.folders().get(folderId);
    if (live) return { dimension: "folder", key, folderId, name: live.name, color: live.color, deleted: false };
    const recorded = this.snapshots("folder", `SELECT folder_id_snapshot AS id, folder_name_snapshot AS name, folder_color_snapshot AS color, MAX(started_at)
      FROM model_usage_events WHERE folder_id_snapshot IS NOT NULL GROUP BY folder_id_snapshot`, row => String(row.id)).get(folderId);
    return { dimension: "folder", key, folderId, name: text(recorded?.name), color: text(recorded?.color), deleted: true };
  }
  session(sessionId: string): Extract<TelemetryGroup, { dimension: "session" }> {
    const live = this.lookup.sessions().get(sessionId);
    const recorded = live ? undefined : this.snapshots("session", `SELECT session_id AS id, session_title_snapshot AS title, folder_id_snapshot AS folder, MAX(started_at)
      FROM model_usage_events WHERE session_id IS NOT NULL GROUP BY session_id`, row => String(row.id)).get(sessionId);
    const folder = this.folder(live ? live.folderId : text(recorded?.folder));
    return { dimension: "session", key: groupKey([sessionId]), sessionId, title: live?.title ?? text(recorded?.title), status: live?.status ?? "deleted",
      folderId: folder.folderId, folderName: folder.name, folderColor: folder.color };
  }
  resolve(dimension: TelemetryDimension, values: readonly (string | null)[]): TelemetryGroup {
    const key = groupKey(values);
    const [first = null, second = null, third = null] = values;
    switch (dimension) {
      case "modelKind": return { dimension, key, modelKind: modelKindSchema.parse(first) };
      case "model": {
        const modelKind = modelKindSchema.parse(third);
        return { dimension, key, modelKind, providerId: first!, modelId: second!, providerName: this.providerName(modelKind, first!) };
      }
      case "provider": {
        const modelKind = modelKindSchema.parse(second);
        return { dimension, key, modelKind, providerId: first!, providerName: this.providerName(modelKind, first!) };
      }
      case "folder": return this.folder(first);
      case "session": return this.session(first!);
      case "purpose": return purposeGroup(first!, second);
      case "plugin": return { dimension, key, pluginId: first!, name: this.lookup.pluginNames().get(first!) ?? null };
      case "thinking": return { dimension, key, level: first };
      case "error": return { dimension, key, origin: first, code: second };
    }
  }
}

/** One read over the ledger; rewrites the live session mirror so effective folders reflect the current workspace. */
export class TelemetryReader {
  private readonly groups: Groups;
  constructor(private readonly db: DatabaseSync, private readonly lookup: WorkspaceLookup, private readonly now = Date.now()) {
    this.groups = new Groups(db, lookup);
    db.exec("BEGIN; DELETE FROM temp.live_sessions;");
    try {
      const insert = db.prepare("INSERT INTO temp.live_sessions (id, folder_id) VALUES (?, ?)");
      for (const session of lookup.sessions().values()) insert.run(session.id, session.folderId);
      db.exec("COMMIT;");
    } catch (error) { db.exec("ROLLBACK;"); throw error; }
  }

  private all(scopes: readonly (Scope | null)[], body: string, ...params: SQLInputValue[]): Row[] {
    const present = scopes.filter((scope): scope is Scope => scope !== null);
    return this.db.prepare(`WITH ${present.map(scope => scope.sql).join(", ")} ${body}`)
      .all(...present.flatMap(scope => scope.params), ...params) as Row[];
  }

  query(filter: TelemetryFilter, query: TelemetryQuery): TelemetryQueryResult {
    switch (query.kind) {
      case "facets": return this.facets();
      case "summary": {
        const current = this.summary(filter, filter);
        const previous = query.compare ? this.summary(filter, query.compare) : null;
        return { kind: "summary", ...current, previous: previous && { metrics: previous.metrics, external: previous.external } };
      }
      case "series": return this.series(filter, query.granularity, query.groupBy, query.limit);
      case "breakdown": return this.breakdown(filter, query.dimension, query.limit, query.latency);
      case "matrix": return this.matrix(filter);
      case "distribution": return this.distribution(filter, query.field);
      case "events": return this.events(filter, query.offset, query.limit, query.only);
      case "tools": return this.tools(filter, query.groupBy);
      case "external": return this.external(filter);
      case "subjects": return this.subjects(filter, query.subject);
      case "subject-activity": return this.subjectActivity(filter, query.subject, query.granularity);
    }
  }

  private summary(filter: TelemetryFilter, range: { from: number | null; to: number | null }) {
    const scope = modelEvents(filter, range);
    const [row] = this.all([scope], `SELECT ${metricsSql}, COUNT(DISTINCT session_id) AS sessions,
      COUNT(DISTINCT ${bucketSql("started_at", "day", filter.utcOffsetMinutes)}) AS days FROM ev`);
    const [ttft] = this.all([scope], `, ${percentileSql(firstOutputSql, null, "ev")}`);
    return { metrics: readMetrics(row!), sessions: num(row!.sessions), activeDays: num(row!.days), ttft: percentiles(ttft), external: this.externalTotals(filter, range) };
  }

  private externalTotals(filter: TelemetryFilter, range: { from: number | null; to: number | null }): ExternalTotals {
    const scope = externalEvents(filter, range);
    if (!scope) return { usd: 0, other: [], count: 0 };
    const rows = this.all([scope], "SELECT UPPER(currency) AS currency, TOTAL(amount) AS amount, COUNT(*) AS count FROM xv GROUP BY UPPER(currency)");
    const other: CurrencyAmount[] = [];
    let usd = 0, count = 0;
    for (const row of rows) {
      count += num(row.count);
      const currency = text(row.currency);
      if (currency === "USD") usd += num(row.amount);
      else if (currency) other.push({ currency, amount: num(row.amount) });
    }
    return { usd, other, count };
  }

  private breakdownRows(filter: TelemetryFilter, dimension: TelemetryDimension, limit: number, latency: boolean): { rows: BreakdownRow[]; total: number } {
    const spec = dimensionSpecs[dimension];
    const scope = modelEvents(filter);
    const rows = this.all([scope], `SELECT ${dimensionSelect(spec)}, ${metricsSql}, COUNT(DISTINCT session_id) AS sessions, COUNT(*) OVER () AS groups
      FROM ev${spec.where ? ` WHERE ${spec.where}` : ""} GROUP BY ${spec.columns.join(", ")} ORDER BY ${metricOrder} LIMIT ?`, limit);
    const ttft = new Map<string, Percentiles>();
    if (latency && rows.length) {
      const partition = spec.columns.length === 1 ? spec.columns[0]! : `json_array(${spec.columns.join(", ")})`;
      const source = spec.where ? `(SELECT * FROM ev WHERE ${spec.where})` : "ev";
      for (const row of this.all([scope], `, ${percentileSql(firstOutputSql, partition, source)}`)) {
        const key = spec.columns.length === 1 ? groupKey([text(row.k)]) : String(row.k);
        ttft.set(key, percentiles(row));
      }
    }
    return {
      total: num(rows[0]?.groups),
      rows: rows.map(row => {
        const group = this.groups.resolve(dimension, dimensionValues(spec, row));
        return { group, metrics: readMetrics(row), sessions: num(row.sessions), ttft: latency ? ttft.get(group.key) ?? { p50: null, p95: null } : null };
      }),
    };
  }

  private breakdown(filter: TelemetryFilter, dimension: TelemetryDimension, limit: number, latency: boolean): TelemetryQueryResult {
    return { kind: "breakdown", dimension, ...this.breakdownRows(filter, dimension, limit, latency) };
  }

  private series(filter: TelemetryFilter, granularity: Granularity, groupBy: TelemetryDimension | null, limit: number): TelemetryQueryResult {
    const scope = modelEvents(filter);
    const bucket = bucketSql("started_at", granularity, filter.utcOffsetMinutes);
    const totals = this.all([scope], `SELECT ${bucket} AS bucket, MIN(started_at) AS first, ${metricsSql} FROM ev GROUP BY bucket`);
    // Open ranges start at the first recorded event in the filter.
    const start = filter.from ?? totals.reduce<number | null>((min, row) => min === null ? num(row.first) : Math.min(min, num(row.first)), null);
    const end = Math.max(filter.to ?? this.now, ...totals.map(row => num(row.m_last) + 1));
    const keys = start === null ? [] : bucketKeys(start, end, granularity, filter.utcOffsetMinutes);
    if (keys.length > maxBuckets) throw new TelemetryError("invalid_request", `The range has more than ${maxBuckets} ${granularity} buckets.`);
    const offset = filter.utcOffsetMinutes;
    const points = new Map<string, SeriesPoint>();
    const empty = readMetrics({});
    for (const key of keys) points.set(key, { key, start: bucketStart(key, granularity, offset), metrics: empty, groups: {} });
    for (const row of totals) {
      const key = String(row.bucket);
      points.set(key, { key, start: bucketStart(key, granularity, offset), metrics: readMetrics(row), groups: {} });
    }
    let groups: TelemetryGroup[] = [];
    if (groupBy) {
      const spec = dimensionSpecs[groupBy];
      const top = this.breakdownRows(filter, groupBy, limit, false);
      groups = top.rows.map(row => row.group);
      const included = new Set(groups.map(group => group.key));
      let other = false;
      for (const row of this.all([scope], `SELECT ${bucket} AS bucket, ${dimensionSelect(spec)}, TOTAL(cost_usd) AS cost, TOTAL(${tokensSql}) AS tokens, COUNT(*) AS requests
        FROM ev${spec.where ? ` WHERE ${spec.where}` : ""} GROUP BY bucket, ${spec.columns.join(", ")}`)) {
        const point = points.get(String(row.bucket));
        if (!point) continue;
        let key = groupKey(dimensionValues(spec, row));
        if (!included.has(key)) { key = otherGroup.key; other = true; }
        const entry = point.groups[key] ??= { costUsd: 0, totalTokens: 0, requests: 0 };
        entry.costUsd += num(row.cost); entry.totalTokens += num(row.tokens); entry.requests += num(row.requests);
      }
      if (other) groups.push(otherGroup);
    }
    return { kind: "series", granularity, groups, points: [...points.values()].sort((a, b) => a.key.localeCompare(b.key)) };
  }

  private matrix(filter: TelemetryFilter): TelemetryQueryResult {
    const time = localTime("started_at", filter.utcOffsetMinutes);
    const cells = this.all([modelEvents(filter)], `SELECT (CAST(strftime('%w', ${time}) AS INTEGER) + 6) % 7 AS weekday, CAST(strftime('%H', ${time}) AS INTEGER) AS hour,
      COUNT(*) AS requests, TOTAL(${tokensSql}) AS tokens, TOTAL(cost_usd) AS cost FROM ev GROUP BY weekday, hour`);
    return { kind: "matrix", cells: cells.map(row => ({ weekday: num(row.weekday), hour: num(row.hour), requests: num(row.requests), totalTokens: num(row.tokens), costUsd: num(row.cost) })) };
  }

  private distribution(filter: TelemetryFilter, field: "duration" | "ttft"): TelemetryQueryResult {
    const column = field === "duration" ? "duration_ms" : firstOutputSql;
    const edges = distributionEdges[field];
    const ranges = [`TOTAL(${column} < ${edges[0]})`, ...edges.slice(1).map((edge, index) => `TOTAL(${column} >= ${edges[index]} AND ${column} < ${edge})`),
      `TOTAL(${column} >= ${edges[edges.length - 1]})`];
    const [row] = this.all([modelEvents(filter)], `SELECT ${ranges.map((sql, index) => `${sql} AS c${index}`).join(", ")} FROM ev WHERE ${column} IS NOT NULL`);
    return { kind: "distribution", field, edges, counts: ranges.map((_, index) => num(row?.[`c${index}`])) };
  }

  private events(filter: TelemetryFilter, offset: number, limit: number, only: "all" | "failed" | "tiered"): TelemetryQueryResult {
    const where = only === "failed" ? " WHERE outcome = 'failed'" : only === "tiered" ? " WHERE tier_from_input_tokens IS NOT NULL" : "";
    const scope = modelEvents(filter);
    const rows = this.all([scope], `SELECT *, COUNT(*) OVER () AS total FROM ev${where} ORDER BY started_at DESC, id LIMIT ? OFFSET ?`, limit, offset);
    const total = rows.length ? num(rows[0]!.total) : offset ? num(this.all([scope], `SELECT COUNT(*) AS total FROM ev${where}`)[0]?.total) : 0;
    return { kind: "events", total, rows: rows.map(row => this.event(row)) };
  }

  private event(row: Row): TelemetryEvent {
    const sessionId = text(row.session_id), modelKind = modelKindSchema.parse(row.model_kind);
    return {
      id: String(row.id), startedAt: num(row.started_at), durationMs: nullableNum(row.duration_ms), firstOutputMs: nullableNum(row.first_output_ms),
      purpose: purposeGroup(String(row.plugin_id), text(row.purpose_id)),
      session: sessionId === null ? null : this.groups.session(sessionId),
      modelKind,
      providerId: String(row.provider_id), providerName: this.groups.providerName(modelKind, String(row.provider_id), String(row.provider_name_snapshot)),
      modelId: String(row.model_id), thinking: text(row.thinking),
      inputTokens: nullableNum(row.input_tokens), outputTokens: nullableNum(row.output_tokens), reasoningTokens: nullableNum(row.reasoning_tokens),
      cacheReadTokens: nullableNum(row.cache_read_tokens), cacheWriteTokens: nullableNum(row.cache_write_tokens),
      costUsd: nullableNum(row.cost_usd), costStatus: String(row.cost_status), tierFromInputTokens: nullableNum(row.tier_from_input_tokens),
      outcome: row.outcome as TelemetryEvent["outcome"], errorOrigin: text(row.error_origin), errorCode: text(row.error_code), toolCalls: num(row.tool_calls),
    };
  }

  private tools(filter: TelemetryFilter, groupBy: "tool" | "resource"): TelemetryQueryResult {
    const column = groupBy === "tool" ? "tool_name" : "resource_kind";
    const calls: Scope = { sql: `tv AS (SELECT t.* FROM tool_usage_events t JOIN ev ON ev.id = t.model_event_id WHERE t.${column} IS NOT NULL)`, params: [] };
    const scope = modelEvents(filter);
    const rows = this.all([scope, calls], `SELECT ${column} AS k, COUNT(*) AS calls, TOTAL(outcome IN ('succeeded', 'partial')) AS succeeded,
      TOTAL(outcome = 'failed') AS failed, TOTAL(outcome = 'rejected') AS rejected, TOTAL(outcome = 'cancelled') AS cancelled, TOTAL(duration_ms) AS duration
      FROM tv GROUP BY ${column} ORDER BY calls DESC, duration DESC`);
    const durations = new Map(this.all([scope, calls], `, ${percentileSql("duration_ms", column, "tv")}`).map(row => [text(row.k), percentiles(row)]));
    return { kind: "tools", groupBy, rows: rows.map((row): ToolRow => ({
      toolName: groupBy === "tool" ? text(row.k) : null, resourceKind: groupBy === "resource" ? text(row.k) : null,
      calls: num(row.calls), succeeded: num(row.succeeded), failed: num(row.failed), rejected: num(row.rejected), cancelled: num(row.cancelled),
      durationMs: num(row.duration), duration: durations.get(text(row.k)) ?? { p50: null, p95: null },
    })) };
  }

  private external(filter: TelemetryFilter): TelemetryQueryResult {
    const scope = externalEvents(filter);
    if (!scope) return { kind: "external", rows: [] };
    const rows = this.all([scope], `SELECT plugin_id, category, provider_label, unit, UPPER(currency) AS currency, COUNT(*) AS count, TOTAL(outcome = 'failed') AS failed,
      SUM(quantity) AS quantity, SUM(amount) AS amount FROM xv GROUP BY plugin_id, category, provider_label, unit, UPPER(currency) ORDER BY TOTAL(amount) DESC, count DESC`);
    const plugins = this.lookup.pluginNames();
    return { kind: "external", rows: rows.map((row): ExternalRow => ({
      pluginId: String(row.plugin_id), pluginName: plugins.get(String(row.plugin_id)) ?? null, category: String(row.category), provider: text(row.provider_label),
      count: num(row.count), failed: num(row.failed), quantity: nullableNum(row.quantity), unit: text(row.unit), currency: text(row.currency), amount: nullableNum(row.amount),
    })) };
  }

  private subjects(filter: TelemetryFilter, subject: SubjectMatch): TelemetryQueryResult {
    const match = subjectWhere(subject);
    const scope = [modelEvents(filter), { sql: `sv AS (SELECT s.*, ev.session_id, ev.started_at, t.outcome AS tool_outcome
      FROM usage_subjects s JOIN ev ON ev.id = s.model_event_id LEFT JOIN tool_usage_events t ON t.id = s.tool_event_id
      WHERE ${match.sql})`, params: match.params }];
    const totals = this.all(scope, `SELECT subject_id, source_id, COUNT(DISTINCT model_event_id) AS requests, SUM(quantity) AS quantity,
      COUNT(CASE WHEN tool_outcome = 'succeeded' THEN 1 END) AS succeeded,
      COUNT(CASE WHEN tool_outcome <> 'succeeded' THEN 1 END) AS failed,
      COUNT(DISTINCT CASE WHEN tool_outcome = 'succeeded' THEN session_id END) AS sessions,
      MAX(CASE WHEN tool_outcome = 'succeeded' THEN started_at END) AS last
      FROM sv GROUP BY subject_id, source_id ORDER BY sessions DESC, succeeded DESC, subject_id`);
    const rows: SubjectRow[] = totals.map(row => ({
      id: String(row.subject_id), source: text(row.source_id), requests: num(row.requests), quantity: nullableNum(row.quantity),
      successfulCalls: num(row.succeeded), failedCalls: num(row.failed), successfulSessions: num(row.sessions), lastSuccessfulAt: nullableNum(row.last),
    }));
    const [all] = this.all(scope, `SELECT COUNT(DISTINCT CASE WHEN tool_outcome = 'succeeded' THEN session_id END) AS sessions,
      MIN(started_at) AS first FROM sv`);
    return { kind: "subjects", rows, successfulSessions: num(all?.sessions), firstAt: nullableNum(all?.first) };
  }

  private subjectActivity(filter: TelemetryFilter, subject: SubjectMatch, granularity: Granularity): TelemetryQueryResult {
    const match = subjectWhere(subject);
    // Use the request's time and filters, but count each matching tool call once.
    const scope = [modelEvents(filter), { sql: `calls AS (
      SELECT ev.started_at, ev.session_id, ev.provider_id, ev.model_id, ev.model_kind, t.outcome, s.part AS file, u.subject_id AS role,
        CASE WHEN u.part IS NOT NULL THEN json_array(ev.session_id, u.source_id, u.part) END AS work_unit
      FROM usage_subjects s JOIN tool_usage_events t ON t.id = s.tool_event_id JOIN ev ON ev.id = s.model_event_id
      LEFT JOIN usage_subjects u ON u.id = (
        SELECT w.id FROM usage_subjects w WHERE w.model_event_id = ev.id AND w.tool_event_id IS NULL
          AND w.declared_by = s.declared_by AND w.kind = ? AND w.relation = ? LIMIT 1
      ) WHERE ${match.sql} GROUP BY t.id
    ), reads AS (SELECT * FROM calls WHERE outcome = 'succeeded')`, params: [usageSubjectKinds.workUnit, usageRelations.context, ...match.params] }];
    const [totals] = this.all(scope, `SELECT COUNT(DISTINCT work_unit) AS turns, COUNT(*) - COUNT(work_unit) AS unknown,
      COUNT(*) AS succeeded, COUNT(DISTINCT session_id) AS sessions, MIN(started_at) AS first, MAX(started_at) AS last,
      (SELECT COUNT(*) FROM calls WHERE outcome <> 'succeeded') AS failed FROM reads`);
    const buckets = this.all(scope, `SELECT ${bucketSql("started_at", granularity, filter.utcOffsetMinutes)} AS bucket, COUNT(*) AS count FROM reads GROUP BY bucket`);
    const counts = new Map(buckets.map(row => [String(row.bucket), num(row.count)]));
    const start = filter.from ?? nullableNum(totals?.first);
    const end = Math.max(filter.to ?? this.now, num(totals?.last) + 1);
    const keys = start === null ? [] : bucketKeys(start, end, granularity, filter.utcOffsetMinutes);
    if (keys.length > maxBuckets) throw new TelemetryError("invalid_request", `The range has more than ${maxBuckets} ${granularity} buckets.`);
    const labelRanks = (column: "file" | "role") => this.all(scope, `SELECT ${column} AS label, COUNT(*) AS count FROM reads
      GROUP BY ${column} ORDER BY count DESC, label LIMIT 8`).map(row => ({ label: text(row.label), calls: num(row.count) }));
    const groupRanks = (dimension: "session" | "model") => {
      const spec = dimensionSpecs[dimension];
      return this.all(scope, `SELECT ${dimensionSelect(spec)}, COUNT(*) AS count FROM reads${spec.where ? ` WHERE ${spec.where}` : ""}
        GROUP BY ${spec.columns.join(", ")} ORDER BY count DESC, ${spec.columns.join(", ")} LIMIT 8`)
        .map(row => ({ group: this.groups.resolve(dimension, dimensionValues(spec, row)), calls: num(row.count) }));
    };
    return { kind: "subject-activity", granularity,
      points: keys.map(key => ({ start: bucketStart(key, granularity, filter.utcOffsetMinutes), count: counts.get(key) ?? 0 })),
      successfulCalls: num(totals?.succeeded), failedCalls: num(totals?.failed), successfulSessions: num(totals?.sessions),
      lastSuccessfulAt: nullableNum(totals?.last), turns: num(totals?.turns), unknownTurns: num(totals?.unknown), roles: labelRanks("role"), files: labelRanks("file"),
      sessions: groupRanks("session"), models: groupRanks("model") };
  }

  private facets(): TelemetryFacets {
    const all = modelEvents({ from: null, to: null, utcOffsetMinutes: 0 });
    const distinct = (dimension: TelemetryDimension) => {
      const spec = dimensionSpecs[dimension];
      return this.all([all], `SELECT DISTINCT ${dimensionSelect(spec)} FROM ev${spec.where ? ` WHERE ${spec.where}` : ""}`)
        .map(row => this.groups.resolve(dimension, dimensionValues(spec, row)));
    };
    const [span] = this.all([all], "SELECT MIN(started_at) AS first, MAX(started_at) AS last FROM ev");
    const external = this.db.prepare("SELECT DISTINCT plugin_id FROM external_usage_events").all() as Row[];
    const plugins = new Set([...distinct("plugin").map(group => (group as Extract<TelemetryGroup, { dimension: "plugin" }>).pluginId), ...external.map(row => String(row.plugin_id))]);
    return {
      kind: "facets", firstEventAt: nullableNum(span?.first), lastEventAt: nullableNum(span?.last),
      folders: distinct("folder").filter(group => group.dimension === "folder" && group.folderId !== null) as TelemetryFacets["folders"],
      modelKinds: distinct("modelKind") as TelemetryFacets["modelKinds"],
      providers: distinct("provider") as TelemetryFacets["providers"],
      models: distinct("model") as TelemetryFacets["models"],
      plugins: [...plugins].map(id => this.groups.resolve("plugin", [id])) as TelemetryFacets["plugins"],
      purposes: distinct("purpose") as TelemetryFacets["purposes"],
      thinking: distinct("thinking") as TelemetryFacets["thinking"],
    };
  }

  export(filter: TelemetryFilter, format: "csv" | "json"): TelemetryExportReply {
    const rows = this.all([modelEvents(filter)], "SELECT * FROM ev ORDER BY started_at, id").map(row => {
      const event = this.event(row);
      const folder = this.groups.folder(text(row.folder_id));
      return {
        id: event.id, startedAt: new Date(event.startedAt).toISOString(), durationMs: event.durationMs, firstOutputMs: event.firstOutputMs,
        pluginId: event.purpose.pluginId, purposeId: event.purpose.purposeId,
        sessionId: event.session?.sessionId ?? null, sessionTitle: event.session?.title ?? null, folderId: folder.folderId, folderName: folder.name,
        modelKind: event.modelKind, providerId: event.providerId, providerName: event.providerName, modelId: event.modelId, thinking: event.thinking,
        inputTokens: event.inputTokens, outputTokens: event.outputTokens, reasoningTokens: event.reasoningTokens,
        cacheReadTokens: event.cacheReadTokens, cacheWriteTokens: event.cacheWriteTokens,
        costUsd: event.costUsd, costStatus: event.costStatus, cacheSavedUsd: nullableNum(row.cache_saved_usd), tierFromInputTokens: event.tierFromInputTokens,
        outcome: event.outcome, errorOrigin: event.errorOrigin, errorCode: event.errorCode, toolCalls: event.toolCalls,
      };
    });
    const filename = `asterism-usage-${localDateKey(this.now, filter.utcOffsetMinutes)}.${format}`;
    if (format === "json") return { kind: "export", format, filename, content: `${JSON.stringify(rows, null, 2)}\n`, rows: rows.length };
    const headers = rows.length ? Object.keys(rows[0]!) : [];
    const lines = [headers.join(","), ...rows.map(row => Object.values(row).map(csvCell).join(","))];
    return { kind: "export", format, filename, content: `${lines.join("\n")}\n`, rows: rows.length };
  }
}

function percentiles(row: Row | undefined): Percentiles {
  return { p50: nullableNum(row?.p50), p95: nullableNum(row?.p95) };
}

function csvCell(value: string | number | null): string {
  if (value === null) return "";
  const cell = String(value);
  return /[",\r\n]/u.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell;
}

/** Delete records that started before `before`, or every record; tool calls go with their model request. */
export function clearTelemetry(db: DatabaseSync, before: number | null): TelemetryClearReply {
  db.exec("BEGIN IMMEDIATE;");
  try {
    const bound = before === null ? "" : " WHERE started_at < ?";
    const params = before === null ? [] : [before];
    db.prepare(`DELETE FROM usage_subjects WHERE model_event_id IN (SELECT id FROM model_usage_events${bound})`).run(...params);
    db.prepare(`DELETE FROM tool_usage_events WHERE model_event_id IN (SELECT id FROM model_usage_events${bound})`).run(...params);
    const models = db.prepare(`DELETE FROM model_usage_events${bound}`).run(...params).changes;
    const external = db.prepare(`DELETE FROM external_usage_events${before === null ? "" : " WHERE recorded_at < ?"}`).run(...params).changes;
    db.exec("COMMIT;");
    return { kind: "clear", deleted: Number(models) + Number(external) };
  } catch (error) { db.exec("ROLLBACK;"); throw error; }
}
