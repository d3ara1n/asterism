import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { estimateCacheSavings, estimateUsageCost, type UiText } from "@asterism-app/sdk/contracts";
import type { ModelPurposeDeclaration } from "@asterism-app/sdk/runtime";
import { telemetryCommandSchema, type TelemetryReply } from "../shared/telemetry.ts";
import { openTelemetryDatabase } from "./storage.ts";
import { clearTelemetry, TelemetryError, TelemetryReader } from "./queries.ts";
import type { ExternalUsageRecord, ModelUsageRecord, PurposeLabels, UsageRecorder, WorkspaceLookup } from "./types.ts";

export { TelemetryError };

const defaultText = (label: UiText) => typeof label === "string" ? label : label.defaultMessage;
const milliseconds = (value: number | null) => value === null || !Number.isFinite(value) ? null : Math.max(0, Math.round(value));

/**
 * Host usage ledger. Recording happens when model requests settle and never interrupts them: a failed write is logged and dropped.
 * Reads aggregate in SQLite and attach current workspace names; change notifications are throttled for live views.
 */
export class TelemetryService implements UsageRecorder, PurposeLabels {
  private readonly db: DatabaseSync;
  private readonly purposes = new Map<string, UiText>();
  private notifyTimer: ReturnType<typeof setTimeout> | undefined;
  private closed = false;

  constructor(root: string, private readonly lookup: WorkspaceLookup, private readonly onChanged: () => void = () => {},
    private readonly notifyThrottleMs = 1_000) {
    this.db = openTelemetryDatabase(root);
  }

  registerPurposes(pluginId: string, declarations: readonly ModelPurposeDeclaration[]): void {
    for (const item of declarations) this.purposes.set(`${pluginId}\n${item.id}`, item.label);
  }
  label(pluginId: string, purposeId: string): UiText | null {
    return this.purposes.get(`${pluginId}\n${purposeId}`) ?? null;
  }

  private changed(): void {
    if (this.closed || this.notifyTimer) return;
    this.notifyTimer = setTimeout(() => { this.notifyTimer = undefined; if (!this.closed) this.onChanged(); }, this.notifyThrottleMs);
  }

  recordModelUsage(record: ModelUsageRecord): void {
    if (this.closed) return;
    try {
      const session = record.sessionId ? this.lookup.session(record.sessionId) : null;
      const folder = session?.folderId ? this.lookup.folders().get(session.folderId) ?? null : null;
      const purpose = record.purposeId ? this.label(record.pluginId, record.purposeId) : null;
      const estimate = estimateUsageCost(record.usage, record.cost, record.hasFiles);
      const line = (item: "input" | "cacheRead" | "cacheWrite" | "output" | "reasoning") =>
        estimate.lines.find(entry => entry.modality === "text" && entry.item === item)?.amount ?? null;
      const usage = record.usage;
      this.db.exec("BEGIN IMMEDIATE;");
      try {
        this.db.prepare(`INSERT INTO model_usage_events (id, started_at, duration_ms, first_output_ms, plugin_id, purpose_id, purpose_label_snapshot,
          session_id, session_title_snapshot, folder_id_snapshot, folder_name_snapshot, folder_color_snapshot,
          provider_id, provider_name_snapshot, model_id, thinking,
          input_tokens, output_tokens, total_tokens, reasoning_tokens, cache_read_tokens, cache_write_tokens, tool_calls,
          cost_usd, cost_status, cost_input_usd, cost_cache_read_usd, cost_cache_write_usd, cost_output_usd, cost_reasoning_usd,
          cache_saved_usd, tier_from_input_tokens, outcome, error_origin, error_code)
          VALUES (${Array(35).fill("?").join(", ")})`).run(
          record.id, Math.max(0, Math.round(record.startedAt)), milliseconds(record.durationMs), milliseconds(record.firstOutputMs),
          record.pluginId, record.purposeId, purpose ? defaultText(purpose) : null,
          record.sessionId, session?.title ?? null, session?.folderId ?? null, folder?.name ?? null, folder?.color ?? null,
          record.providerId, record.providerName, record.modelId, record.thinking,
          usage?.input ?? null, usage?.output ?? null, usage?.total ?? null, usage?.reasoning ?? null, usage?.cacheRead ?? null, usage?.cacheWrite ?? null,
          record.tools.length,
          estimate.amount, estimate.status, line("input"), line("cacheRead"), line("cacheWrite"), line("output"), line("reasoning"),
          estimateCacheSavings(record.usage, record.cost, record.hasFiles), estimate.fromInputTokens,
          record.outcome, record.errorOrigin, record.errorCode,
        );
        const tool = this.db.prepare(`INSERT INTO tool_usage_events (id, model_event_id, started_at, duration_ms, tool_name, implementation_id, resource_kind, outcome, error_code)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        for (const call of record.tools) tool.run(randomUUID(), record.id, Math.max(0, Math.round(call.startedAt)), milliseconds(call.durationMs),
          call.toolName, call.implementationId, call.resourceKind, call.outcome, call.errorCode);
        this.db.exec("COMMIT;");
      } catch (error) { this.db.exec("ROLLBACK;"); throw error; }
      this.changed();
    } catch (error) {
      console.error("Model usage could not be recorded.", error);
    }
  }

  recordExternalUsage(record: ExternalUsageRecord): void {
    if (this.closed) return;
    try {
      const session = record.sessionId ? this.lookup.session(record.sessionId) : null;
      this.db.prepare(`INSERT INTO external_usage_events (id, recorded_at, plugin_id, session_id, folder_id_snapshot, category, provider_label,
        quantity, unit, currency, amount, outcome, duration_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        randomUUID(), Math.max(0, Math.round(record.recordedAt)), record.pluginId, record.sessionId, session?.folderId ?? null, record.category,
        record.providerLabel, record.quantity, record.unit, record.currency, record.amount, record.outcome, milliseconds(record.durationMs));
      this.changed();
    } catch (error) {
      console.error("External usage could not be recorded.", error);
    }
  }

  execute(raw: unknown, now = Date.now()): TelemetryReply {
    if (this.closed) throw new TelemetryError("unavailable", "The usage ledger is closed.");
    const parsed = telemetryCommandSchema.safeParse(raw);
    if (!parsed.success) throw new TelemetryError("invalid_request", "Invalid usage statistics command.");
    const command = parsed.data;
    if (command.type === "clear") {
      const reply = clearTelemetry(this.db, command.before);
      this.changed();
      return reply;
    }
    const reader = new TelemetryReader(this.db, this.lookup, this, now);
    if (command.type === "export") return reader.export(command.filter, command.format);
    return { kind: "query", result: reader.query(command.filter, command.query) };
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this.notifyTimer);
    this.db.close();
  }
}
