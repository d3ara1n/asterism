import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { estimateCacheSavings, estimateUsageCost, type UiText } from "@asterism-app/sdk/contracts";
import type { ModelPurposeDeclaration } from "@asterism-app/sdk/runtime";
import { telemetryCommandSchema, type TelemetryReply } from "../shared/telemetry.ts";
import { openTelemetryDatabase } from "./storage.ts";
import {
  clearTelemetry,
  exportTelemetry,
  queryActivity,
  queryDrilldown,
  queryModels,
  queryOverview,
  queryProjects,
  queryTools,
  type PurposeRegistry,
} from "./queries.ts";
import type { ExternalUsageRecordInput, ModelUsageRecordInput, WorkspaceLookup } from "./types.ts";

export class TelemetryError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}

function defaultTextOf(label: UiText): string {
  return typeof label === "string" ? label : label.defaultMessage;
}

const emptyLookup: WorkspaceLookup = {
  folders: () => new Map(),
  sessions: () => new Map(),
  session: () => null,
  folder: () => null,
  pluginNames: () => new Map(),
  providerNames: () => new Map(),
};

export interface TelemetryServiceOptions {
  db?: DatabaseSync;
  lookup?: WorkspaceLookup;
  onChanged?: () => void;
  notifyThrottleMs?: number;
}

/**
 * Host-owned usage telemetry ledger and query engine backed by an independent SQLite database.
 * Recording is best-effort and never throws into model or tool execution paths.
 */
export class TelemetryService implements PurposeRegistry {
  private readonly db: DatabaseSync;
  private readonly lookup: WorkspaceLookup;
  private readonly onChanged: () => void;
  private readonly notifyThrottleMs: number;
  private readonly purposes = new Map<string, UiText>();
  private notifyTimer: ReturnType<typeof setTimeout> | undefined;
  private closed = false;

  constructor(root: string, options: TelemetryServiceOptions = {}) {
    this.db = options.db ?? openTelemetryDatabase(root);
    this.lookup = options.lookup ?? emptyLookup;
    this.onChanged = options.onChanged ?? (() => {});
    this.notifyThrottleMs = options.notifyThrottleMs ?? 500;
  }

  registerModelPurposes(pluginId: string, declarations: readonly ModelPurposeDeclaration[]): void {
    for (const item of declarations) {
      if (!item.id) continue;
      this.purposes.set(`${pluginId}::${item.id}`, item.label);
    }
  }

  label(pluginId: string, purposeId: string | null): UiText | null {
    if (!purposeId) return null;
    return this.purposes.get(`${pluginId}::${purposeId}`) ?? null;
  }

  fallback(pluginId: string, purposeId: string | null, snapshot: string | null, entryKind?: string): string {
    if (purposeId) {
      const live = this.purposes.get(`${pluginId}::${purposeId}`);
      if (live) return defaultTextOf(live);
      if (snapshot) return snapshot;
      return purposeId;
    }
    if (snapshot) return snapshot;
    if (entryKind === "execution") return "Execution";
    if (entryKind === "stream") return "Stream";
    return "Request";
  }

  private scheduleNotify(): void {
    if (this.closed || this.notifyTimer) return;
    if (this.notifyThrottleMs <= 0) { this.onChanged(); return; }
    this.notifyTimer = setTimeout(() => {
      this.notifyTimer = undefined;
      if (!this.closed) this.onChanged();
    }, this.notifyThrottleMs);
  }

