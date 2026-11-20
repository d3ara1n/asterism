import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { modelCostSchema } from "@asterism-app/sdk/contracts";
import { openTelemetryDatabase, telemetryDatabasePath } from "./storage.ts";
import { TelemetryService } from "./service.ts";
import { bucketForTimestamp, localDateKey, percentile } from "./queries.ts";
import type { LiveFolderInfo, LiveSessionInfo, WorkspaceLookup } from "./types.ts";

const roots: string[] = [];
function tempRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), "asterism-telemetry-"));
  roots.push(dir);
  return dir;
}

afterEach(() => {
  while (roots.length) {
    try { rmSync(roots.pop()!, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

const price = (amount: number) => ({ amount, unit: "token" as const, per: 1_000_000 });
const claudeCost = modelCostSchema.parse({
  currency: "USD",
  rates: { text: { input: price(3), cacheRead: price(0.3), cacheWrite: price(3.75), output: price(15) } },
  tiers: [{ fromInputTokens: 200_000, rates: { text: { input: price(6), cacheRead: price(0.6), cacheWrite: price(7.5), output: price(22.5) } } }],
});

describe("Telemetry storage and quarantine", () => {
  it("initializes cleanly and quarantines corrupt database files without throwing", () => {
    const root = tempRoot();
    const file = telemetryDatabasePath(root);
    mkdirSync(join(root, "telemetry"), { recursive: true });
    writeFileSync(file, "not a sqlite file");

    const db = openTelemetryDatabase(root);
    try {
      const row = db.prepare("SELECT COUNT(*) AS count FROM model_usage_events").get() as { count: number };
      expect(row.count).toBe(0);
    } finally {
      db.close();
    }
  });
});

describe("Telemetry timezone bucketing and percentiles", () => {
  it("buckets timestamps using the user's local UTC offset rather than UTC midnight", () => {
    // 2026-03-10T17:30:00Z is 2026-03-11 01:30 in UTC+8 (+480) and 2026-03-10 12:30 in UTC-5 (-300).
    const ts = Date.UTC(2026, 2, 10, 17, 30, 0);
    expect(localDateKey(ts, 480)).toBe("2026-03-11");
    expect(localDateKey(ts, -300)).toBe("2026-03-10");
    expect(bucketForTimestamp(ts, "hour", 480).bucket).toBe("2026-03-11 01:00");
    expect(bucketForTimestamp(ts, "day", 480).bucket).toBe("2026-03-11");
    expect(percentile([100, 500, 200, 400, 300], 50)).toBe(300);
    expect(percentile([100, 500, 200, 400, 300], 95)).toBe(500);
    expect(percentile([], 50)).toBeNull();
  });
});

describe("TelemetryService recording, cross-DB live enrichment, and aggregations", () => {
  it("aggregates overview, projects, models, activity, tools, drilldown, export, and clear accurately", () => {
    const root = tempRoot();
    const liveFolders = new Map<string, LiveFolderInfo>([
      ["f-work", { id: "f-work", name: "Work", color: "blue" }],
      ["f-oss", { id: "f-oss", name: "Open Source", color: "green" }],
    ]);
    const liveSessions = new Map<string, LiveSessionInfo>([
      ["s-1", { id: "s-1", title: "Refactor runtime", folderId: "f-work", status: "active", completed: false }],
      ["s-2", { id: "s-2", title: "Deleted later", folderId: "f-oss", status: "active", completed: false }],
    ]);
    const lookup: WorkspaceLookup = {
      folders: () => liveFolders,
      sessions: () => liveSessions,
      session: id => liveSessions.get(id) ?? null,
      folder: id => liveFolders.get(id) ?? null,
      pluginNames: () => new Map([["asterism.builtin", "Built-in"]]),
      providerNames: () => new Map([["p-anth", "Anthropic"]]),
    };

    const service = new TelemetryService(root, { lookup, notifyThrottleMs: 0 });
    try {
      service.registerModelPurposes("asterism.builtin", [
        { id: "conversation", label: "Conversation" },
        { id: "subagent", label: "Subagent" },
      ]);

      const t1 = Date.UTC(2026, 2, 10, 10, 0, 0);
      const t2 = Date.UTC(2026, 2, 11, 14, 0, 0);

      service.recordModelUsage({
        startedAt: t1, endedAt: t1 + 4000, durationMs: 4000, firstOutputMs: 800, firstTextMs: 900, firstReasoningMs: null, outputChunks: 20,
        pluginId: "asterism.builtin", entryKind: "execution", resourceId: "a-1", resourceKind: "asterism.builtin/agent",
        sessionId: "s-1", purposeId: "conversation",
        providerId: "p-anth", providerName: "Anthropic", modelId: "claude-sonnet", protocol: "anthropic", thinking: "medium",
        usage: { input: 100_000, output: 10_000, total: 110_000, reasoning: 2_000, cacheRead: 80_000, cacheWrite: 10_000 },
        cost: claudeCost, hasFiles: false, toolCallCount: 2, outcome: "completed", finishReason: "tool-calls", errorOrigin: null, errorCode: null,
        tools: [
          { startedAt: t1 + 2000, durationMs: 120, sessionId: "s-1", pluginId: "asterism.builtin", toolName: "read", implementationId: "asterism.builtin/directory.read", targetResourceKind: "asterism.builtin/directory", outcomeKind: "succeeded", errorCode: null },
          { startedAt: t1 + 2200, durationMs: 350, sessionId: "s-1", pluginId: "asterism.builtin", toolName: "exec", implementationId: "asterism.builtin/directory.exec", targetResourceKind: "asterism.builtin/directory", outcomeKind: "failed", errorCode: "command_failed" },
        ],
      });

      // Trigger long-context tier (>= 200K input) on s-2
      service.recordModelUsage({
        startedAt: t2, endedAt: t2 + 6000, durationMs: 6000, firstOutputMs: 1200, firstTextMs: 1200, firstReasoningMs: null, outputChunks: 40,
        pluginId: "asterism.builtin", entryKind: "execution", resourceId: "p-1", resourceKind: "asterism.builtin/subagent-pool",
        sessionId: "s-2", purposeId: "subagent",
        providerId: "p-anth", providerName: "Anthropic", modelId: "claude-sonnet", protocol: "anthropic", thinking: "high",
        usage: { input: 250_000, output: 20_000, total: 270_000, reasoning: 5_000, cacheRead: 100_000, cacheWrite: 0 },
        cost: claudeCost, hasFiles: false, toolCallCount: 0, outcome: "failed", finishReason: null, errorOrigin: "model", errorCode: "rate_limit",
      });

      service.recordExternalUsage({
        recordedAt: t1 + 5000, pluginId: "asterism.builtin", sessionId: "s-1",
        category: "web.search", providerLabel: "exa", quantity: 1, unit: "request", currency: "USD", amount: 0.005, outcome: "succeeded", durationMs: 600,
      });

      // Simulate renaming folder f-work and deleting session s-2 from workspace.db:
      // s-1 should pick up renamed folder live; s-2 should retain snapshot folder and show deleted status.
      liveFolders.set("f-work", { id: "f-work", name: "Core Engineering", color: "violet" });
      liveSessions.delete("s-2");

      const filter = { from: null, to: null, utcOffsetMinutes: 0 };

      const overview = service.execute({ type: "overview", filter });
      expect(overview.kind).toBe("overview");
      if (overview.kind !== "overview") return;
      expect(overview.hasAnyData).toBe(true);
      expect(overview.summary.requests).toBe(2);
      expect(overview.summary.completed).toBe(1);
      expect(overview.summary.failed).toBe(1);
      expect(overview.summary.tieredRequests).toBe(1);
      expect(overview.summary.externalCostUsd).toBeCloseTo(0.005, 6);
      expect(overview.summary.cacheSavedUsd).toBeGreaterThan(0);
      expect(overview.topFolders.find(f => f.folderId === "f-work")?.name).toBe("Core Engineering");
      expect(overview.topSessions.find(s => s.sessionId === "s-2")).toMatchObject({ deleted: true, title: "Deleted later", folderId: "f-oss" });

      const projects = service.execute({ type: "projects", filter });
      expect(projects.kind).toBe("projects");
      if (projects.kind === "projects") {
        expect(projects.tieredSummary.requests).toBe(1);
        expect(projects.tieredSummary.affectedSessions).toBe(1);
      }

      const models = service.execute({ type: "models", filter });
      expect(models.kind).toBe("models");
      if (models.kind === "models") {
        expect(models.models).toHaveLength(1);
        expect(models.thinkingLevels.map(t => t.level)).toEqual(["medium", "high"]);
      }

      const tools = service.execute({ type: "tools", filter });
      expect(tools.kind).toBe("tools");
      if (tools.kind === "tools") {
        expect(tools.tools).toHaveLength(2);
        expect(tools.resourceKinds[0]).toMatchObject({ kind: "asterism.builtin/directory", calls: 2, succeeded: 1, failed: 1 });
        expect(tools.externalUsage[0]).toMatchObject({ category: "web.search", provider: "exa", totalAmount: 0.005 });
      }

      const drill = service.execute({
        type: "drilldown",
        filter,
        target: { kind: "model", providerId: "p-anth", modelId: "claude-sonnet" },
        eventFilter: "failed",
      });
      expect(drill.kind).toBe("drilldown");
      if (drill.kind === "drilldown") {
        expect(drill.errorBreakdown).toEqual([{ code: "rate_limit", origin: "model", count: 1 }]);
        expect(drill.events).toHaveLength(1);
        expect(drill.events[0]?.errorCode).toBe("rate_limit");
      }

      const csv = service.execute({ type: "export", filter, format: "csv" });
      expect(csv.kind).toBe("export");
      if (csv.kind === "export") {
        expect(csv.rowCount).toBe(2);
        expect(csv.content.split("\n").length).toBe(3);
      }

      const cleared = service.execute({ type: "clear", beforeTimestamp: t2 });
      expect(cleared.kind).toBe("clear");
      if (cleared.kind === "clear") {
        expect(cleared.deletedModelEvents).toBe(1);
        expect(cleared.deletedToolEvents).toBe(2);
        expect(cleared.deletedExternalEvents).toBe(1);
      }
    } finally {
      service.close();
    }
  });
});
