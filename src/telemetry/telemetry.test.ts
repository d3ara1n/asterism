import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { modelCostSchema, type Usage } from "@asterism-app/sdk/contracts";
import { bucketKey, bucketKeys, dateKeyStart } from "../shared/telemetry-time.ts";
import type { QueryResultOf, TelemetryFilter, TelemetryQuery } from "../shared/telemetry.ts";
import { bucketSql } from "./queries.ts";
import { TelemetryService } from "./service.ts";
import { openTelemetryDatabase } from "./storage.ts";
import { telemetryDatabasePath, telemetryDatabaseVersion } from "../storage/formats.ts";
import { telemetryStorage } from "../storage/migrations/telemetry.ts";
import type { LiveFolder, LiveSession, ModelUsageRecord, UsageSubjectRecord, WorkspaceLookup } from "./types.ts";
import { DatabaseSync } from "node:sqlite";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function root(): string {
  const dir = mkdtempSync(join(tmpdir(), "asterism-telemetry-"));
  roots.push(dir);
  return dir;
}

const price = (amount: number) => ({ amount, unit: "token" as const, per: 1_000_000 });
const cost = modelCostSchema.parse({ currency: "USD", rates: { text: { input: price(3), cacheRead: price(0.3), cacheWrite: price(3.75), output: price(15) } }, tiers: [] });
const usage = (input: number, output: number, extra: Partial<Usage> = {}): Usage =>
  ({ input, output, total: input + output, reasoning: null, cacheRead: 0, cacheWrite: 0, ...extra });

function workspace() {
  const folders = new Map<string, LiveFolder>();
  const sessions = new Map<string, LiveSession>();
  const lookup: WorkspaceLookup = {
    folders: () => folders, sessions: () => sessions, session: id => sessions.get(id) ?? null,
    providerNames: kind => new Map(kind === "language" ? [["p", "Provider"]] : []), pluginNames: () => new Map(),
  };
  return { folders, sessions, lookup };
}
let sequence = 0;
function record(overrides: Partial<ModelUsageRecord>): ModelUsageRecord {
  return {
    id: `r${++sequence}`, startedAt: 0, durationMs: 1_000, firstOutputMs: 200, pluginId: "plugin", purposeId: null, sessionId: null,
    modelKind: "language", providerId: "p", providerName: "Provider", modelId: "m", thinking: null, usage: usage(100, 10), cost, hasFiles: false,
    outcome: "completed", errorOrigin: null, errorCode: null, tools: [], subjects: [], ...overrides,
  };
}
const everything: TelemetryFilter = { from: null, to: null, utcOffsetMinutes: 0 };
function query<Q extends TelemetryQuery>(service: TelemetryService, query: Q, filter: TelemetryFilter = everything): QueryResultOf<Q> {
  const reply = service.execute({ type: "query", filter, query }, Date.UTC(2026, 2, 20));
  if (reply.kind !== "query" || reply.result.kind !== query.kind) throw new Error("Unexpected reply.");
  return reply.result as QueryResultOf<Q>;
}

describe("Usage time buckets", () => {
  it("assigns every timestamp to the same bucket in SQLite and in the renderer", () => {
    const db = openTelemetryDatabase(root());
    try {
      // Hours either side of local midnight, Sundays and Mondays, month ends, and offsets on both sides of UTC.
      const times = [Date.UTC(2026, 0, 4, 23, 30), Date.UTC(2026, 0, 5, 0, 30), Date.UTC(2026, 1, 28, 16, 5), Date.UTC(2026, 2, 1, 15, 59), Date.UTC(2025, 11, 31, 23, 59)];
      for (const offset of [-300, 0, 330, 480, 840]) for (const granularity of ["hour", "day", "week", "month"] as const) for (const at of times) {
        const sql = (db.prepare(`SELECT ${bucketSql("?", granularity, offset)} AS key`).get(at) as { key: string }).key;
        expect(sql, `${granularity} ${offset} ${new Date(at).toISOString()}`).toBe(bucketKey(at, granularity, offset));
      }
    } finally { db.close(); }
  });

  it("enumerates contiguous buckets over a range that starts mid-bucket", () => {
    const offset = 480;
    const from = dateKeyStart("2026-03-09", offset) + 3 * 3_600_000;
    expect(bucketKeys(from, dateKeyStart("2026-03-12", offset), "day", offset)).toEqual(["2026-03-09", "2026-03-10", "2026-03-11"]);
    // 2026-03-09 is a Monday; the range reaches into the following week.
    expect(bucketKeys(from, dateKeyStart("2026-03-17", offset), "week", offset)).toEqual(["2026-03-09", "2026-03-16"]);
    expect(bucketKeys(from, dateKeyStart("2026-05-02", offset), "month", offset)).toEqual(["2026-03", "2026-04", "2026-05"]);
  });
});