  recordModelUsage(input: ModelUsageRecordInput): void {
    if (this.closed) return;
    try {
      const id = input.id ?? randomUUID();
      const session = input.sessionId ? this.lookup.session(input.sessionId) : null;
      const folder = session?.folderId ? this.lookup.folder(session.folderId) : null;
      const purposeLabel = input.purposeId ? this.purposes.get(`${input.pluginId}::${input.purposeId}`) : undefined;
      const purposeSnapshot = purposeLabel ? defaultTextOf(purposeLabel) : null;

      const estimate = estimateUsageCost(input.usage, input.cost, input.hasFiles);
      const cacheSaved = estimateCacheSavings(input.usage, input.cost, input.hasFiles);
      const lineAmount = (item: "input" | "cacheRead" | "cacheWrite" | "output" | "reasoning"): number | null => {
        const line = estimate.lines.find(entry => entry.modality === "text" && entry.item === item);
        return line ? line.amount : null;
      };

      const startedAt = Math.max(0, Math.round(input.startedAt));
      const endedAt = Math.max(startedAt, Math.round(input.endedAt));
      const durationMs = input.durationMs !== null && Number.isFinite(input.durationMs) ? Math.max(0, Math.round(input.durationMs)) : null;
      const firstOutputMs = input.firstOutputMs !== null && Number.isFinite(input.firstOutputMs) ? Math.max(0, Math.round(input.firstOutputMs)) : null;
      const firstTextMs = input.firstTextMs !== null && Number.isFinite(input.firstTextMs) ? Math.max(0, Math.round(input.firstTextMs)) : null;
      const firstReasoningMs = input.firstReasoningMs !== null && Number.isFinite(input.firstReasoningMs) ? Math.max(0, Math.round(input.firstReasoningMs)) : null;

      this.db.exec("BEGIN IMMEDIATE;");
      try {
        this.db.prepare(`INSERT OR REPLACE INTO model_usage_events (
          id, started_at, ended_at, duration_ms, first_output_ms, first_text_ms, first_reasoning_ms, output_chunks,
          plugin_id, entry_kind, resource_id, resource_kind,
          session_id, session_title_snapshot, folder_id_snapshot, folder_name_snapshot, folder_color_snapshot,
          purpose_id, purpose_label_snapshot,
          provider_id, provider_name_snapshot, model_id, protocol, thinking,
          input_tokens, output_tokens, total_tokens, reasoning_tokens, cache_read_tokens, cache_write_tokens,
          has_files, tool_call_count,
          cost_usd, cost_status, uncached_input_cost_usd, cache_read_cost_usd, cache_write_cost_usd, text_output_cost_usd, reasoning_cost_usd,
          tier_from_input_tokens, cache_saved_usd,
          outcome, finish_reason, error_origin, error_code
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, ?,
          ?, ?, ?, ?, ?, ?, ?,
          ?, ?,
          ?, ?, ?, ?
        )`).run(
          id, startedAt, endedAt, durationMs, firstOutputMs, firstTextMs, firstReasoningMs, input.outputChunks,
          input.pluginId, input.entryKind, input.resourceId, input.resourceKind,
          input.sessionId, session?.title ?? null, folder?.id ?? null, folder?.name ?? null, folder?.color ?? null,
          input.purposeId, purposeSnapshot,
          input.providerId, input.providerName, input.modelId, input.protocol, input.thinking,
          input.usage?.input ?? null, input.usage?.output ?? null, input.usage?.total ?? null,
          input.usage?.reasoning ?? null, input.usage?.cacheRead ?? null, input.usage?.cacheWrite ?? null,
          input.hasFiles ? 1 : 0, input.toolCallCount,
          estimate.amount, estimate.status,
          lineAmount("input"), lineAmount("cacheRead"), lineAmount("cacheWrite"), lineAmount("output"), lineAmount("reasoning"),
          estimate.fromInputTokens, cacheSaved,
          input.outcome, input.finishReason, input.errorOrigin, input.errorCode,
        );

        if (input.tools?.length) {
          const insertTool = this.db.prepare(`INSERT OR REPLACE INTO tool_usage_events (
            id, model_event_id, started_at, duration_ms, session_id, plugin_id,
            tool_name, implementation_id, target_resource_kind, outcome_kind, error_code
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
          for (const tool of input.tools) {
            insertTool.run(
              tool.id ?? randomUUID(), id, Math.max(0, Math.round(tool.startedAt)),
              tool.durationMs !== null && Number.isFinite(tool.durationMs) ? Math.max(0, Math.round(tool.durationMs)) : null,
              tool.sessionId, tool.pluginId, tool.toolName, tool.implementationId,
              tool.targetResourceKind, tool.outcomeKind, tool.errorCode,
            );
          }
        }
        this.db.exec("COMMIT;");
      } catch (error) {
        try { this.db.exec("ROLLBACK;"); } catch { /* ignore */ }
        throw error;
      }
      this.scheduleNotify();
    } catch (error) {
      console.error("Failed to record model usage telemetry.", error);
    }
  }

  recordExternalUsage(input: ExternalUsageRecordInput): void {
    if (this.closed) return;
    try {
      const session = input.sessionId ? this.lookup.session(input.sessionId) : null;
      this.db.prepare(`INSERT INTO external_usage_events (
        id, recorded_at, plugin_id, session_id, folder_id_snapshot,
        category, provider_label, quantity, unit, currency, amount, outcome, duration_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        randomUUID(), Math.max(0, Math.round(input.recordedAt)), input.pluginId, input.sessionId, session?.folderId ?? null,
        input.category, input.providerLabel, input.quantity, input.unit, input.currency, input.amount,
        input.outcome, input.durationMs !== null && Number.isFinite(input.durationMs) ? Math.max(0, Math.round(input.durationMs)) : null,
      );
      this.scheduleNotify();
    } catch (error) {
      console.error("Failed to record external usage telemetry.", error);
    }
  }

  execute(raw: unknown): TelemetryReply {
    if (this.closed) throw new TelemetryError("unavailable", "Telemetry service is closed.");
    const parsed = telemetryCommandSchema.safeParse(raw);
    if (!parsed.success) throw new TelemetryError("invalid_request", "Invalid telemetry command.");
    const cmd = parsed.data;
    switch (cmd.type) {
      case "overview": return queryOverview(this.db, cmd.filter, this.lookup, this);
      case "projects": return queryProjects(this.db, cmd.filter, this.lookup);
      case "models": return queryModels(this.db, cmd.filter, this.lookup);
      case "activity": return queryActivity(this.db, cmd.filter, this.lookup);
      case "tools": return queryTools(this.db, cmd.filter, this.lookup, this);
      case "drilldown": return queryDrilldown(this.db, cmd.filter, cmd.target, this.lookup, this, {
        eventLimit: cmd.eventLimit, eventOffset: cmd.eventOffset, eventFilter: cmd.eventFilter,
      });
      case "export": return exportTelemetry(this.db, cmd.filter, cmd.format, this.lookup, this);
      case "clear": {
        const reply = clearTelemetry(this.db, cmd.beforeTimestamp);
        this.scheduleNotify();
        return reply;
      }
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.notifyTimer) { clearTimeout(this.notifyTimer); this.notifyTimer = undefined; }
    try { this.db.close(); } catch { /* ignore */ }
  }
}
