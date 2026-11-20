import type { UiText } from "./i18n.ts";

/** Plugin-declared model call purpose for host telemetry grouping and localized display. */
export interface ModelPurposeDeclaration {
  readonly id: string;
  readonly label: UiText;
}

export type ExternalUsageOutcome = "succeeded" | "failed" | "cancelled";

/** Non-model metered usage or external API cost (for example web search or media generation) reported to host telemetry. */
export interface ExternalUsageRecord {
  readonly category: string;
  readonly provider?: string;
  readonly sessionId?: string | null;
  readonly quantity?: number | null;
  readonly unit?: string | null;
  readonly currency?: string | null;
  readonly amount?: number | null;
  readonly outcome?: ExternalUsageOutcome;
  readonly durationMs?: number | null;
  readonly recordedAt?: number;
}

/** Best-effort host telemetry reporting; storage errors are absorbed without interrupting plugin work. */
export interface TelemetryServices {
  recordExternalUsage(record: ExternalUsageRecord): void;
}
