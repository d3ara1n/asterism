import type { ModelCost, UiText, Usage } from "@asterism-app/sdk/contracts";
import type { ExternalUsageOutcome } from "@asterism-app/sdk/runtime";

export interface ToolUsageRecordInput {
  id?: string;
  startedAt: number;
  durationMs: number | null;
  sessionId: string | null;
  pluginId: string;
  toolName: string;
  implementationId: string | null;
  targetResourceKind: string | null;
  outcomeKind: string;
  errorCode: string | null;
}

export interface ModelUsageRecordInput {
  id?: string;
  startedAt: number;
  endedAt: number;
  durationMs: number | null;
  firstOutputMs: number | null;
  firstTextMs: number | null;
  firstReasoningMs: number | null;
  outputChunks: number | null;
  pluginId: string;
  entryKind: "execution" | "run" | "stream";
  resourceId: string | null;
  resourceKind: string | null;
  sessionId: string | null;
  purposeId: string | null;
  providerId: string;
  providerName: string;
  modelId: string;
  protocol: string | null;
  thinking: string | null;
  usage: Usage | null;
  cost: ModelCost | null;
  hasFiles: boolean;
  toolCallCount: number;
  outcome: "completed" | "failed" | "cancelled";
  finishReason: string | null;
  errorOrigin: string | null;
  errorCode: string | null;
  tools?: readonly ToolUsageRecordInput[];
}

export interface ExternalUsageRecordInput {
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

export interface LiveFolderInfo {
  id: string;
  name: string;
  color: string;
}

export interface LiveSessionInfo {
  id: string;
  title: string;
  folderId: string | null;
  status: "active" | "sleeping" | "archived";
  completed: boolean;
}

export interface WorkspaceLookup {
  folders(): ReadonlyMap<string, LiveFolderInfo>;
  sessions(): ReadonlyMap<string, LiveSessionInfo>;
  session(id: string): LiveSessionInfo | null;
  folder(id: string): LiveFolderInfo | null;
  pluginNames(): ReadonlyMap<string, UiText | null>;
  providerNames(): ReadonlyMap<string, string>;
}