describe("Usage ledger queries", () => {
  it("keeps raw purposes scoped to their plugins and ignores legacy labels", () => {
    const directory = root();
    const service = new TelemetryService(directory, workspace().lookup);
    try {
      const legacy = record({ purposeId: "naming" });
      service.recordModelUsage(legacy);
      service.recordModelUsage(record({ pluginId: "other", purposeId: "naming" }));
      service.recordModelUsage(record({ purposeId: "Naming" }));
      service.recordModelUsage(record({}));
      const db = openTelemetryDatabase(directory);
      try {
        db.prepare("UPDATE model_usage_events SET purpose_label_snapshot = ? WHERE id = ?").run("Session naming", legacy.id);
      } finally { db.close(); }

      const group = { dimension: "purpose", key: '["plugin","naming"]', pluginId: "plugin", purposeId: "naming" };
      const { purposes } = query(service, { kind: "facets" });
      expect(purposes).toHaveLength(4);
      expect(purposes).toContainEqual(group);
      const filter = { ...everything, pluginId: "plugin", purposeId: "naming" };
      const { rows } = query(service, { kind: "events", offset: 0, limit: 10, only: "all" }, filter);
      expect(rows.map(row => [row.id, row.purpose])).toEqual([[legacy.id, group]]);

      const exported = service.execute({ type: "export", filter, format: "json" });
      if (exported.kind !== "export") throw new Error("Unexpected reply.");
      expect(exported.rows).toBe(1);
      expect(JSON.parse(exported.content)).toEqual([expect.objectContaining({ id: legacy.id, purposeId: "naming" })]);
      expect(exported.content).not.toContain("Session naming");
    } finally { service.close(); }
  });

  it("groups by the current folder of live sessions and the recorded folder of deleted ones", () => {
    const { folders, sessions, lookup } = workspace();
    folders.set("work", { id: "work", name: "Work", color: "blue" });
    folders.set("oss", { id: "oss", name: "Open source", color: "green" });
    sessions.set("moved", { id: "moved", title: "Moved", folderId: "work", status: "active" });
    sessions.set("gone", { id: "gone", title: "Gone", folderId: "oss", status: "active" });
    const service = new TelemetryService(root(), lookup);
    try {
      service.recordModelUsage(record({ sessionId: "moved" }));
      service.recordModelUsage(record({ sessionId: "gone" }));
      // After recording: one session moves out of its folder, the other session and its folder are deleted.
      sessions.set("moved", { id: "moved", title: "Moved", folderId: null, status: "sleeping" });
      sessions.delete("gone");
      folders.delete("oss");

      const byFolder = query(service, { kind: "breakdown", dimension: "folder", limit: 10, latency: false });
      expect(byFolder.rows.map(row => row.group)).toEqual(expect.arrayContaining([
        expect.objectContaining({ folderId: null, name: null, deleted: false }),
        expect.objectContaining({ folderId: "oss", name: "Open source", color: "green", deleted: true }),
      ]));
      expect(query(service, { kind: "summary", compare: null }, { ...everything, folderId: "work" }).metrics.requests).toBe(0);
      const bySession = query(service, { kind: "breakdown", dimension: "session", limit: 10, latency: false }, { ...everything, folderId: "oss" });
      expect(bySession.rows.map(row => row.group)).toEqual([expect.objectContaining({ sessionId: "gone", title: "Gone", status: "deleted", folderName: "Open source" })]);
    } finally { service.close(); }
  });

  it("computes nearest-rank time-to-first-output percentiles per group", () => {
    const service = new TelemetryService(root(), workspace().lookup);
    try {
      for (const firstOutputMs of [100, 500, 200, 400, 300]) service.recordModelUsage(record({ modelId: "a", firstOutputMs }));
      service.recordModelUsage(record({ modelId: "b", firstOutputMs: null }));
      const rows = query(service, { kind: "breakdown", dimension: "model", limit: 10, latency: true }).rows;
      expect(rows.find(row => row.group.key === JSON.stringify(["p", "a", "language"]))?.ttft).toEqual({ p50: 300, p95: 500 });
      expect(rows.find(row => row.group.key === JSON.stringify(["p", "b", "language"]))?.ttft).toEqual({ p50: null, p95: null });
    } finally { service.close(); }
  });

  it("sums priced parts, generation speed inputs, and cache savings without counting unknown prices as zero", () => {
    const service = new TelemetryService(root(), workspace().lookup);
    try {
      service.recordModelUsage(record({ usage: usage(1_000_000, 100_000, { cacheRead: 800_000 }), durationMs: 3_000, firstOutputMs: 1_000 }));
      service.recordModelUsage(record({ cost: null, usage: usage(10, 0), durationMs: 500, firstOutputMs: null }));
      const { metrics } = query(service, { kind: "summary", compare: null });
      // Uncached input 0.2M × $3, cache reads 0.8M × $0.3, output 0.1M × $15.
      expect(metrics.cost.input).toBeCloseTo(0.6);
      expect(metrics.cost.cacheRead).toBeCloseTo(0.24);
      expect(metrics.cost.output).toBeCloseTo(1.5);
      // Part sums cover priced requests only; the unpriced request adds nothing to them.
      expect(metrics.cost.cacheWrite).toBe(0);
      expect(metrics.costUsd).toBeCloseTo(2.34);
      expect(metrics.costIncomplete).toBe(1);
      expect(metrics.cacheSavedUsd).toBeCloseTo(0.8 * 2.7);
      // Only the request with output contributes generation time after its first output.
      expect([metrics.generatedTokens, metrics.generationMs]).toEqual([100_000, 2_000]);
    } finally { service.close(); }
  });

  it("fills empty buckets and folds groups beyond the limit into one remainder", () => {
    const service = new TelemetryService(root(), workspace().lookup);
    try {
      const day = (date: string, hour: number) => dateKeyStart(date, 0) + hour * 3_600_000;
      service.recordModelUsage(record({ modelId: "big", startedAt: day("2026-03-01", 9), usage: usage(1_000_000, 0) }));
      service.recordModelUsage(record({ modelId: "small", startedAt: day("2026-03-03", 9) }));
      service.recordModelUsage(record({ modelId: "tiny", startedAt: day("2026-03-03", 10), usage: usage(1, 0) }));
      const series = query(service, { kind: "series", granularity: "day", groupBy: "model", limit: 1 },
        { from: dateKeyStart("2026-03-01", 0), to: dateKeyStart("2026-03-04", 0), utcOffsetMinutes: 0 });
      expect(series.points.map(point => [point.key, point.metrics.requests])).toEqual([["2026-03-01", 1], ["2026-03-02", 0], ["2026-03-03", 2]]);
      expect(series.groups.map(group => group.key)).toEqual([JSON.stringify(["p", "big", "language"]), "other"]);
      expect(series.points[2]!.groups.other).toMatchObject({ requests: 2 });
    } finally { service.close(); }
  });

  it("excludes plugin-reported usage when a model dimension narrows the filter", () => {
    const service = new TelemetryService(root(), workspace().lookup);
    try {
      service.recordExternalUsage({ recordedAt: 0, pluginId: "plugin", sessionId: null, category: "web.search", providerLabel: null,
        quantity: 1, unit: "request", currency: "usd", amount: 0.01, outcome: "succeeded", durationMs: null });
      expect(query(service, { kind: "summary", compare: null }).external).toEqual({ usd: 0.01, other: [], count: 1 });
      expect(query(service, { kind: "summary", compare: null }, { ...everything, providerId: "p" }).external.count).toBe(0);
    } finally { service.close(); }
  });

  it("selects a model ID across every provider that served it", () => {
    const service = new TelemetryService(root(), workspace().lookup);
    try {
      service.recordModelUsage(record({ providerId: "p", providerName: "Provider", modelId: "shared" }));
      service.recordModelUsage(record({ providerId: "q", providerName: "Relay", modelId: "shared" }));
      service.recordModelUsage(record({ providerId: "q", providerName: "Relay", modelId: "other" }));
      // Grouping keeps connections apart, so one ID still reports each provider that served it.
      const rows = query(service, { kind: "breakdown", dimension: "model", limit: 10, latency: false }, { ...everything, modelId: "shared" }).rows;
      expect(rows.map(row => row.group.dimension === "model" && [row.group.providerId, row.metrics.requests]).sort()).toEqual([["p", 1], ["q", 1]]);
      expect(query(service, { kind: "summary", compare: null }, { ...everything, modelId: "shared" }).metrics.requests).toBe(2);
      // A provider narrows independently, with or without a model.
      expect(query(service, { kind: "summary", compare: null }, { ...everything, providerId: "q", modelId: "shared" }).metrics.requests).toBe(1);
      expect(query(service, { kind: "summary", compare: null }, { ...everything, providerId: "q" }).metrics.requests).toBe(2);
    } finally { service.close(); }
  });

  it("clears records before a time together with the tool calls and subjects of cleared requests", () => {
    const service = new TelemetryService(root(), workspace().lookup);
    try {
      const tool = { durationMs: 5, toolName: "read", implementationId: null, resourceKind: "directory", outcome: "succeeded", errorCode: null, subjects: [] };
      const read = skill("read", "a");
      service.recordModelUsage(record({ startedAt: 1_000, tools: [{ ...tool, startedAt: 1_100, subjects: [read] }] }));
      service.recordModelUsage(record({ startedAt: 5_000, tools: [{ ...tool, startedAt: 900 }], subjects: [skill("referenced", "b")] }));
      expect(service.execute({ type: "clear", before: 2_000 })).toEqual({ kind: "clear", deleted: 1 });
      // The remaining request keeps its tool call even though the call's own timestamp precedes the bound.
      expect(query(service, { kind: "tools", groupBy: "tool" }).rows.map(row => row.calls)).toEqual([1]);
      expect(query(service, { kind: "subjects", subject: { kind: "skill" } }).rows.map(row => row.id)).toEqual(["b"]);
    } finally { service.close(); }
  });
});

