import type { ModelCost, UiText, Usage } from "@asterism-app/sdk/contracts";
import type { ExternalUsageOutcome } from "@asterism-app/sdk/runtime";
import type { ModelKind, SessionStatus } from "../shared/telemetry.ts";

/** A subject declared by a plugin for a model request or one of its tool calls, with the declaring plugin stamped by the host. */
export interface UsageSubjectRecord {
  kind: string;
  id: string;
  source: string | null;
  relation: string;
  part: string | null;
  quantity: number | null;
  declaredBy: string;
}

/** One tool call settled inside an execution request. */
export interface ToolUsageRecord {
  startedAt: number;
  durationMs: number | null;
  toolName: string;
  implementationId: string | null;
  resourceKind: string | null;
  outcome: string;
  errorCode: string | null;
  /** Subjects the tool declared while it ran. */
  subjects: readonly UsageSubjectRecord[];
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
  modelKind: ModelKind;
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
  /** Subjects the requesting plugin declared for the request itself. */
  subjects: readonly UsageSubjectRecord[];
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
  providerNames(modelKind: ModelKind): ReadonlyMap<string, string>;
  pluginNames(): ReadonlyMap<string, UiText | null>;
}

/** Recording side of the usage ledger, shared with plugin contexts and model services. */
export interface UsageRecorder {
  recordModelUsage(record: ModelUsageRecord): void;
  recordExternalUsage(record: ExternalUsageRecord): void;
}
/** Hosts composed without a ledger, such as isolated tests, record nothing. */
export const noUsageRecorder: UsageRecorder = { recordModelUsage() {}, recordExternalUsage() {} };
