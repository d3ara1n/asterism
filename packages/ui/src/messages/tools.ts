import { defineMessages, pluginNamespace } from "@asterism-app/sdk/contracts";
export const toolsMessages = pluginNamespace("asterism.host").messages("en", defineMessages({
  toolNoOutput: { id: "toolNoOutput", defaultMessage: "No output was produced." },
  toolOutcomeSucceeded: { id: "toolOutcomeSucceeded", defaultMessage: "Completed" },
  toolOutcomePartial: { id: "toolOutcomePartial", defaultMessage: "Partially completed" },
  toolOutcomeFailed: { id: "toolOutcomeFailed", defaultMessage: "Failed" },
  toolOutcomeRejected: { id: "toolOutcomeRejected", defaultMessage: "Rejected" },
  toolOutcomeCancelled: { id: "toolOutcomeCancelled", defaultMessage: "Cancelled" },
  toolOutcomeUnknown: { id: "toolOutcomeUnknown", defaultMessage: "Outcome unknown" },
}));
