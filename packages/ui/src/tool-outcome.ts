import type { ToolCompletion, UiText } from "@asterism-app/sdk/contracts";
import { toolsMessages } from "./messages/tools";
import type { StatusTone } from "./ui/status";

export type ToolOutcomeKind = ToolCompletion["kind"];

/** Shared names for the six terminal tool outcomes. */
export const toolOutcomeLabels: Record<ToolOutcomeKind, UiText> = {
  succeeded: toolsMessages.toolOutcomeSucceeded,
  partial: toolsMessages.toolOutcomePartial,
  failed: toolsMessages.toolOutcomeFailed,
  rejected: toolsMessages.toolOutcomeRejected,
  cancelled: toolsMessages.toolOutcomeCancelled,
  unknown: toolsMessages.toolOutcomeUnknown,
};

/** Rejection, failure, and unknown effects read as errors; partial output is a warning; success and cancellation stay neutral. */
export function toolOutcomeTone(kind: ToolOutcomeKind): StatusTone {
  return kind === "failed" || kind === "rejected" || kind === "unknown" ? "error" : kind === "partial" ? "warning" : "neutral";
}