const skill = (relation: string, id: string, extra: Partial<UsageSubjectRecord> = {}): UsageSubjectRecord =>
  ({ kind: "skill", id, source: "/user", relation, part: null, quantity: null, declaredBy: "plugin", ...extra });
const readCall = (subjects: UsageSubjectRecord[], outcome = "succeeded") =>
  ({ startedAt: 0, durationMs: 1, toolName: "skill_read", implementationId: null, resourceKind: null, outcome, errorCode: null, subjects });

describe("Declared usage subjects", () => {
  it("separates successful reads from failed attempts, historical references, and other owners", () => {
    const service = new TelemetryService(root(), workspace().lookup);
    try {
      service.recordModelUsage(record({ sessionId: "s1", startedAt: 100, tools: [readCall([skill("read", "a", { part: "SKILL.md" })])] }));
      service.recordModelUsage(record({ sessionId: "s1", startedAt: 200, tools: [readCall([skill("read", "a", { part: "guide.md" })])] }));
      service.recordModelUsage(record({ sessionId: "s2", startedAt: 300, tools: [readCall([skill("read", "a", { part: "missing.md" })], "rejected")] }));
      service.recordModelUsage(record({ sessionId: "s3", startedAt: 400, subjects: [skill("referenced", "b")] }));
      service.recordModelUsage(record({ sessionId: "s4", startedAt: 500, tools: [readCall([skill("read", "a", { declaredBy: "other" })])] }));
      const subject = { kind: "skill", relation: "read", declaredBy: "plugin" };
      const result = query(service, { kind: "subjects", subject });
      expect(result.successfulSessions).toBe(1);
      expect(result.rows).toEqual([{ id: "a", source: "/user", requests: 3, quantity: null,
        successfulCalls: 2, failedCalls: 1, successfulSessions: 1, lastSuccessfulAt: 200 }]);
      const hits = query(service, { kind: "summary", compare: null }, { ...everything, subject: { ...subject, id: "a", source: "/user", successfulTool: true } });
      expect(hits.metrics.requests).toBe(2);
      service.recordModelUsage(record({ startedAt: 50, tools: [readCall([skill("read", "failed-only")], "rejected")] }));
      const overview = query(service, { kind: "subjects", subject: { ...subject, successfulTool: true } });
      expect(overview.rows.map(row => [row.id, row.successfulCalls])).toEqual([["a", 2]]);
      expect(overview.firstAt).toBe(100);
    } finally { service.close(); }
  });

  it("ranks successful calls rather than requests and counts independent Agent turns", () => {
    const service = new TelemetryService(root(), workspace().lookup);
    try {
      const day = 86_400_000;
      const turn = (source: string, part: string) => skill("context", "worker", { kind: "work-unit", source, part });
      const doc = skill("read", "a", { part: "SKILL.md" });
      const notes = skill("read", "a", { part: "notes.md" });
      // Three calls in one request, another request in the same turn, and the same role in a different Agent.
      service.recordModelUsage(record({ sessionId: "s1", modelId: "x", startedAt: 100, subjects: [turn("agent-a", "turn-1")],
        tools: [readCall([doc, doc]), readCall([doc]), readCall([notes])] }));
      service.recordModelUsage(record({ sessionId: "s1", modelId: "x", startedAt: 200, subjects: [turn("agent-a", "turn-1")], tools: [readCall([doc])] }));
      service.recordModelUsage(record({ sessionId: "s1", modelId: "y", startedAt: day + 100, subjects: [turn("agent-b", "turn-1")], tools: [readCall([notes])] }));
      // Older records still count, but only the owner of a read can describe its work unit.
      service.recordModelUsage(record({ sessionId: "s2", modelId: "y", startedAt: day + 200,
        subjects: [{ ...turn("other", "foreign"), declaredBy: "different-plugin" }],
        tools: [readCall([doc]), readCall([skill("read", "a", { part: "missing.md" })], "rejected"), readCall([skill("read", "b")])] }));
      const activity = query(service, { kind: "subject-activity", subject: { kind: "skill", id: "a", source: "/user", relation: "read", declaredBy: "plugin" }, granularity: "day" },
        { ...everything, from: 0, to: 3 * day });
      expect(activity).toMatchObject({ successfulCalls: 6, failedCalls: 1, successfulSessions: 2, turns: 2, unknownTurns: 1,
        points: [{ start: 0, count: 4 }, { start: day, count: 2 }, { start: 2 * day, count: 0 }],
        roles: [{ label: "worker", calls: 5 }, { label: null, calls: 1 }],
        files: [{ label: "SKILL.md", calls: 4 }, { label: "notes.md", calls: 2 }],
      });
      expect(activity.models.map(({ group, calls }) => [group.key, calls])).toEqual([[JSON.stringify(["p", "x", "language"]), 4], [JSON.stringify(["p", "y", "language"]), 2]]);
      expect(activity.sessions.map(({ group, calls }) => [group.key, calls])).toEqual([[JSON.stringify(["s1"]), 5], [JSON.stringify(["s2"]), 1]]);
    } finally { service.close(); }
  });

  it("narrows every query to requests that declared a subject and excludes plugin-reported usage", () => {
    const service = new TelemetryService(root(), workspace().lookup);
    try {
      service.recordModelUsage(record({ modelId: "x", tools: [readCall([skill("read", "a")])] }));
      service.recordModelUsage(record({ modelId: "y", subjects: [skill("referenced", "a")] }));
      service.recordModelUsage(record({ modelId: "z" }));
      service.recordExternalUsage({ recordedAt: 0, pluginId: "plugin", sessionId: null, category: "web.search", providerLabel: null,
        quantity: 1, unit: "request", currency: "usd", amount: 0.01, outcome: "succeeded", durationMs: null });
      const subject = { kind: "skill", id: "a" };
      const models = (filter: TelemetryFilter) => query(service, { kind: "breakdown", dimension: "model", limit: 10, latency: false }, filter).rows.map(row => row.group.key).sort();
      expect(models({ ...everything, subject })).toEqual([JSON.stringify(["p", "x", "language"]), JSON.stringify(["p", "y", "language"])]);
      expect(models({ ...everything, subject: { ...subject, relation: "read" } })).toEqual([JSON.stringify(["p", "x", "language"])]);
      expect(models({ ...everything, subject: { ...subject, source: null } })).toEqual([]);
      expect(query(service, { kind: "summary", compare: null }, { ...everything, subject }).external.count).toBe(0);
    } finally { service.close(); }
  });

  it("preserves historical usage while migrating a version 1 ledger to model categories", () => {
    const directory = root();
    const service = new TelemetryService(directory, workspace().lookup);
    service.recordModelUsage(record({ id: "kept" }));
    service.close();
    const db = new DatabaseSync(telemetryDatabasePath(directory));
    db.exec("DROP TABLE usage_subjects; DROP INDEX model_usage_model; ALTER TABLE model_usage_events DROP COLUMN model_kind; CREATE INDEX model_usage_model ON model_usage_events(provider_id, model_id, started_at); PRAGMA user_version = 1;");
    db.close();
    const plan = telemetryStorage(directory).inspect();
    expect(plan?.change).toEqual({ id: "telemetry", from: 1, to: telemetryDatabaseVersion });
    plan!.apply();
    const migrated = new TelemetryService(directory, workspace().lookup);
    try {
      expect(query(migrated, { kind: "events", offset: 0, limit: 20, only: "all" }).rows)
        .toMatchObject([{ id: "kept", modelKind: "language", inputTokens: 100 }]);
      migrated.recordModelUsage(record({ subjects: [skill("referenced", "a")] }));
      expect(query(migrated, { kind: "summary", compare: null }).metrics.requests).toBe(2);
      expect(query(migrated, { kind: "subjects", subject: { kind: "skill" } }).rows).toHaveLength(1);
    } finally { migrated.close(); }
  });

  it("keeps the same provider and model IDs separate across model categories", () => {
    const service = new TelemetryService(root(), workspace().lookup);
    try {
      service.recordModelUsage(record({ id: "generate" }));
      service.recordModelUsage(record({ id: "evaluate", modelKind: "decision", providerName: "Decision endpoint", firstOutputMs: null }));
      const facets = query(service, { kind: "facets" });
      expect(facets.models).toEqual(expect.arrayContaining([
        expect.objectContaining({ modelKind: "language", modelId: "m", providerName: "Provider" }),
        expect.objectContaining({ modelKind: "decision", modelId: "m", providerName: "Decision endpoint" }),
      ]));
      expect(new Set(facets.models.map(group => group.key)).size).toBe(2);
      const events = { kind: "events", offset: 0, limit: 20, only: "all" } as const;
      expect(query(service, events, { ...everything, modelKind: "decision", providerId: "p", modelId: "m" }).rows)
        .toMatchObject([{ id: "evaluate", modelKind: "decision", providerName: "Decision endpoint" }]);
      expect(query(service, events, { ...everything, thinking: null }).rows).toMatchObject([{ id: "generate", modelKind: "language" }]);
    } finally { service.close(); }
  });

  it("counts generation timing and speed for language requests only", () => {
    const service = new TelemetryService(root(), workspace().lookup);
    try {
      // 10 output tokens over 800 ms after a 200 ms first output.
      service.recordModelUsage(record({ id: "generate" }));
      // A decision response that reports output tokens and a first-output time is not generation.
      service.recordModelUsage(record({ id: "evaluate", modelKind: "decision", durationMs: 5_000, firstOutputMs: 4_000, usage: usage(100, 50) }));
      const summary = query(service, { kind: "summary", compare: null });
      expect(summary.metrics).toMatchObject({ requests: 2, generationMs: 800, generatedTokens: 10, durationMs: 6_000 });
      expect(summary.ttft).toEqual({ p50: 200, p95: 200 });
      expect(query(service, { kind: "distribution", field: "ttft" }).counts.reduce((sum, count) => sum + count, 0)).toBe(1);
      const rows = query(service, { kind: "breakdown", dimension: "model", limit: 10, latency: true }).rows;
      expect(rows.find(row => row.group.dimension === "model" && row.group.modelKind === "decision")?.ttft).toEqual({ p50: null, p95: null });
    } finally { service.close(); }
  });
});
