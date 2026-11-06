import { defineMessages, pluginNamespace } from "@asterism-app/sdk/contracts";
export const toolsMessages = pluginNamespace("asterism.host").messages("en", defineMessages({
  toolNoOutput: { id: "tools.output.empty", defaultMessage: "No output was produced." },
  toolOutcomeSucceeded: { id: "tools.outcome.succeeded", defaultMessage: "Completed" },
  toolOutcomePartial: { id: "tools.outcome.partial", defaultMessage: "Partially completed" },
  toolOutcomeFailed: { id: "tools.outcome.failed", defaultMessage: "Failed" },
  toolOutcomeRejected: { id: "tools.outcome.rejected", defaultMessage: "Rejected" },
  toolOutcomeCancelled: { id: "tools.outcome.cancelled", defaultMessage: "Cancelled" },
  toolOutcomeUnknown: { id: "tools.outcome.unknown", defaultMessage: "Outcome unknown" },
}));
