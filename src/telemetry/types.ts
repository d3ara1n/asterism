import type { ModelCost, UiText, Usage } from "@asterism-app/sdk/contracts";
import type { ExternalUsageOutcome, ModelPurposeDeclaration } from "@asterism-app/sdk/runtime";
import type { SessionStatus } from "../shared/telemetry.ts";

/** One tool call settled inside an execution request. */
export interface ToolUsageRecord {
  startedAt: number;
  durationMs: number | null;
  toolName: string;
  implementationId: string | null;
  resourceKind: string | null;
  outcome: string;
  errorCode: string | null;
}

/** One settled model request, with the configured price used to estimate its cost. */
export interface ModelUsageRecord {
  id: string;
  startedAt: number;
  durationMs: number | null;
  firstOutputMs: number | null;
  pluginId: string;
  purposeId: string | null;
  sessionId: string | null;
  providerId: string;
  providerName: string;
  modelId: string;
  thinking: string | null;
  usage: Usage | null;
  cost: ModelCost | null;
  hasFiles: boolean;
  outcome: "completed" | "failed" | "cancelled";
  errorOrigin: string | null;
  errorCode: string | null;
  tools: readonly ToolUsageRecord[];
}

export interface ExternalUsageRecord {
  recordedAt: number;
  pluginId: string;
  sessionId: string | null;
  category: string;
  providerLabel: string | null;
  quantity: number | null;
  unit: string | null;
  currency: string | null;
  amount: number | null;
  outcome: ExternalUsageOutcome;
  durationMs: number | null;
}

export interface LiveFolder { id: string; name: string; color: string }
export interface LiveSession { id: string; title: string; folderId: string | null; status: Exclude<SessionStatus, "deleted"> }

/** Current workspace names and membership; read at recording time for snapshots and at query time for grouping. */
export interface WorkspaceLookup {
  folders(): ReadonlyMap<string, LiveFolder>;
  /** Every session still in the workspace, including archived ones. */
  sessions(): ReadonlyMap<string, LiveSession>;
  session(id: string): LiveSession | null;
  providerNames(): ReadonlyMap<string, string>;
  pluginNames(): ReadonlyMap<string, UiText | null>;
}

/** Recording side of the usage ledger, shared with plugin contexts and model services. */
export interface UsageRecorder {
  registerPurposes(pluginId: string, declarations: readonly ModelPurposeDeclaration[]): void;
  recordModelUsage(record: ModelUsageRecord): void;
  recordExternalUsage(record: ExternalUsageRecord): void;
}
/** Hosts composed without a ledger, such as isolated tests, record nothing. */
export const noUsageRecorder: UsageRecorder = { registerPurposes() {}, recordModelUsage() {}, recordExternalUsage() {} };

/** Plugin-declared purpose labels, registered as plugins load. */
export interface PurposeLabels {
  label(pluginId: string, purposeId: string): UiText | null;
}
