import type { UiText } from "./i18n.ts";

/** Plugin-declared model call purpose; requests pass its id as `purpose`, and usage statistics group and label them by it. */
export interface ModelPurposeDeclaration {
  readonly id: string;
  readonly label: UiText;
}

export type ExternalUsageOutcome = "succeeded" | "failed" | "cancelled";

/**
 * Non-model metered usage, such as a web search fee, kept in the host usage ledger. Requests are grouped by category and provider;
 * `amount` in `currency` is a cost, and `quantity` in `unit` is a count. sessionId attributes the usage to a session's folder.
 */
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

/** Usage reporting; a failed write is logged by the host and never reaches the caller. */
export interface TelemetryServices {
  recordExternalUsage(record: ExternalUsageRecord): void;
}
